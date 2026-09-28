import type { EventList } from '@majlis/contracts';
import type { Metadata } from 'next';
import { serverFetch } from '@/lib/server-api';
import { CertificatesManager } from './CertificatesManager';

export const metadata: Metadata = { title: 'Certificates' };

export default async function CertificatesPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  const events = await serverFetch<EventList>(`/events?clubId=${clubId}`);

  return <CertificatesManager clubId={clubId} initialEvents={events?.items ?? null} now={Date.now()} />;
}
