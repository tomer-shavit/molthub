export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { SetupWizard } from "./setup-wizard";
import { api } from "@/lib/api";

async function getSetupData() {
  try {
    const [status, templates] = await Promise.all([
      api.getOnboardingStatus(),
      api.getOnboardingTemplates(),
    ]);
    return { status, templates };
  } catch (error) {
    console.error("Failed to fetch setup data:", error);
    return {
      status: { hasInstances: false },
      templates: [],
    };
  }
}

export default async function SetupPage() {
  const { status, templates } = await getSetupData();

  if (status.hasInstances) {
    redirect("/");
  }

  const templateOptions = templates.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    channels: t.channels,
  }));

  return (
    <DashboardLayout>
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome to Molthub
        </h1>
        <p className="text-muted-foreground mt-1">
          Set up your first Moltbot instance in a few steps.
        </p>
      </div>
      <SetupWizard templates={templateOptions} />
    </DashboardLayout>
  );
}
