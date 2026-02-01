"use client";

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChannelConfig } from "@/components/onboarding/channel-setup-step";
import { api } from "@/lib/api";
import { StepPlatform, Platform } from "./step-platform";
import { AwsConfig } from "./aws-config-panel";
import { StepChannels } from "./step-channels";
import { StepModel, ModelConfig } from "./step-model";
import { StepNameDeploy } from "./step-name-deploy";
import { StepDeploying } from "./step-deploying";
import { Monitor, MessageSquare, Brain, Rocket, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface DeployWizardProps {
  isFirstTime: boolean;
}

const STEPS = [
  { name: "Platform", icon: Monitor },
  { name: "Channels", icon: MessageSquare },
  { name: "AI Model", icon: Brain },
  { name: "Name & Deploy", icon: PenLine },
  { name: "Deploying", icon: Rocket },
];

export function DeployWizard({ isFirstTime }: DeployWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Form state
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [botName, setBotName] = useState("");
  const [channelConfigs, setChannelConfigs] = useState<ChannelConfig[]>([]);
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [awsConfig, setAwsConfig] = useState<AwsConfig>({
    accessKeyId: "",
    secretAccessKey: "",
    region: "us-east-1",
    tier: "simple",
  });
  const [deploying, setDeploying] = useState(false);
  const [deployedInstanceId, setDeployedInstanceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canProceed = useCallback((): boolean => {
    switch (currentStep) {
      case 0: {
        if (!selectedPlatform) return false;
        if (selectedPlatform === "aws") {
          return !!awsConfig.accessKeyId && !!awsConfig.secretAccessKey && !!awsConfig.region;
        }
        return true;
      }
      case 1: return true; // channels are optional
      case 2: return true; // model is optional
      default: return false;
    }
  }, [currentStep, selectedPlatform, awsConfig]);

  const handleNext = () => {
    if (currentStep < 4) {
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
    setCurrentStep(2);
  };

  const handleSkipModel = () => {
    setModelConfig(null);
    setCurrentStep(3);
  };

  const handleDeploy = async () => {
    if (deploying || !selectedPlatform || !botName.trim()) return;

    setDeploying(true);
    setError(null);
    try {
      const result = await api.deployOnboarding({
        botName: botName.trim(),
        deploymentTarget: selectedPlatform === "aws"
          ? { type: "ecs-fargate", ...awsConfig }
          : { type: selectedPlatform },
        channels: channelConfigs.filter((ch) => ch.config.enabled !== false).length > 0
          ? channelConfigs
              .filter((ch) => ch.config.enabled !== false)
              .map((ch) => {
                const { enabled, ...rest } = ch.config as Record<string, unknown> & { enabled?: boolean };
                return { type: ch.type, config: rest };
              })
          : undefined,
        modelConfig: modelConfig && modelConfig.apiKey
          ? { provider: modelConfig.provider, model: modelConfig.model, apiKey: modelConfig.apiKey }
          : undefined,
      });

      setDeployedInstanceId(result.instanceId);
      setCurrentStep(4);
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
      {currentStep < 4 && (
        <nav className="mb-8">
          <ol className="flex items-center justify-center">
            {STEPS.slice(0, 4).map((step, index) => {
              const StepIcon = step.icon;
              const isActive = index === currentStep;
              const isCompleted = index < currentStep;
              const isClickable = isCompleted;

              return (
                <li
                  key={step.name}
                  className={cn(
                    "flex items-center",
                    index < 3 && "flex-1 max-w-[160px]"
                  )}
                >
                  <button
                    type="button"
                    className={cn(
                      "flex items-center gap-2",
                      isClickable && "cursor-pointer hover:opacity-80",
                      !isClickable && "cursor-default"
                    )}
                    onClick={() => isClickable && setCurrentStep(index)}
                    disabled={!isClickable}
                  >
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
                  </button>
                  {index < 3 && (
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

      {/* Step content */}
      <div className="mb-8">
        {currentStep === 0 && (
          <StepPlatform
            selectedPlatform={selectedPlatform}
            onPlatformSelect={setSelectedPlatform}
            awsConfig={awsConfig}
            onAwsConfigChange={setAwsConfig}
          />
        )}

        {currentStep === 1 && (
          <StepChannels
            channelConfigs={channelConfigs}
            onChannelChange={setChannelConfigs}
            onSkip={handleSkipChannels}
          />
        )}

        {currentStep === 2 && (
          <StepModel
            modelConfig={modelConfig}
            onModelConfigChange={setModelConfig}
            onSkip={handleSkipModel}
          />
        )}

        {currentStep === 3 && selectedPlatform && (
          <StepNameDeploy
            botName={botName}
            onBotNameChange={setBotName}
            platform={selectedPlatform}
            channels={channelConfigs}
            modelConfig={modelConfig}
            deploying={deploying}
            onDeploy={handleDeploy}
            error={error}
          />
        )}

        {currentStep === 4 && deployedInstanceId && (
          <StepDeploying
            instanceId={deployedInstanceId}
            botName={botName}
            onRetryDeploy={() => {
              setDeployedInstanceId(null);
              setCurrentStep(3);
            }}
          />
        )}
      </div>

      {/* Navigation buttons (steps 0-2 only, channels and model have their own skip) */}
      {currentStep < 3 && (
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

      {/* Back button on name+deploy step */}
      {currentStep === 3 && (
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
