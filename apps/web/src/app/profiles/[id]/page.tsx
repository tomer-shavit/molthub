export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { api } from "@/lib/api";
import { ProfileDetailWrapper } from "./profile-detail-wrapper";
import { notFound } from "next/navigation";

interface ProfileDetailPageProps {
  params: { id: string };
}

async function getData(id: string) {
  try {
    const [profile, fleets] = await Promise.all([
      api.getProfile(id),
      api.listFleets(),
    ]);
    return { profile, fleets };
  } catch {
    return null;
  }
}

export default async function ProfileDetailPage({ params }: ProfileDetailPageProps) {
  const data = await getData(params.id);

  if (!data) {
    notFound();
  }

  return (
    <DashboardLayout>
      <ProfileDetailWrapper profile={data.profile} fleets={data.fleets} />
    </DashboardLayout>
  );
}
