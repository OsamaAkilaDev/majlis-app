import { PrismaClient } from '../src/generated/prisma/client';
import { pgAdapter } from '../src/prisma/pg-adapter';

// Every write is an upsert on a natural key, so a rerun restores each row to its declared state. Prisma 7 does not run this automatically.

// Shared by every seeded persona.
const SEED_PASSWORD = 'Passw0rd!';

const hours = (n: number) => new Date(Date.now() + n * 3_600_000);

/** Restores a seeded registration's status, since an earlier suite run may have moved it. CANCELLED rows are left
 * behind: the one-open-per-user index allows a fresh row beside them. */
async function seedRegistration(
  prisma: PrismaClient,
  eventId: string,
  userId: string,
  status: 'CONFIRMED' | 'CHECKED_IN',
) {
  const existing = await prisma.eventRegistration.findFirst({
    where: { eventId, userId, status: { not: 'CANCELLED' } },
  });
  if (!existing) return prisma.eventRegistration.create({ data: { eventId, userId, status } });
  if (existing.status === status) return existing;
  return prisma.eventRegistration.update({ where: { id: existing.id }, data: { status } });
}

export async function seed(prisma: PrismaClient): Promise<void> {
  const people = [
    { email: 'admin@uni.ac.ae', fullName: 'Amina Al Marri', platformRole: 'ADMIN' as const },
    { email: 'lead@uni.ac.ae', fullName: 'Yousef Rahman', platformRole: 'STUDENT' as const },
    { email: 'ops@uni.ac.ae', fullName: 'Sara Khalid', platformRole: 'STUDENT' as const },
    { email: 'student@uni.ac.ae', fullName: 'Layla Hassan', platformRole: 'STUDENT' as const },
  ];

  const users: Record<string, string> = {};
  for (const person of people) {
    const user = await prisma.user.upsert({
      where: { email: person.email },
      update: { fullName: person.fullName, platformRole: person.platformRole, password: SEED_PASSWORD },
      create: { ...person, password: SEED_PASSWORD },
    });
    users[person.email] = user.id;
  }

  const department = await prisma.department.upsert({
    where: { code: 'ENG' },
    update: { name: 'Engineering' },
    create: { code: 'ENG', name: 'Engineering', description: 'Engineering faculty.' },
  });

  const club = await prisma.club.upsert({
    where: { slug: 'robotics-club' },
    update: {},
    create: {
      departmentId: department.id,
      name: 'Robotics Club',
      slug: 'robotics-club',
      description: 'Building and competing with autonomous robots.',
      category: 'Technology',
      academicYear: '2026/2027',
      logoUrl: 'https://placehold.co/512x512/png?text=RC',
      membershipPolicy: 'APPROVAL_REQUIRED',
    },
  });

  // A club nobody can self-join, so the a11y suite always has a disabled join control to scan.
  await prisma.club.upsert({
    where: { slug: 'chess-club' },
    update: { membershipPolicy: 'CLOSED' },
    create: {
      departmentId: department.id,
      name: 'Chess Club',
      slug: 'chess-club',
      description: 'Weekly rapid and blitz.',
      category: 'Games',
      academicYear: '2026/2027',
      logoUrl: 'https://placehold.co/512x512/png?text=CC',
      membershipPolicy: 'CLOSED',
    },
  });

  // A guarded create, not an upsert: the one-active-Lead partial index would reject a second run.
  for (const [email, role] of [
    ['lead@uni.ac.ae', 'LEAD'],
    ['ops@uni.ac.ae', 'OPERATIONS'],
  ] as const) {
    const existing = await prisma.clubTeamAppointment.findFirst({
      where: { clubId: club.id, userId: users[email]!, role, status: 'ACTIVE' },
    });
    if (!existing) {
      await prisma.clubTeamAppointment.create({
        data: {
          clubId: club.id,
          userId: users[email]!,
          role,
          status: 'ACTIVE',
          invitedById: users['admin@uni.ac.ae']!,
          acceptedAt: new Date(),
        },
      });
    }

    // Team members hold an ordinary membership too, as a separate record.
    const membership = await prisma.clubMembership.findFirst({
      where: { clubId: club.id, userId: users[email]!, status: 'ACTIVE' },
    });
    if (!membership) {
      await prisma.clubMembership.create({
        data: { clubId: club.id, userId: users[email]!, status: 'ACTIVE', decidedAt: new Date() },
      });
    }
  }

  // Used for both upsert branches: the concurrency tests depend on this capacity, and an empty `update` never restores it.
  const event = {
    title: 'Introduction to ROS 2',
    summary: 'A hands-on first session with the Robot Operating System.',
    description: 'Bring a laptop. No prior robotics experience required.',
    eventType: 'WORKSHOP',
    audience: 'ALL_STUDENTS',
    venue: 'Engineering Building, Lab 2.14',
    startsAt: hours(48),
    endsAt: hours(51),
    registrationOpensAt: hours(-24),
    registrationClosesAt: hours(46),
    capacity: 30,
    waitlistEnabled: true,
    certificateEnabled: true,
    certificateTitle: 'Certificate of Attendance: Introduction to ROS 2',
    certificateSignatory: 'Head of Engineering',
    status: 'PUBLISHED',
  } as const;

  await prisma.event.upsert({
    where: { clubId_slug: { clubId: club.id, slug: 'intro-to-ros' } },
    update: event,
    create: {
      ...event,
      clubId: club.id,
      slug: 'intro-to-ros',
      createdById: users['lead@uni.ac.ae']!,
    },
  });

  // An event nobody can register for (capacity one, taken, no waitlist), so the a11y suite has a disabled control to scan.
  const full = {
    ...event,
    title: 'Robotics Showcase',
    summary: 'The term-end demonstration of every team project.',
    description: 'Seats are limited to the demonstration floor.',
    eventType: 'SHOWCASE',
    venue: 'Engineering Building, Atrium',
    capacity: 1,
    confirmedCount: 1,
    waitlistEnabled: false,
    certificateEnabled: false,
    certificateTitle: null,
  };

  const showcase = await prisma.event.upsert({
    where: { clubId_slug: { clubId: club.id, slug: 'robotics-showcase' } },
    update: full,
    create: {
      ...full,
      clubId: club.id,
      slug: 'robotics-showcase',
      createdById: users['lead@uni.ac.ae']!,
    },
  });

  // The one seat, held.
  await seedRegistration(prisma, showcase.id, users['lead@uni.ac.ae']!, 'CONFIRMED');

  // Two clocks the product cannot produce: one event running now, one long finished.
  // Seeded PUBLISHED so the lazy lifecycle computes the status on screen.
  const ongoing = {
    ...event,
    title: 'Drone Build Night',
    summary: 'Assemble and fly a micro quadcopter.',
    description: 'Parts provided. Doors open at the start time.',
    eventType: 'WORKSHOP',
    venue: 'Engineering Building, Hangar',
    startsAt: hours(-1),
    endsAt: hours(2),
    registrationOpensAt: hours(-48),
    registrationClosesAt: hours(-2),
    confirmedCount: 1,
    certificateEnabled: false,
    certificateTitle: null,
  };

  const tonight = await prisma.event.upsert({
    where: { clubId_slug: { clubId: club.id, slug: 'drone-build-night' } },
    update: { ...ongoing, status: 'PUBLISHED' },
    create: {
      ...ongoing,
      clubId: club.id,
      slug: 'drone-build-night',
      createdById: users['lead@uni.ac.ae']!,
    },
  });

  // Back to CONFIRMED even if an earlier run checked it in: this is the registration the check-in walk uses.
  await seedRegistration(prisma, tonight.id, users['student@uni.ac.ae']!, 'CONFIRMED');

  const finished = {
    ...event,
    title: 'Line Follower Sprint',
    summary: 'A one-evening race between self-built line followers.',
    description: 'Track time is allocated on arrival.',
    eventType: 'COMPETITION',
    venue: 'Engineering Building, Lab 1.02',
    startsAt: hours(-75),
    endsAt: hours(-72),
    registrationOpensAt: hours(-120),
    registrationClosesAt: hours(-76),
    confirmedCount: 1,
    certificateEnabled: true,
    certificateTitle: 'Certificate of Attendance: Line Follower Sprint',
    certificateSignatory: 'Head of Engineering',
  };

  const past = await prisma.event.upsert({
    where: { clubId_slug: { clubId: club.id, slug: 'line-follower-sprint' } },
    // No status: putting a CERTIFIED event back to PUBLISHED on reseed would strand its certificates.
    update: finished,
    create: {
      ...finished,
      clubId: club.id,
      slug: 'line-follower-sprint',
      status: 'PUBLISHED',
      createdById: users['lead@uni.ac.ae']!,
    },
  });

  // CHECKED_IN with its attendance record, so it is certificate eligible and in a state the product can produce.
  const attended = await seedRegistration(prisma, past.id, users['student@uni.ac.ae']!, 'CHECKED_IN');
  await prisma.attendanceRecord.upsert({
    where: { registrationId: attended.id },
    update: {},
    create: {
      registrationId: attended.id,
      eventId: past.id,
      userId: users['student@uni.ac.ae']!,
      checkedInById: users['ops@uni.ac.ae']!,
      checkedInAt: hours(-74.5),
      method: 'MANUAL',
    },
  });
}

/** Every seeded account shares one public password, so this must never reach a real database. */
export function assertSafeToSeed(url: string, env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed: NODE_ENV is production.');
  }

  const { hostname } = new URL(url);
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';

  if (!isLocal && env.ALLOW_REMOTE_SEED !== 'yes') {
    throw new Error(
      `Refusing to seed the non-local database at ${hostname}. ` +
        'Set ALLOW_REMOTE_SEED=yes if that is genuinely what you want.',
    );
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set.');
  assertSafeToSeed(url, process.env);

  const prisma = new PrismaClient({ adapter: pgAdapter(url) });
  try {
    await seed(prisma);
    console.error('Seed complete.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main();
}
