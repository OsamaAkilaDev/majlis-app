import type { AuditList, ClubReport } from '@majlis/contracts';
import { apiFetch } from './api';

export const clubReport = (clubId: string): Promise<ClubReport> =>
  apiFetch(`/clubs/${clubId}/reports`);

export const listAudit = (): Promise<AuditList> => apiFetch('/audit');

export const listClubAudit = (clubId: string): Promise<AuditList> =>
  apiFetch(`/clubs/${clubId}/audit`);
