import { expect, test, type Page } from '@playwright/test';
import { CLUB, PASSWORD, axe, signIn } from './helpers';

async function openEventEditor(page: Page, title: string) {
  await page.goto(`/clubs/${CLUB}`);
  await page.getByRole('link', { name: new RegExp(title) }).first().click();
  // The editor's first compile under `next dev` outlasts a 30s test, so wait for the form itself.
  test.setTimeout(90_000);
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.locator('main form').waitFor({ timeout: 60_000 });
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      // next-themes follows the OS preference only when chosen, so the theme is set explicitly.
      await page.addInitScript((chosen) => window.localStorage.setItem('theme', chosen), theme);
    });

    test('actually renders in this theme', async ({ page }) => {
      // Without this the dark scans silently become a second light run, and axe passes either way.
      await page.goto('/login');
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
    });

    test('login has no violations', async ({ page }) => {
      await page.goto('/login');
      await axe(page);
    });

    test('signup has no violations', async ({ page }) => {
      // The only form with a constraint on a label and a segment meter, both on the auth ground.
      await page.goto('/signup');
      await expect(page.getByText('12+ characters')).toBeVisible();
      await axe(page);
    });

    test('a failed sign-in has no violations', async ({ page }) => {
      // A scan of the pristine form renders neither the error colours nor their aria wiring.
      await page.goto('/login');
      await page.getByLabel('University email').fill('student@uni.ac.ae');
      await page.getByLabel('Password').fill('wrong-password-here');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
      await axe(page);
    });

    test('student shell has no violations', async ({ page }) => {
      await signIn(page, 'student@uni.ac.ae');
      await axe(page);
    });

    test('the officer club page and its Manage sheet have no violations', async ({ page }) => {
      // The officer-only surfaces: a filled action row and a modal sheet of colour on colour.
      await signIn(page, 'lead@uni.ac.ae');
      await page.goto(`/clubs/${CLUB}`);
      await expect(page.getByRole('link', { name: 'New event' })).toBeVisible();
      await axe(page);

      await page.getByRole('button', { name: /^Manage/ }).click();
      await expect(page.getByRole('dialog').getByRole('link', { name: 'Team' })).toBeVisible();
      await axe(page);
    });

    test('admin console has no violations', async ({ page }) => {
      await signIn(page, 'admin@uni.ac.ae');
      await axe(page);
    });

    test('an authorization refusal page has no violations', async ({ page }) => {
      // Catches a refusal page with no main landmark.
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/admin/users');
      await expect(page.getByRole('heading', { name: /do not have access/i })).toBeVisible();
      await axe(page);
    });

    test("the viewer's own events have no violations", async ({ page }) => {
      // Anchored on Past and Line Follower Sprint, which the seed fixes in the past; Drone Build Night
      // crosses into Past two hours after seeding and empties the Registered group.
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/events');
      await expect(page.getByRole('heading', { name: 'Past' })).toBeVisible();
      await expect(page.getByRole('link', { name: /Line Follower Sprint/ })).toBeVisible();
      await axe(page);
    });

    test("the viewer's own clubs have no violations", async ({ page }) => {
      // The Lead: a role chip, colour on colour, never renders for a viewer who belongs to nothing.
      await signIn(page, 'lead@uni.ac.ae');
      await page.goto('/clubs');
      await expect(page.getByRole('heading', { name: 'Your clubs' })).toBeVisible();
      await axe(page);
    });

    test('the club directory has no violations', async ({ page }) => {
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/clubs/discover');
      await expect(page.getByRole('link', { name: /Robotics Club/ })).toBeVisible();
      await axe(page);
    });

    test('a club detail with an actionable join control has no violations', async ({ page }) => {
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/clubs/robotics-club');
      await expect(page.getByRole('button', { name: 'Request to join' })).toBeEnabled();
      await axe(page);
    });

    test('a club detail with a refused join control has no violations', async ({ page }) => {
      // A disabled control needs an accessible name carrying the reason, or the refusal exists only in the layout.
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/clubs/chess-club');
      await expect(
        page.getByRole('button', { name: 'This club is not accepting members' }),
      ).toBeDisabled();
      await axe(page);
    });

    test('the event directory has no violations', async ({ page }) => {
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/events/discover');
      await expect(page.getByRole('link', { name: /Introduction to ROS 2/ })).toBeVisible();
      await axe(page);
    });

    test('an event detail with an actionable register control has no violations', async ({ page }) => {
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/events/discover');
      await page.getByRole('link', { name: /Introduction to ROS 2/ }).click();
      await expect(page.getByRole('button', { name: 'Register', exact: true })).toBeEnabled();
      await axe(page);
    });

    test('an event detail with a refused register control has no violations', async ({ page }) => {
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/events/discover');
      await page.getByRole('link', { name: /Robotics Showcase/ }).click();
      await expect(
        page.getByRole('button', { name: 'This event is full and has no waitlist' }),
      ).toBeDisabled();
      await axe(page);
    });

    test('the student registrations page has no violations', async ({ page }) => {
      // Rows, not the empty state. Line Follower Sprint for the same reason as the events scan above.
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/profile/registrations');
      await expect(page.getByRole('link', { name: /Line Follower Sprint/ })).toBeVisible();
      await axe(page);
    });

    test('the student profile page has no violations', async ({ page }) => {
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/profile');
      await expect(page.getByRole('link', { name: /Registrations$/ })).toBeVisible();
      // The identity banner is the only text on its tinted ground.
      await expect(page.getByRole('group', { name: 'Theme' })).toBeVisible();
      await axe(page);
    });

    test('admin departments has no violations', async ({ page }) => {
      await signIn(page, 'admin@uni.ac.ae');
      await page.goto('/admin/departments');
      await axe(page);
    });

    test('the admin club creation form has no violations', async ({ page }) => {
      await signIn(page, 'admin@uni.ac.ae');
      await page.goto('/admin/clubs/new');
      await axe(page);
    });

    test("the club's event list has no violations", async ({ page }) => {
      await signIn(page, 'lead@uni.ac.ae');
      await page.goto(`/clubs/${CLUB}`);
      await expect(page.getByRole('link', { name: /Introduction to ROS 2/ })).toBeVisible();
      await axe(page);
    });

    test('the event editor has no violations', async ({ page }) => {
      await signIn(page, 'lead@uni.ac.ae');
      await openEventEditor(page, 'Introduction to ROS 2');
      await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
      await axe(page);
    });

    test('an event editor with fields the viewer may not change has no violations', async ({ page }) => {
      // Operations holds venue and capacity but not the title: the only scan covering a disabled input.
      await signIn(page, 'ops@uni.ac.ae');
      await openEventEditor(page, 'Introduction to ROS 2');
      await expect(page.getByLabel('Title', { exact: true })).toBeDisabled();
      await expect(page.getByLabel('Capacity')).toBeEnabled();
      await axe(page);
    });

    test('the admin event overview has no violations', async ({ page }) => {
      await signIn(page, 'admin@uni.ac.ae');
      await page.goto('/admin/events');
      await expect(page.getByRole('link', { name: 'Introduction to ROS 2' })).toBeVisible();
      await axe(page);
    });

    test('the password reset request form has no violations', async ({ page }) => {
      await page.goto('/forgot-password');
      await axe(page);
    });

    test('a spent reset link has no violations', async ({ page }) => {
      // The raw token exists only in an inbox, so this scans the state a bad link lands on.
      await page.goto('/reset-password?token=whatever');
      await expect(page.getByRole('link', { name: 'Request a new link' })).toBeVisible();
      await axe(page);
    });

    test('the student inbox has no violations', async ({ page }) => {
      await signIn(page, 'student@uni.ac.ae');
      await page.goto('/profile/notifications');
      await expect(page.getByRole('button', { name: 'Unread' })).toBeVisible();
      await axe(page);
    });

    test('the admin user list has no violations', async ({ page }) => {
      await signIn(page, 'admin@uni.ac.ae');
      await page.goto('/admin/users');
      await expect(page.getByRole('columnheader', { name: 'Name' })).toBeVisible();
      await axe(page);
    });

    test('the admin audit log has no violations', async ({ page }) => {
      await signIn(page, 'admin@uni.ac.ae');
      await page.goto('/admin/audit');
      await expect(page.getByRole('columnheader', { name: 'When (UTC)' })).toBeVisible();
      await axe(page);
    });

    test('a club report has no violations', async ({ page }) => {
      await signIn(page, 'lead@uni.ac.ae');
      await page.goto(`/clubs/${CLUB}/reports`);
      await expect(page.getByRole('img', { name: /Attendance/ })).toBeVisible();
      await axe(page);
    });
  });
}

