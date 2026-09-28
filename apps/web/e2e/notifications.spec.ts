import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

const LONG_PASSWORD = 'a-long-enough-password';

/** Serial, and one project: the student half takes a seat on a seeded event. */
test.describe.configure({ mode: 'serial' });

// Playwright reads fixture names from this destructuring, so it cannot be a plain identifier.
// eslint-disable-next-line no-empty-pattern
test.beforeEach(async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'This walk mutates seeded state; once is enough.');
});

test('a registration reaches the inbox, badges the header bell, and marking it read clears both', async ({
  page,
}) => {
  // A fresh account, so the seat does not change what the a11y suite sees.
  await page.context().clearCookies();
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Inbox Student');
  await page.getByLabel('University email').fill(`inbox-${Date.now()}@uni.ac.ae`);
  await page.getByLabel('Password', { exact: true }).fill(LONG_PASSWORD);
  await page.getByLabel('Confirm password').fill(LONG_PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/events$/);

  // Catches a badge that renders the number visually and never announces it.
  const bell = page.getByRole('link', { name: /^Notifications/ });
  await expect(bell).toHaveAccessibleName('Notifications');

  await page.goto('/events/discover');
  await page.getByRole('link', { name: /Introduction to ROS 2/ }).click();
  await page.getByRole('button', { name: 'Register', exact: true }).click();
  await expect(page.getByText('Confirmed')).toBeVisible();

  // Written in the same transaction as the seat.
  await page.goto('/profile/notifications');
  const row = page.getByRole('listitem').filter({ hasText: 'Introduction to ROS 2' });
  await expect(row).toHaveText(/Registration confirmed/);
  // Unread is carried by more than a colour: the row announces it.
  await expect(row.getByText('Unread.')).toBeVisible();
  await expect(bell).toHaveAccessibleName('Notifications, 1 unread');

  // Without the rollback the row looks read forever and nothing says it did not save.
  await page.route('**/api/v1/me/notifications/*/read', (route) => route.abort('failed'));
  await row.getByRole('button', { name: /Mark .* read/ }).click();
  // By text, not by role: Next's route announcer is also role="alert".
  await expect(page.getByText('That did not save.')).toBeVisible();
  await expect(row.getByRole('button', { name: /Mark .* read/ })).toBeVisible();
  await expect(row.getByText('Unread.')).toBeVisible();

  await page.unroute('**/api/v1/me/notifications/*/read');
  await row.getByRole('button', { name: /Mark .* read/ }).click();

  // The badge following is the only proof the server took it.
  await expect(row.getByRole('button', { name: /Mark .* read/ })).toHaveCount(0);
  await expect(bell).toHaveAccessibleName('Notifications');

  await page.reload();
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Introduction to ROS 2' }).getByText('Unread.'),
  ).toHaveCount(0);
});

test('an admin reads the audit log', async ({ page }) => {
  await signIn(page, 'admin@uni.ac.ae');
  await expect(page).toHaveURL(/\/admin\/users$/);

  await page.goto('/admin/audit');
  await expect(page.getByRole('columnheader', { name: 'When (UTC)' })).toBeVisible();
  const rows = page.getByRole('row');
  expect(await rows.count()).toBeGreaterThan(1);
});

test('a club lead reads their own club report', async ({ page }) => {
  await signIn(page, 'lead@uni.ac.ae');
  await page.goto('/clubs/robotics-club/reports');

  await expect(page.getByRole('img', { name: /Attendance/ })).toBeVisible();
  await expect(page.getByText('Registrations')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Audit: this club/ })).toBeVisible();
});

test('forgot-password answers the same for a real address and an unknown one', async ({ page }) => {
  // The account-existence oracle: a seeded address and an unknown one must be indistinguishable.
  const said: string[] = [];
  for (const email of ['student@uni.ac.ae', `nobody-${Date.now()}@uni.ac.ae`]) {
    await page.context().clearCookies();
    await page.goto('/forgot-password');
    await page.getByLabel('University email').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    said.push((await page.getByRole('status').textContent()) ?? '');
  }
  expect(said[0]).toBe(said[1]);
  expect(said[0]).toContain('If that address has an account');
});

test('a reset link that is no longer valid is a dead end, in the API words', async ({ page }) => {
  // This 401 is not a dead session: bouncing to /login would discard the only message explaining why.
  await page.context().clearCookies();
  await page.goto('/reset-password?token=not-a-real-token');

  await expect(page.getByText('That password reset link is no longer valid.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
  await expect(page.getByLabel('New password')).toHaveCount(0);
  await expect(page).toHaveURL(/\/reset-password/);
});

test('the reset screen never puts the token in a form control', async ({ page }) => {
  // Controls and visible text only: the App Router serialises the query string into the RSC payload regardless.
  const token = 'a-token-that-should-never-be-rendered';
  await page.context().clearCookies();
  await page.goto(`/reset-password?token=${token}`);

  await expect(page.getByText('That password reset link is no longer valid.')).toBeVisible();

  const inControls = await page.evaluate(
    (t) =>
      [...document.querySelectorAll('input, textarea, select')].some(
        (el) => (el as HTMLInputElement).value === t,
      ),
    token,
  );
  expect(inControls).toBe(false);
  await expect(page.getByText(token)).toHaveCount(0);
});

test('a signed-in visitor is not bounced off a reset link', async ({ page }) => {
  // Requested on a phone, opened on a laptop still signed in: a bounce would leave no way to consume the token.
  await signIn(page, 'student@uni.ac.ae');

  await page.goto('/reset-password?token=a-token-from-another-device');

  await expect(page).toHaveURL(/\/reset-password/);
  await expect(page.getByText('That password reset link is no longer valid.')).toBeVisible();
});

test('a reset URL with no token at all goes back to the start of the flow', async ({ page }) => {
  // With no token field, a bare /reset-password could do nothing.
  await page.context().clearCookies();
  await page.goto('/reset-password');

  await expect(page).toHaveURL(/\/forgot-password$/);
  await expect(page.getByRole('button', { name: 'Send reset link' })).toBeVisible();
});

test('the sign-in form reaches the reset flow', async ({ page }) => {
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByRole('link', { name: 'Forgot password' }).click();
  await expect(page).toHaveURL(/\/forgot-password$/);
});
