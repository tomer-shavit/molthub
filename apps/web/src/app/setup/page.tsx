export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { WizardLayout } from "@/components/deploy-wizard/wizard-layout";
import { DeployWizard } from "@/components/deploy-wizard/deploy-wizard";
import { api } from "@/lib/api";
import { TemplateOption } from "@/components/onboarding/template-picker";

export default async function SetupPage() {
  // Redirect to dashboard if instances already exist
  try {
    const status = await api.getOnboardingStatus();
    if (status.hasInstances) {
      redirect("/");
    }
  } catch {
    // Continue to setup on error
  }

  // Fetch templates
  let templates: TemplateOption[] = [];
  try {
    const rawTemplates = await api.getOnboardingTemplates();
    templates = rawTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      channels: t.channels,
      requiredInputs: t.requiredInputs,
    }));
  } catch {
    // Continue with empty templates
  }

  return (
    <WizardLayout>
      <DeployWizard
        isFirstTime={true}
        templates={templates}
        fleets={[]}
      />
    </WizardLayout>
  );
}
