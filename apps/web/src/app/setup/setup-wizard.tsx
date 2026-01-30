"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  TemplatePicker,
  type TemplateOption,
} from "@/components/onboarding/template-picker";
import { DeploymentStep } from "@/components/onboarding/deployment-step";
import {
  ChannelSetupStep,
  type ChannelConfig,
} from "@/components/onboarding/channel-setup-step";
import { ReviewStep } from "@/components/onboarding/review-step";
import { DeployProgress } from "@/components/onboarding/deploy-progress";
import { api } from "@/lib/api";
import {
  LayoutTemplate,
  Server,
  MessageSquare,
  ClipboardCheck,
  Rocket,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

interface SetupWizardProps {
  templates: TemplateOption[];
}

const STEPS = [
  { name: "Template", icon: LayoutTemplate },
  { name: "Deployment", icon: Server },
  { name: "Channels", icon: MessageSquare },
  { name: "Review", icon: ClipboardCheck },
  { name: "Deploy", icon: Rocket },
];

export function SetupWizard({ templates }: SetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [deploymentTarget, setDeploymentTarget] = useState<
    "docker" | "ecs-fargate" | null
  >(null);
  const [targetConfig, setTargetConfig] = useState<Record<string, unknown>>({});
  const [channels, setChannels] = useState<ChannelConfig[]>([]);
  const [botName, setBotName] = useState("");
  const [deployInstanceId, setDeployInstanceId] = useState<string | null>(null);
  const [configPreview, setConfigPreview] = useState<Record<string, unknown> | undefined>(undefined);
  const [deploying, setDeploying] = useState(false);

  const selectedTemplateObj = templates.find((t) => t.id === selectedTemplate);

  const canProceed = useCallback((): boolean => {
    switch (currentStep) {
      case 0:
        return selectedTemplate !== null;
      case 1:
        return deploymentTarget !== null;
      case 2:
        return true;
      case 3:
        return botName.trim().length > 0;
      default:
        return false;
    }
  }, [currentStep, selectedTemplate, deploymentTarget, botName]);

  const handleNext = async () => {
    if (currentStep === 2) {
      // Moving to review: fetch config preview
      try {
        const preview = await api.previewOnboarding({
          templateId: selectedTemplate!,
          channels: channels.length > 0 ? channels : undefined,
        });
        setConfigPreview(preview.config);
      } catch {
        // Non-blocking: preview is optional
      }
    }
    setCurrentStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const handleDeploy = async () => {
    if (!selectedTemplate || !deploymentTarget || !botName.trim()) return;

    setDeploying(true);
    try {
      const deployTarget: { type: string; [key: string]: unknown } = {
        type: deploymentTarget,
        ...targetConfig,
      };

      const result = await api.deployOnboarding({
        templateId: selectedTemplate,
        botName: botName.trim(),
        deploymentTarget: deployTarget,
        channels: channels.length > 0 ? channels : undefined,
      });

      setDeployInstanceId(result.instanceId);
      setCurrentStep(4);
    } catch (err) {
      console.error("Deploy failed:", err);
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Stepper Bar */}
      <nav className="mb-8">
        <ol className="flex items-center">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = index === currentStep;
            const isCompleted = index < currentStep;

            return (
              <li
                key={step.name}
                className={cn(
                  "flex items-center",
                  index < STEPS.length - 1 && "flex-1"
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                      isActive && "border-primary bg-primary text-primary-foreground",
                      isCompleted && "border-primary bg-primary text-primary-foreground",
                      !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <span
                    className={cn(
                      "text-sm font-medium hidden sm:inline",
                      isActive && "text-primary",
                      isCompleted && "text-primary",
                      !isActive && !isCompleted && "text-muted-foreground"
                    )}
                  >
                    {step.name}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-4",
                      isCompleted ? "bg-primary" : "bg-muted-foreground/20"
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Step Content */}
      <div className="mb-8">
        {currentStep === 0 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Choose a Template</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Select a template to get started quickly. You can customize it later.
              </p>
            </div>
            <TemplatePicker
              templates={templates}
              selected={selectedTemplate}
              onSelect={setSelectedTemplate}
            />
          </div>
        )}

        {currentStep === 1 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Deployment Target</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose where to run your Moltbot instance.
              </p>
            </div>
            <DeploymentStep
              selectedTarget={deploymentTarget}
              targetConfig={targetConfig}
              onTargetSelect={(t) =>
                setDeploymentTarget(t as "docker" | "ecs-fargate")
              }
              onConfigChange={setTargetConfig}
            />
          </div>
        )}

        {currentStep === 2 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Channel Setup</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Configure the messaging channels for your bot.
              </p>
            </div>
            <ChannelSetupStep
              templateChannels={selectedTemplateObj?.channels || []}
              channelConfigs={channels}
              onChannelChange={setChannels}
            />
          </div>
        )}

        {currentStep === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Review &amp; Deploy</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Review your configuration before deploying.
              </p>
            </div>

            <div className="space-y-1.5 max-w-sm">
              <label className="text-sm font-medium">Bot Name</label>
              <Input
                type="text"
                placeholder="my-moltbot"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                A unique name for this bot instance
              </p>
            </div>

            <ReviewStep
              templateName={selectedTemplateObj?.name || "Unknown"}
              deploymentTarget={{
                type: deploymentTarget || "docker",
                region:
                  deploymentTarget === "ecs-fargate"
                    ? (targetConfig.region as string)
                    : undefined,
              }}
              channels={channels}
              configPreview={configPreview}
            />
          </div>
        )}

        {currentStep === 4 && deployInstanceId && (
          <div className="space-y-4">
            <div>
              <h2 className="text-xl font-semibold">Deploying</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your Moltbot instance is being deployed. This may take a few minutes.
              </p>
            </div>
            <DeployProgress instanceId={deployInstanceId} />
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      {currentStep < 4 && (
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>

          {currentStep < 3 ? (
            <Button onClick={handleNext} disabled={!canProceed()}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleDeploy}
              disabled={!canProceed() || deploying}
            >
              {deploying ? (
                <>
                  <span className="animate-spin mr-2">
                    <Rocket className="w-4 h-4" />
                  </span>
                  Deploying...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Deploy
                </>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
