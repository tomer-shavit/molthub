export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { middlewaresClient } from "@/lib/api";
import { MiddlewareDetail } from "@/components/middlewares/middleware-detail";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MiddlewareDetailPage({ params }: PageProps) {
  const { id } = await params;
  try {
    const middleware = await middlewaresClient.getById(id);
    return (
      <DashboardLayout>
        <MiddlewareDetail middleware={middleware} />
      </DashboardLayout>
    );
  } catch {
    notFound();
  }
}
