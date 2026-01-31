export const dynamic = "force-dynamic";

import { WizardLayout } from "@/components/deploy-wizard/wizard-layout";
import { DeployWizard } from "@/components/deploy-wizard/deploy-wizard";
import { api, Fleet } from "@/lib/api";
import { TemplateOption } from "@/components/onboarding/template-picker";

interface AddBotPageProps {
  searchParams: { templateId?: string };
}

export default async function AddBotPage({ searchParams }: AddBotPageProps) {
  // Fetch templates and fleets
  let templates: TemplateOption[] = [];
  let fleets: Fleet[] = [];

  // Fetch independently so a failure in one doesn't blank out the other
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

  try {
    fleets = await api.listFleets();
  } catch {
    // Continue with empty fleets
  }

  return (
    <WizardLayout>
      <DeployWizard
        isFirstTime={false}
        templates={templates}
        fleets={fleets}
        initialTemplateId={searchParams.templateId}
      />
    </WizardLayout>
  );
}
