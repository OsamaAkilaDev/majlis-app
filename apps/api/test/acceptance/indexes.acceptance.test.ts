import { afterAll, describe, expect, it } from 'vitest';
import { testDb } from '../factories';

const prisma = testDb();

afterAll(async () => {
  await prisma.$disconnect();
});

/** Leading columns of every index on the table, e.g. ['club_id', 'status']. */
async function indexedPrefixes(table: string): Promise<string[][]> {
  const rows = await prisma.$queryRaw<{ columns: string[] }[]>`
    SELECT array_agg(a.attname::text ORDER BY k.ord) AS columns
    FROM pg_index i
    JOIN pg_class t ON t.oid = i.indrelid
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE t.relname = ${table}
    GROUP BY i.indexrelid`;
  return rows.map((r) => r.columns);
}

describe('the lookups every screen makes have an index to use', () => {
  it.each([
    ['club', 'department_id'],
    ['event', 'ends_at'],
    ['event_registration', 'user_id'],
    ['club_membership', 'user_id'],
    ['club_team_appointment', 'user_id'],
    ['attendance_record', 'event_id'],
    ['certificate', 'user_id'],
    ['certificate', 'event_id'],
    ['audit_log', 'entity_type'],
  ])('%s.%s leads an index', async (table, column) => {
    const prefixes = await indexedPrefixes(table);

    expect(
      prefixes.some((cols) => cols[0] === column),
      `${table}(${column}) has no index`,
    ).toBe(true);
  });
});
