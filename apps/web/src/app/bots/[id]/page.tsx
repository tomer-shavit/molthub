export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { api } from "@/lib/api";
import { notFound } from "next/navigation";
import { BotDetailClient } from "./bot-detail-client";

export default async function BotDetailPage({ params }: { params: { id: string } }) {
  let bot;
  try {
    bot = await api.getBotInstance(params.id);
  } catch {
    notFound();
  }

  if (!bot) {
    notFound();
  }

  return (
    <DashboardLayout>
      <BotDetailClient bot={bot} />
    </DashboardLayout>
  );
}
