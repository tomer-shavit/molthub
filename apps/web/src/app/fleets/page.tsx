export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, type Fleet } from "@/lib/api";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Layers, ArrowRight, Wifi, Server } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

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
            <CardContent className="pt-6">
              <EmptyState
                icon={Layers}
                title="No fleets yet"
                description="Fleets let you group and manage bots together. Create one to organize your agents."
                action={{ label: "Create a Fleet", href: "/fleets/new" }}
              />
            </CardContent>
          </Card>
        ) : (
          fleets.map((fleet) => {
            // Compute gateway connection counts from instances
            const totalInstances = fleet._count?.instances || fleet.instances?.length || 0;
            const connectedInstances = fleet.instances
              ? fleet.instances.filter((i) => i.status === "RUNNING").length
              : 0;
            // Gather deployment target types
            const deploymentTypes = fleet.instances
              ? [...new Set(fleet.instances.map((i) => i.deploymentType).filter(Boolean))]
              : [];

            return (
              <Card key={fleet.id}>
                <CardHeader>
                  <CardTitle>{fleet.name}</CardTitle>
                  <p className="text-sm text-muted-foreground capitalize">
                    {fleet.environment} &bull; {totalInstances} instances
                  </p>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    {fleet.description || "No description"}
                  </p>

                  {/* Deployment target types */}
                  {deploymentTypes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {deploymentTypes.map((dt) => (
                        <Badge key={dt} variant="outline" className="text-xs flex items-center gap-1">
                          <Server className="w-3 h-3" />
                          {dt}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Gateway connection counts */}
                  {totalInstances > 0 && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <Wifi className="w-3.5 h-3.5" />
                      <span>
                        <span className="font-medium text-foreground">{connectedInstances}</span>
                        {" / "}
                        {totalInstances} connected
                      </span>
                    </div>
                  )}

                  <Link href={`/fleets/${fleet.id}`}>
                    <Button variant="outline" className="w-full">
                      View Fleet
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </DashboardLayout>
  );
}
