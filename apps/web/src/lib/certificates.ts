import type {
  Certificate,
  CertificateIssueResult,
  CertificateList,
  RevokeCertificateBody,
} from '@majlis/contracts';
import { apiFetch, json } from './api';

/** Idempotent: a second press issues nothing and reports the same totals. */
export const issueCertificates = (eventId: string): Promise<CertificateIssueResult> =>
  apiFetch(`/events/${eventId}/certificates/issue`, { method: 'POST' });

export const eventCertificates = (eventId: string): Promise<CertificateList> =>
  apiFetch(`/events/${eventId}/certificates`);

export const myCertificates = (): Promise<CertificateList> => apiFetch('/me/certificates');

export const revokeCertificate = (id: string, body: RevokeCertificateBody): Promise<Certificate> =>
  apiFetch(`/certificates/${id}/revoke`, json(body));
