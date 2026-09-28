import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from '../db';
import { anEvent as eventSeed, at, mkClub, mkUser, testDb, type EventSeed } from '../factories';

const prisma = testDb();

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await truncateAll(prisma); });

// Hour-scale window so single-field overrides can cross it; `status` dropped to test the default.
async function anEvent(over: Partial<EventSeed> = {}) {
  const clubId = over.clubId ?? (await mkClub()).id;
  const creator = await mkUser();
  const { status: _status, ...data } = eventSeed(clubId, creator.id, {
    startsAt: at(24),
    endsAt: at(26),
    registrationOpensAt: at(1),
    registrationClosesAt: at(23),
    capacity: 2,
    ...over,
  });
  return prisma.event.create({ data });
}

describe('Event', () => {
  it('is DRAFT on creation with a zero confirmed count', async () => {
    const event = await anEvent();
    expect(event.status).toBe('DRAFT');
    expect(event.confirmedCount).toBe(0);
    expect(event.attendancePolicy).toBe('CHECK_IN_ONLY');
  });

  it('defaults the timezone to Asia/Dubai', async () => {
    expect((await anEvent()).timezone).toBe('Asia/Dubai');
  });

  it('rejects a confirmed count above capacity', async () => {
    const event = await anEvent({ capacity: 2 });
    await expect(
      prisma.event.update({ where: { id: event.id }, data: { confirmedCount: 3 } }),
    ).rejects.toThrow(/event_capacity_bounds/);
  });

  it('rejects an event created with zero capacity', async () => {
    // The third conjunct of event_capacity_bounds; the other capacity tests vary the counter.
    await expect(anEvent({ capacity: 0 })).rejects.toThrow(/event_capacity_bounds/);
  });

  it('allows registration to close exactly when the event ends', async () => {
    // Tells <= from <. One hoisted constant, since two at() calls can straddle a millisecond.
    const boundary = at(26);
    await expect(anEvent({ registrationClosesAt: boundary, endsAt: boundary })).resolves.toBeDefined();
  });

  it('rejects a negative confirmed count', async () => {
    const event = await anEvent();
    await expect(
      prisma.event.update({ where: { id: event.id }, data: { confirmedCount: -1 } }),
    ).rejects.toThrow(/event_capacity_bounds/);
  });

  it('rejects an event that ends before it starts', async () => {
    await expect(anEvent({ startsAt: at(30), endsAt: at(29) })).rejects.toThrow(/event_time_window/);
  });

  it('rejects a registration window that closes before it opens', async () => {
    await expect(anEvent({ registrationOpensAt: at(20), registrationClosesAt: at(19) }))
      .rejects.toThrow(/event_registration_window/);
  });

  it('rejects registration closing after the event ends', async () => {
    await expect(anEvent({ registrationClosesAt: at(40) })).rejects.toThrow(/event_registration_window/);
  });

  it('scopes slug uniqueness to the club, so two clubs may both run "orientation"', async () => {
    const [c1, c2] = [await mkClub(), await mkClub()];
    await anEvent({ clubId: c1.id, slug: 'orientation' });
    await expect(anEvent({ clubId: c2.id, slug: 'orientation' })).resolves.toBeDefined();
  });

  it('rejects a duplicate slug within one club', async () => {
    const club = await mkClub();
    await anEvent({ clubId: club.id, slug: 'orientation' });
    await expect(anEvent({ clubId: club.id, slug: 'orientation' }))
      .rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('EventRegistration: one open registration per (user, event)', () => {
  async function register(eventId: string, userId: string, status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED' | 'REMOVED' | 'NO_SHOW') {
    return prisma.eventRegistration.create({ data: { eventId, userId, status } });
  }

  it('scopes the rule per user and per event', async () => {
    // Catches an index on (event_id) or (user_id) alone.
    const event = await anEvent();
    const [a, b] = [await mkUser(), await mkUser()];
    await register(event.id, a.id, 'CONFIRMED');

    // a different student may register for the same event
    await expect(register(event.id, b.id, 'CONFIRMED')).resolves.toBeDefined();

    // and the same student may register for a different event
    const other = await anEvent();
    await expect(register(other.id, a.id, 'CONFIRMED')).resolves.toBeDefined();
  });

  it('rejects a second CONFIRMED registration', async () => {
    const event = await anEvent();
    const user = await mkUser();
    await register(event.id, user.id, 'CONFIRMED');
    await expect(register(event.id, user.id, 'CONFIRMED')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('rejects a WAITLISTED row when the student is already CONFIRMED', async () => {
    const event = await anEvent();
    const user = await mkUser();
    await register(event.id, user.id, 'CONFIRMED');
    await expect(register(event.id, user.id, 'WAITLISTED')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('allows re-registration after cancelling, preserving the cancelled row', async () => {
    const event = await anEvent();
    const user = await mkUser();
    await register(event.id, user.id, 'CANCELLED');
    await expect(register(event.id, user.id, 'CONFIRMED')).resolves.toBeDefined();
    expect(await prisma.eventRegistration.count()).toBe(2);
  });

  it('blocks a REMOVED student from re-registering themselves', async () => {
    const event = await anEvent();
    const user = await mkUser();
    await register(event.id, user.id, 'REMOVED');
    await expect(register(event.id, user.id, 'CONFIRMED')).rejects.toMatchObject({ code: 'P2002' });
  });

  it('blocks re-registration after a NO_SHOW', async () => {
    const event = await anEvent();
    const user = await mkUser();
    await register(event.id, user.id, 'NO_SHOW');
    await expect(register(event.id, user.id, 'CONFIRMED')).rejects.toMatchObject({ code: 'P2002' });
  });
});

describe('EventAssignment', () => {
  it('lets a Lead grant duties for one event without a standing appointment', async () => {
    const event = await anEvent();
    const [member, lead] = [await mkUser(), await mkUser()];
    const assignment = await prisma.eventAssignment.create({
      data: { eventId: event.id, userId: member.id, responsibility: 'OPERATIONS', assignedById: lead.id },
    });
    expect(assignment.responsibility).toBe('OPERATIONS');
  });

  it('rejects the same person being assigned the same responsibility twice', async () => {
    const event = await anEvent();
    const [member, lead] = [await mkUser(), await mkUser()];
    const data = { eventId: event.id, userId: member.id, responsibility: 'OPERATIONS' as const, assignedById: lead.id };
    await prisma.eventAssignment.create({ data });
    await expect(prisma.eventAssignment.create({ data })).rejects.toMatchObject({ code: 'P2002' });
  });

  it('scopes the rule per (event, responsibility): one person can hold two responsibilities on one event, and be assigned across two events', async () => {
    // Only a user x event x responsibility matrix tells a two-column index from a one-column one.
    const event = await anEvent();
    const [member, lead] = [await mkUser(), await mkUser()];
    await prisma.eventAssignment.create({
      data: { eventId: event.id, userId: member.id, responsibility: 'OPERATIONS', assignedById: lead.id },
    });
    await expect(
      prisma.eventAssignment.create({
        data: { eventId: event.id, userId: member.id, responsibility: 'MARKETING', assignedById: lead.id },
      }),
    ).resolves.toBeDefined();

    const otherEvent = await anEvent();
    await expect(
      prisma.eventAssignment.create({
        data: { eventId: otherEvent.id, userId: member.id, responsibility: 'OPERATIONS', assignedById: lead.id },
      }),
    ).resolves.toBeDefined();
  });
});
