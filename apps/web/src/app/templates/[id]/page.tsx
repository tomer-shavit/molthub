export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { api } from "@/lib/api";
import { TemplateDetail } from "@/components/templates/template-detail";
import { notFound } from "next/navigation";

interface TemplateDetailPageProps {
  params: { id: string };
}

async function getTemplate(id: string) {
  try {
    return await api.getTemplate(id);
  } catch {
    return null;
  }
}

export default async function TemplateDetailPage({ params }: TemplateDetailPageProps) {
  const template = await getTemplate(params.id);

  if (!template) {
    notFound();
  }

  return (
    <DashboardLayout>
      <TemplateDetail template={template} />
    </DashboardLayout>
  );
}
