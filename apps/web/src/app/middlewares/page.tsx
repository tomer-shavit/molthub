export const dynamic = "force-dynamic";

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { middlewaresClient } from "@/lib/api";
import { MiddlewareGallery } from "@/components/middlewares/middleware-gallery";

async function getMiddlewares() {
  try {
    return await middlewaresClient.list();
  } catch {
    return [];
  }
}

export default async function MiddlewaresPage() {
  const middlewares = await getMiddlewares();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Middlewares</h1>
          <p className="text-muted-foreground mt-1">
            Traffic interceptors that modify bot WebSocket and HTTP messages
          </p>
        </div>
      </div>
      <MiddlewareGallery middlewares={middlewares} />
    </DashboardLayout>
  );
}
