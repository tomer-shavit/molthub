"use client";

import { useState, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ChannelConfig } from "@/components/onboarding/channel-setup-step";
import { api, type Fleet } from "@/lib/api";
import { StepPlatform, Platform } from "./step-platform";
import { AwsConfig } from "./aws-config-panel";
import { StepModel, ModelConfig } from "./step-model";
import { StepNameDeploy } from "./step-name-deploy";
import { StepDeploying } from "./step-deploying";
import { Monitor, Brain, Rocket, PenLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface DeployWizardProps {
  isFirstTime: boolean;
}

const STEPS = [
  { name: "Platform", icon: Monitor },
  { name: "AI Model", icon: Brain },
  { name: "Name & Deploy", icon: PenLine },
  { name: "Deploying", icon: Rocket },
];

// No channel config by default - let OpenClaw use its defaults
const DEFAULT_CHANNEL_CONFIGS: ChannelConfig[] = [];

export function DeployWizard({ isFirstTime }: DeployWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);

  // Form state
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | null>(null);
  const [botName, setBotName] = useState("");
  const [channelConfigs] = useState<ChannelConfig[]>(DEFAULT_CHANNEL_CONFIGS);
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
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);

  useEffect(() => {
    api.listFleets().then((result) => {
      setFleets(result);
      if (result.length === 1) {
        setSelectedFleetId(result[0].id);
      }
    }).catch(() => {
      // Fleets are optional — if loading fails, the backend will auto-create one
    });
  }, []);

  const canProceed = useCallback((): boolean => {
    switch (currentStep) {
      case 0: {
        if (!selectedPlatform) return false;
        if (selectedPlatform === "aws") {
          // Either saved credential or manual entry
          if (awsConfig.savedCredentialId) return true;
          return !!awsConfig.accessKeyId && !!awsConfig.secretAccessKey && !!awsConfig.region;
        }
        return true;
      }
      case 1: return true; // model is optional
      default: return false;
    }
  }, [currentStep, selectedPlatform, awsConfig]);

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

  const handleSkipModel = () => {
    setModelConfig(null);
    setCurrentStep(2);
  };

  const handleDeploy = async () => {
    if (deploying || !selectedPlatform || !botName.trim()) return;

    setDeploying(true);
    setError(null);
    try {
      // Save credentials for future use if requested
      if (selectedPlatform === "aws" && awsConfig.saveForFuture?.save && awsConfig.saveForFuture.name) {
        try {
          await api.saveCredential({
            name: awsConfig.saveForFuture.name,
            type: "aws-account",
            credentials: {
              accessKeyId: awsConfig.accessKeyId,
              secretAccessKey: awsConfig.secretAccessKey,
              region: awsConfig.region,
            },
          });
        } catch {
          // Save failure should not block deployment
        }
      }

      if (modelConfig?.saveForFuture?.save && modelConfig.saveForFuture.name && modelConfig.apiKey) {
        try {
          await api.saveCredential({
            name: modelConfig.saveForFuture.name,
            type: "api-key",
            credentials: {
              provider: modelConfig.provider,
              apiKey: modelConfig.apiKey,
            },
          });
        } catch {
          // Save failure should not block deployment
        }
      }

      const result = await api.deployOnboarding({
        botName: botName.trim(),
        deploymentTarget: selectedPlatform === "aws"
          ? { type: "ecs-ec2", ...awsConfig }
          : { type: selectedPlatform },
        ...(awsConfig.savedCredentialId ? { awsCredentialId: awsConfig.savedCredentialId } : {}),
        ...(modelConfig?.savedCredentialId ? { modelCredentialId: modelConfig.savedCredentialId } : {}),
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
        fleetId: selectedFleetId || undefined,
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
          <h1 className="text-3xl font-bold tracking-tight">Welcome to Clawster</h1>
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
              const isClickable = isCompleted;

              return (
                <li
                  key={step.name}
                  className={cn(
                    "flex items-center",
                    index < 2 && "flex-1 max-w-[160px]"
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
          <StepModel
            modelConfig={modelConfig}
            onModelConfigChange={setModelConfig}
            onSkip={handleSkipModel}
          />
        )}

        {currentStep === 2 && selectedPlatform && (
          <StepNameDeploy
            botName={botName}
            onBotNameChange={setBotName}
            platform={selectedPlatform}
            channels={channelConfigs}
            modelConfig={modelConfig}
            deploying={deploying}
            onDeploy={handleDeploy}
            error={error}
            fleets={fleets}
            selectedFleetId={selectedFleetId}
            onFleetSelect={setSelectedFleetId}
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

      {/* Navigation buttons (steps 0-1 only, model has its own skip) */}
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

      {/* Back button on name+deploy step */}
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