test('sign-in is reachable by keyboard alone', async ({ page }) => {
  // Catches a control that is clickable but not focusable, which every mouse-driven check passes.
  await page.goto('/login');
  await page.keyboard.press('Tab'); // skip link
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.getByLabel('University email').focus();
  await page.keyboard.type('student@uni.ac.ae');
  await page.keyboard.press('Tab');
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/events$/);
});

test('the header pair name themselves and announce which one is lit', async ({ page }) => {
  // Both are icon-only, so the name is an aria-label and the lit state is colour alone without aria-current.
  await signIn(page, 'student@uni.ac.ae');
  const bell = page.getByRole('link', { name: /^Notifications/ });
  const avatar = page.getByRole('link', { name: 'Profile' });

  await expect(bell).toBeVisible();
  await expect(avatar).toBeVisible();
  await expect(bell).not.toHaveAttribute('aria-current', 'page');
  await expect(avatar).not.toHaveAttribute('aria-current', 'page');

  await avatar.click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(avatar).toHaveAttribute('aria-current', 'page');
  // Exactly one of the pair is ever lit, and the bell is not it here.
  await expect(bell).not.toHaveAttribute('aria-current', 'page');

  await bell.click();
  await expect(page).toHaveURL(/\/profile\/notifications$/);
  await expect(bell).toHaveAttribute('aria-current', 'page');
  await expect(avatar).not.toHaveAttribute('aria-current', 'page');
  // The title streams in after a client navigation; axe on the URL change alone flags a late document-title.
  await expect(page).toHaveTitle(/Inbox/);
  await axe(page);
});

