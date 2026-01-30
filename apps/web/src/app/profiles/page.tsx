export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { api } from "@/lib/api";
import { ProfileList } from "@/components/profiles/profile-list";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";

async function getData() {
  try {
    const [profiles, fleets] = await Promise.all([
      api.listProfiles(),
      api.listFleets(),
    ]);
    return { profiles, fleets };
  } catch {
    return { profiles: [], fleets: [] };
  }
}

export default async function ProfilesPage() {
  const { profiles, fleets } = await getData();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Profiles</h1>
          <p className="text-muted-foreground mt-1">
            Manage configuration profiles for your bot instances
          </p>
        </div>
        <Link href="/profiles/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New Profile
          </Button>
        </Link>
      </div>
      <ProfileList profiles={profiles} fleets={fleets} />
    </DashboardLayout>
  );
}
