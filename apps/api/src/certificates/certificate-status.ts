import type { CertificateStatus } from '@majlis/contracts';
import { UnprocessableError } from '../common/problem/domain-error';

// REVOKED is terminal: a revoked row is never revived.
const ALLOWED: Record<CertificateStatus, readonly CertificateStatus[]> = {
  ACTIVE: ['REVOKED'],
  REVOKED: [],
};

export function assertCertificateTransition(from: CertificateStatus, to: CertificateStatus): void {
  if (!ALLOWED[from].includes(to)) {
    throw new UnprocessableError(`A certificate cannot go from ${from} to ${to}.`);
  }
}
