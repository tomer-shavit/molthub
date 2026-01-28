export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Settings } from "lucide-react";

export default function ProfilesPage() {
  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Profiles</h1>
        <p className="text-muted-foreground mt-1">
          Manage configuration profiles
        </p>
      </div>
      <Card>
        <CardContent className="pt-6 text-center py-12">
          <Settings className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Profiles management coming soon.</p>
        </CardContent>
      </Card>
    </DashboardLayout>
  );
}