test('the event creation panel has no violations while open', async ({ page }) => {
  // The largest form, and the only Select built from the runtime's whole tz database.
  await signIn(page, 'lead@uni.ac.ae');
  await page.goto(`/clubs/${CLUB}/events/new`);
  await expect(page.getByRole('button', { name: 'Create event' })).toBeVisible();
  await axe(page);
});

test('the admin override dialog has no violations while open', async ({ page }) => {
  // A modal is where focus management and aria-hidden break.
  await signIn(page, 'admin@uni.ac.ae');
  await page.goto('/admin/events');
  await page.getByRole('button', { name: 'Register someone for Introduction to ROS 2' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await axe(page);
});

test('the student shell swaps the tab bar for a side nav above the breakpoint', async ({ page }) => {
  // Two would mean both navigations rendered at once, announcing every destination twice.
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'student@uni.ac.ae');

  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole('link', { name: 'Events' })).toBeVisible();

  // Catches a shell that keeps the tab bar and merely adds an empty sidebar.
  const box = await nav.boundingBox();
  expect(box!.width).toBeLessThan(1440 / 2);
  expect(box!.y).toBeLessThan(900 / 2);
  await axe(page);
});

test('the student shell keeps the tab bar below the breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'student@uni.ac.ae');

  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(nav).toHaveCount(1);

  // Across the foot, and a dock inset from both sides with clear space under it. An edge-to-edge bar is 390 wide and ends at 844.
  const box = await nav.boundingBox();
  expect(box!.y).toBeGreaterThan(844 / 2);
  expect(box!.width).toBeLessThan(390);
  expect(box!.width).toBeGreaterThan(280);
  expect(box!.x).toBeCloseTo(390 - (box!.x + box!.width), 0);
  expect(box!.y + box!.height).toBeLessThan(844);
  await axe(page);
});

test('a console shows its side nav and no hamburger above the breakpoint', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'admin@uni.ac.ae');

  await expect(page.getByRole('button', { name: 'Open navigation' })).toBeHidden();
  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(nav).toHaveCount(1);
  await expect(nav.getByRole('link', { name: 'Clubs' })).toBeVisible();
  await axe(page);
});

test('a deep route keeps its section lit in the desktop side nav', async ({ page }) => {
  // Catches an exact path match, which lights nothing on a club page.
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, 'student@uni.ac.ae');
  await page.goto('/clubs/robotics-club');

  const nav = page.getByRole('navigation', { name: 'Sections' });
  await expect(nav.getByRole('link', { name: 'Clubs' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link', { name: 'Events' })).not.toHaveAttribute('aria-current', 'page');
});

test('the console navigation sheet has no violations while open', async ({ page }) => {
  // A modal sheet is where focus management and aria-hidden break.
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, 'admin@uni.ac.ae');
  // /admin redirects to /admin/users and signIn only waits for "not /login", so wait out the redirect before scanning.
  await page.waitForURL(/\/admin\/users$/);
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await axe(page);
});

test('a dialog stays centred for the whole of its open animation', async ({ page }) => {
  // Sampled during the animation, never after. Tailwind v4 compiles `-translate-x-1/2` to the `translate` property,
  // so a keyframe `transform: translate(-50%, -50%)` composes with it and the dialog enters off-centre, then snaps.
  await signIn(page, 'admin@uni.ac.ae');
  await page.waitForURL(/\/admin\/users$/);
  await page.getByRole('button', { name: /Suspend|Reactivate/ }).first().click();

  const dialog = page.getByRole('dialog');
  const viewport = page.viewportSize()!;
  const offsets: number[] = [];

  for (let i = 0; i < 12; i++) {
    const box = await dialog.boundingBox();
    if (box) offsets.push(Math.abs(box.x + box.width / 2 - viewport.width / 2));
    await page.waitForTimeout(16);
  }

  expect(offsets.length).toBeGreaterThan(6);
  expect(Math.max(...offsets)).toBeLessThan(4);
});
