import { expect, test } from '@playwright/test';
import { PASSWORD, signIn } from './helpers';

test('/ redirects an anonymous visitor to /login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
});

test('an admin lands on /admin', async ({ page }) => {
  await signIn(page, 'admin@uni.ac.ae');
  await expect(page).toHaveURL(/\/admin\/users$/);
});

test('a student lands on /events', async ({ page }) => {
  await signIn(page, 'student@uni.ac.ae');
  await expect(page).toHaveURL(/\/events$/);
});

test('a student is refused the admin console', async ({ page }) => {
  // Hiding the link is presentation, never protection, so this navigates directly.
  await signIn(page, 'student@uni.ac.ae');
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: /do not have access/i })).toBeVisible();
});

test('a wrong password reports on the field in the API words, and no shell renders', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('University email').fill('student@uni.ac.ae');
  await page.getByLabel('Password').fill('wrong-password-here');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The exact server string: a paraphrase drifts the moment either side is reworded.
  const password = page.getByLabel('Password');
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  await expect(password).toHaveAttribute('aria-invalid', 'true');
  const describedBy = await password.getAttribute('aria-describedby');
  expect(describedBy).toBeTruthy();
  await expect(page.locator(`#${describedBy}`)).toHaveText(/Email or password is incorrect\./);
  await expect(page).toHaveURL(/\/login$/);
});

test('a short password reports the rule the contract enforces, on the password field', async ({ page }) => {
  await page.goto('/signup');
  await expect(page.getByText('12+ characters')).toBeVisible();

  await page.getByLabel('Full name').fill('Too Short');
  await page.getByLabel('University email').fill(`short-${Date.now()}@uni.ac.ae`);
  // exact, here and below: getByLabel matches "Confirm password" on substring.
  await page.getByLabel('Password', { exact: true }).fill('Passw0rd!');
  await page.getByLabel('Confirm password').fill('Passw0rd!');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByText(/at least 12 characters/i)).toBeVisible();
  await expect(page).toHaveURL(/\/signup$/);
});

test('an existing account reports on the email field, not the password field', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Duplicate Student');
  await page.getByLabel('University email').fill('student@uni.ac.ae');
  await page.getByLabel('Password', { exact: true }).fill('a-long-enough-password');
  await page.getByLabel('Confirm password').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Catches a status map that sends every auth failure to the password field.
  await expect(page.getByLabel('University email')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Password', { exact: true })).not.toHaveAttribute(
    'aria-invalid',
    'true',
  );
  await expect(page.getByText('An account with this email already exists.')).toBeVisible();
});

test('a request that never reaches the server is reported on the form', async ({ page }) => {
  // A toast is missable and a silent failure reads as a broken button.
  await page.route('**/api/v1/auth/login', (route) => route.abort('failed'));
  await page.goto('/login');
  await page.getByLabel('University email').fill('student@uni.ac.ae');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Scoped to the form: Next's route announcer is also role="alert".
  await expect(page.locator('form').getByRole('alert')).toHaveText(/Could not reach the server/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled();
});

test('a new account can be created and lands in the student shell', async ({ page }) => {
  const email = `new-${Date.now()}@uni.ac.ae`;
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('New Student');
  await page.getByLabel('University email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a-long-enough-password');
  await page.getByLabel('Confirm password').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/events$/);
});

test('signing in on a phone viewport shows the tab bar', async ({ page }) => {
  // Pinned: the desktop project is above the breakpoint where the side nav replaces the tab bar.
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'student@uni.ac.ae');
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(nav).toBeVisible();
  const avatar = page.getByRole('link', { name: 'Profile' });

  await page.goto('/profile/registrations');
  await expect(avatar).toHaveAttribute('aria-current', 'page');
  // A stray /profile entry in TABS would light a tab here.
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(0);

  // The tab must stay a real 44px+ target, not squeezed by the dock's padding or safe-area offset.
  const tabHeight = await nav.getByRole('link', { name: 'Events', exact: true }).evaluate(
    (el) => el.getBoundingClientRect().height,
  );
  console.warn(`[tab-row-height] ${tabHeight}px at viewport ${page.viewportSize()?.width}x${page.viewportSize()?.height}`);
  expect(tabHeight).toBeGreaterThanOrEqual(44);
});

test('signing out ends the session', async ({ page }) => {
  // A fresh account, so no other test shares the session being ended.
  const email = `signout-${Date.now()}@uni.ac.ae`;
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Sign Out');
  await page.getByLabel('University email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('a-long-enough-password');
  await page.getByLabel('Confirm password').fill('a-long-enough-password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/events$/);

  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Landing on /login proves only a client navigation; this proves the cookie is gone.
  await page.goto('/events');
  await expect(page).toHaveURL(/\/login$/);
});

test('an officer lands in the student shell and is offered no console', async ({ page }) => {
  // lead@ holds a club role and still gets no console: "Switch to" is not rendered at all.
  await signIn(page, 'lead@uni.ac.ae');
  await expect(page).toHaveURL(/\/events$/);

  await page.goto('/profile');
  // Waited for first, or the absence below passes on a page that rendered nothing.
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Switch to', exact: true })).toHaveCount(0);
});

test('/login and /signup reach each other', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await page.getByRole('link', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('signup refuses a mistyped confirmation without ever calling the API', async ({ page }) => {
  // The contract carries one password field, so the check must be in the browser. Counting requests proves it never submits.
  let calls = 0;
  await page.route('**/api/v1/auth/signup', (route) => {
    calls += 1;
    return route.abort('failed');
  });

  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Typo Student');
  await page.getByLabel('University email').fill(`typo-${Date.now()}@uni.ac.ae`);
  await page.getByLabel('Password', { exact: true }).fill('a-long-enough-password');
  await page.getByLabel('Confirm password').fill('a-long-enough-passwodr');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Both passwords must match.')).toBeVisible();
  await expect(page.getByLabel('Confirm password')).toHaveAttribute('aria-invalid', 'true');
  expect(calls).toBe(0);
});
