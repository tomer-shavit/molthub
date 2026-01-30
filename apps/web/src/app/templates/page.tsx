export const dynamic = 'force-dynamic';

import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { api } from "@/lib/api";
import { TemplateGrid } from "@/components/templates/template-grid";

async function getTemplates() {
  try {
    return await api.listTemplates();
  } catch {
    return [];
  }
}

export default async function TemplatesPage() {
  const templates = await getTemplates();

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Templates</h1>
          <p className="text-muted-foreground mt-1">
            Browse and manage bot configuration templates
          </p>
        </div>
      </div>
      <TemplateGrid templates={templates} />
    </DashboardLayout>
  );
}
