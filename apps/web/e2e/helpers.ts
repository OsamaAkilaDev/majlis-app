import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

export const PASSWORD = 'Passw0rd!';

export const CLUB = 'robotics-club';

export async function signIn(page: Page, email: string) {
  // Cleared first: /login bounces a signed-in visitor, so switching persona never reaches the form.
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('University email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Without this, a caller that navigates straight after races the sign-in redirect.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'));
}

export async function axe(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}
