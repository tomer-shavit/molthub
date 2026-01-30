"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { TemplateOption } from "@/components/onboarding/template-picker";
import { ChannelConfig } from "@/components/onboarding/channel-setup-step";
import { Fleet, api } from "@/lib/api";
import { StepTemplate } from "./step-template";
import { StepChannels } from "./step-channels";
import { StepReview } from "./step-review";
import { StepDeploying } from "./step-deploying";
import { LayoutTemplate, MessageSquare, ClipboardCheck, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface DeployWizardProps {
  isFirstTime: boolean;
  templates: TemplateOption[];
  fleets: Fleet[];
  initialTemplateId?: string;
}

const STEPS = [
  { name: "Template & Name", icon: LayoutTemplate },
  { name: "Channels", icon: MessageSquare },
  { name: "Review", icon: ClipboardCheck },
  { name: "Deploying", icon: Rocket },
];

export function DeployWizard({ isFirstTime, templates, fleets, initialTemplateId }: DeployWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Form state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(initialTemplateId ?? null);
  const [botName, setBotName] = useState("");
  const [channelConfigs, setChannelConfigs] = useState<ChannelConfig[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState(fleets[0]?.id || "");
  const [deploying, setDeploying] = useState(false);
  const [deployedInstanceId, setDeployedInstanceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const canProceed = useCallback((): boolean => {
    switch (currentStep) {
      case 0: return selectedTemplateId !== null && botName.trim().length > 0 && /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/.test(botName.trim());
      case 1: return true; // channels are optional
      case 2: return true;
      default: return false;
    }
  }, [currentStep, selectedTemplateId, botName]);

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSkipChannels = () => {
    setChannelConfigs([]);
    setCurrentStep(2); // go to review
  };

  const handleDeploy = async () => {
    if (!selectedTemplateId || !botName.trim()) return;

    setDeploying(true);
    setError(null);
    try {
      const result = await api.deployOnboarding({
        templateId: selectedTemplateId,
        botName: botName.trim(),
        deploymentTarget: { type: "docker" },
        channels: channelConfigs.length > 0 ? channelConfigs : undefined,
        ...(selectedFleetId ? { environment: fleets.find(f => f.id === selectedFleetId)?.environment } : {}),
      });

      setDeployedInstanceId(result.instanceId);
      setCurrentStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deployment failed. Please try again.");
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div>
      {/* Welcome header for first-time users */}
      {isFirstTime && currentStep === 0 && (
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Molthub</h1>
          <p className="text-muted-foreground mt-2">
            Deploy your first OpenClaw agent in minutes.
          </p>
        </div>
      )}

      {/* Step indicator (hidden during deploying step) */}
      {currentStep < 3 && (
        <nav className="mb-8">
          <ol className="flex items-center justify-center">
            {STEPS.slice(0, 3).map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;

              return (
                <li
                  key={step.name}
                  className={cn(
                    "flex items-center",
                    index < 2 && "flex-1 max-w-[200px]"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors",
                        (isActive || isCompleted) && "border-primary bg-primary text-primary-foreground",
                        !isActive && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                      )}
                    >
                      <StepIcon className="w-4 h-4" />
                    </div>
                    <span
                      className={cn(
                        "text-sm font-medium hidden sm:inline",
                        (isActive || isCompleted) && "text-primary",
                        !isActive && !isCompleted && "text-muted-foreground"
                      )}
                    >
                      {step.name}
                    </span>
                  </div>
                  {index < 2 && (
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
      )}

      {/* Error message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Step content */}
      <div className="mb-8">
        {currentStep === 0 && (
          <StepTemplate
            templates={templates}
            selectedTemplateId={selectedTemplateId}
            onTemplateSelect={setSelectedTemplateId}
            botName={botName}
            onBotNameChange={setBotName}
          />
        )}

        {currentStep === 1 && (
          <StepChannels
            templateChannels={selectedTemplate?.channels || []}
            channelConfigs={channelConfigs}
            onChannelChange={setChannelConfigs}
            onSkip={handleSkipChannels}
          />
        )}

        {currentStep === 2 && (
          <StepReview
            botName={botName}
            template={selectedTemplate}
            channels={channelConfigs}
            fleets={fleets}
            selectedFleetId={selectedFleetId}
            onFleetChange={setSelectedFleetId}
            deploying={deploying}
            onDeploy={handleDeploy}
          />
        )}

        {currentStep === 3 && deployedInstanceId && (
          <StepDeploying
            instanceId={deployedInstanceId}
            botName={botName}
            onRetryDeploy={() => {
              setDeployedInstanceId(null);
              setCurrentStep(2);
            }}
          />
        )}
      </div>

      {/* Navigation buttons (steps 0-1 only, step 2 has deploy button in review, step 3 has its own CTAs) */}
      {currentStep < 2 && (
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleNext} disabled={!canProceed()}>
            Next
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Back button on review step */}
      {currentStep === 2 && (
        <div className="flex items-center border-t pt-4">
          <Button variant="outline" onClick={handleBack}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      )}
    </div>
  );
}
