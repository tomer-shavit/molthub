export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type Fleet } from "@/lib/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Layers, ArrowRight } from "lucide-react";

async function getFleets(): Promise<Fleet[]> {
  try {
    return await api.listFleets();
  } catch (error) {
    return [];
  }
}

export default async function FleetsPage() {
  const fleets = await getFleets();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fleets</h1>
          <p className="text-muted-foreground mt-1">
            Manage your bot fleets
          </p>
        </div>
        <Button>
          <Layers className="w-4 h-4 mr-2" />
          New Fleet
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {fleets.length === 0 ? (
          <Card className="col-span-full">
            <CardContent className="pt-6 text-center py-12">
              <Layers className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">No fleets found.</p>
              <Button className="mt-4">Create your first fleet</Button>
            </CardContent>
          </Card>
        ) : (
          fleets.map((fleet) => (
            <Card key={fleet.id}>
              <CardHeader>
                <CardTitle>{fleet.name}</CardTitle>
                <p className="text-sm text-muted-foreground capitalize">
                  {fleet.environment} • {fleet._count?.instances || 0} instances
                </p>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  {fleet.description || "No description"}
                </p>
                <Link href={`/fleets/${fleet.id}`}>
                  <Button variant="outline" className="w-full">
                    View Fleet
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </DashboardLayout>
  );
}
