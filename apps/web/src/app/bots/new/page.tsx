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
  try {
    const [rawTemplates, rawFleets] = await Promise.all([
      api.getOnboardingTemplates(),
      api.listFleets(),
    ]);
    templates = rawTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      channels: t.channels,
      requiredInputs: t.requiredInputs,
    }));
    fleets = rawFleets;
  } catch {
    // Continue with empty data
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
