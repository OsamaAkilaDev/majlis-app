import { expect, test } from '@playwright/test';
import { CLUB, signIn } from './helpers';

/** Anchored on seed rows that do not move with the clock: lead@ leads Robotics Club, student@ holds no club role. */

test('a Lead reaches Members from their own club page, through the Manage sheet', async ({
  page,
}) => {
  await signIn(page, 'lead@uni.ac.ae');
  await expect(page).toHaveURL(/\/events$/);

  await page.goto('/clubs');
  // Scoped to the row, or this passes on any "Lead" text on the screen.
  const row = page.getByRole('link', { name: /Robotics Club/ });
  await expect(row).toContainText('Lead');
  await row.click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB}$`));

  await page.getByRole('button', { name: /^Manage/ }).click();
  const sheet = page.getByRole('dialog');
  // Exactly a Lead's four sections. Certificates is absent: certificate:manage carries no club role.
  for (const label of ['Edit club', 'Members', 'Team', 'Reports']) {
    await expect(sheet.getByRole('link', { name: label })).toBeVisible();
  }
  await expect(sheet.getByRole('link', { name: 'Certificates' })).toHaveCount(0);

  await sheet.getByRole('link', { name: 'Members' }).click();
  await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB}/members$`));
  await expect(page.getByRole('heading', { name: 'Requests', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Members', level: 2 })).toBeVisible();
});

test('the Manage sheet is reachable and dismissable by keyboard alone', async ({ page }) => {
  // A sheet that opens only to a pointer passes every click-based assertion.
  await signIn(page, 'lead@uni.ac.ae');
  await page.goto(`/clubs/${CLUB}`);

  await page.getByRole('button', { name: /^Manage/ }).focus();
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible();

  // Focus must be inside the sheet; Radix focuses the content element itself when nothing is autofocused.
  expect(await sheet.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('a student sees the club page with no officer control on it at all', async ({ page }) => {
  // Without this, a Manage button rendered for everybody would pass the walk above.
  await signIn(page, 'student@uni.ac.ae');
  await page.goto(`/clubs/${CLUB}`);

  // Waited for first, or the absences below pass on a page that rendered nothing.
  await expect(page.getByRole('heading', { name: 'Robotics Club', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Manage/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New event' })).toHaveCount(0);

  // The routes themselves, which is protection rather than presentation.
  for (const path of ['members', 'team', 'reports', 'edit', 'events/new']) {
    await page.goto(`/clubs/${CLUB}/${path}`);
    await expect(page).toHaveURL(new RegExp(`/clubs/${CLUB}$`));
  }
});
