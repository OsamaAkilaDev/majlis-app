import type { AuditList, ClubReport } from '@majlis/contracts';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/server-api';
import { requireUser } from '@/lib/session';
import { ClubReports } from '@/components/club/ClubReports';

export const metadata: Metadata = { title: 'Reports' };

export default async function ReportsPage({ params }: { params: Promise<{ clubId: string }> }) {
  const { clubId } = await params;
  const [user, report, audit] = await Promise.all([
    requireUser(),
    serverFetch<ClubReport>(`/clubs/${clubId}/reports`),
    serverFetch<AuditList>(`/clubs/${clubId}/audit`),
  ]);

  // Presentation only: `audit:read` is Lead alone, and the API refuses a Vice Lead regardless.
  const canAudit =
    user.platformRole === 'ADMIN' ||
    user.clubRoles.some((role) => role.clubId === clubId && role.role === 'LEAD');

  return (
    <ClubReports
      clubId={clubId}
      initialReport={report}
      initialAudit={audit}
      canAudit={canAudit}
    />
  );
}
