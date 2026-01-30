export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { api } from "@/lib/api";
import { NewProfileForm } from "./new-profile-form";

async function getFleets() {
  try {
    return await api.listFleets();
  } catch {
    return [];
  }
}

export default async function NewProfilePage() {
  const fleets = await getFleets();

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Create Profile</h1>
        <p className="text-muted-foreground mt-1">
          Create a new configuration profile for your bot instances
        </p>
      </div>
      <NewProfileForm fleets={fleets} />
    </DashboardLayout>
  );
}
