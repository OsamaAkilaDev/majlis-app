import { redirect } from 'next/navigation';

/** Kept so existing links land; the workspace at /manage/[clubId] is the one club screen. */
export default async function AdminClubDetailPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId } = await params;
  redirect(`/manage/${clubId}/overview`);
}
