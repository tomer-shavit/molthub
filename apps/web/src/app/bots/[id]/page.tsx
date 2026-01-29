export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { api, type BotInstance, type Trace, type TraceStats, type ChangeSet, type DeploymentEvent } from "@/lib/api";
import { notFound } from "next/navigation";
import { BotDetailClient } from "./bot-detail-client";

async function getBotData(id: string) {
  try {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 60 * 60 * 1000);

    const [bot, traces, metrics, changeSets, events] = await Promise.all([
      api.getBotInstance(id),
      api.listTraces({ botInstanceId: id, from, to, limit: 100 }),
      api.getBotInstanceMetrics(id, from, to),
      api.listChangeSets({ botInstanceId: id }),
      api.listDeploymentEvents(id),
    ]);

    return { bot, traces, metrics, changeSets, events };
  } catch (error) {
    console.error("Failed to fetch bot data:", error);
    return { bot: null, traces: [], metrics: null, changeSets: [], events: [] };
  }
}

export default async function BotDetailPage({ params }: { params: { id: string } }) {
  const { bot, traces, metrics, changeSets, events } = await getBotData(params.id);

  if (!bot) {
    notFound();
  }

  return (
    <DashboardLayout>
      <BotDetailClient
        bot={bot}
        traces={traces}
        metrics={metrics}
        changeSets={changeSets}
        events={events}
      />
    </DashboardLayout>
  );
}
