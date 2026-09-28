import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { truncateAll } from '../db';
import { mkAppointment, mkClub, mkUser, testDb } from '../factories';

const prisma = testDb();

afterAll(async () => { await prisma.$disconnect(); });
beforeEach(async () => { await truncateAll(prisma); });

describe('ClubTeamAppointment: one open appointment per (club, user, role)', () => {
  it('rejects a second INVITED row, and an INVITED row beside an ACTIVE one', async () => {
    const club = await mkClub();
    const user = await mkUser();
    await mkAppointment({ clubId: club.id, userId: user.id, role: 'VICE_LEAD', status: 'INVITED' });
    await expect(
      mkAppointment({ clubId: club.id, userId: user.id, role: 'VICE_LEAD', status: 'INVITED' }),
    ).rejects.toMatchObject({ code: 'P2002' });

    const other = await mkUser();
    await mkAppointment({ clubId: club.id, userId: other.id, role: 'CTO', status: 'ACTIVE' });
    await expect(
      mkAppointment({ clubId: club.id, userId: other.id, role: 'CTO', status: 'INVITED' }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  // Each of these catches an index missing one of its three columns.
  it('allows the same role for another user, another role for the same user, and another club', async () => {
    const [c1, c2] = [await mkClub(), await mkClub()];
    const [a, b] = [await mkUser(), await mkUser()];
    await mkAppointment({ clubId: c1.id, userId: a.id, role: 'MARKETING', status: 'INVITED' });

    await expect(mkAppointment({ clubId: c1.id, userId: b.id, role: 'MARKETING', status: 'INVITED' })).resolves.toBeDefined();
    await expect(mkAppointment({ clubId: c1.id, userId: a.id, role: 'CTO', status: 'INVITED' })).resolves.toBeDefined();
    await expect(mkAppointment({ clubId: c2.id, userId: a.id, role: 'MARKETING', status: 'INVITED' })).resolves.toBeDefined();
  });

  it('allows a new invitation once the previous row is closed', async () => {
    const club = await mkClub();
    const user = await mkUser();
    for (const status of ['DECLINED', 'EXPIRED', 'ENDED'] as const) {
      await mkAppointment({ clubId: club.id, userId: user.id, role: 'OPERATIONS', status });
    }
    await expect(
      mkAppointment({ clubId: club.id, userId: user.id, role: 'OPERATIONS', status: 'INVITED' }),
    ).resolves.toBeDefined();
  });
});
