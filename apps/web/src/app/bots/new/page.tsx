"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, Fleet } from "@/lib/api";
import { TemplatePicker, TemplateOption } from "@/components/onboarding/template-picker";
import { DeploymentStep } from "@/components/onboarding/deployment-step";
import { ChannelSetupStep, ChannelConfig, TemplateChannelPreset } from "@/components/onboarding/channel-setup-step";
import { ReviewStep } from "@/components/onboarding/review-step";
import { DeployProgress } from "@/components/onboarding/deploy-progress";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Rocket } from "lucide-react";

type WizardStep = "fleet" | "template" | "channels" | "deployment" | "review" | "deploying";

export default function AddBotPage() {
  const router = useRouter();

  // State
  const [step, setStep] = useState<WizardStep>("fleet");
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedFleetId, setSelectedFleetId] = useState<string>("");
  const [botName, setBotName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [channelConfigs, setChannelConfigs] = useState<ChannelConfig[]>([]);
  const [deploymentTarget, setDeploymentTarget] = useState<"docker" | "ecs-fargate" | null>(null);
  const [targetConfig, setTargetConfig] = useState<Record<string, unknown>>({});
  const [configPreview, setConfigPreview] = useState<Record<string, unknown> | undefined>();
  const [deployedInstanceId, setDeployedInstanceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load fleets and templates
  useEffect(() => {
    async function load() {
      try {
        const [fleetsData, templatesData] = await Promise.all([
          api.listFleets(),
          api.getOnboardingTemplates(),
        ]);
        setFleets(fleetsData);
        setTemplates(
          templatesData.map((t) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            category: t.category,
            channels: t.channels,
            requiredInputs: t.requiredInputs,
          }))
        );
      } catch (e) {
        setError("Failed to load fleets or templates.");
      }
    }
    load();
  }, []);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);
  const templateChannels: TemplateChannelPreset[] = selectedTemplate?.channels ?? [];

  // Preview config when reaching review step
  useEffect(() => {
    if (step === "review" && selectedTemplateId) {
      api
        .previewOnboarding({
          templateId: selectedTemplateId,
          channels: channelConfigs,
        })
        .then((res) => setConfigPreview(res.config))
        .catch(() => {});
    }
  }, [step, selectedTemplateId, channelConfigs]);

  const canProceed = (): boolean => {
    switch (step) {
      case "fleet":
        return selectedFleetId !== "" && botName.trim().length > 0;
      case "template":
        return selectedTemplateId !== null;
      case "channels":
        return true; // channels are optional
      case "deployment":
        return deploymentTarget !== null;
      case "review":
        return true;
      default:
        return false;
    }
  };

  const stepOrder: WizardStep[] = ["fleet", "template", "channels", "deployment", "review"];

  const goNext = () => {
    const idx = stepOrder.indexOf(step);
    if (idx < stepOrder.length - 1) {
      setStep(stepOrder[idx + 1]);
    }
  };

  const goBack = () => {
    const idx = stepOrder.indexOf(step);
    if (idx > 0) {
      setStep(stepOrder[idx - 1]);
    }
  };

  const handleDeploy = async () => {
    if (!selectedTemplateId || !deploymentTarget) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.deployOnboarding({
        templateId: selectedTemplateId,
        botName: botName.trim(),
        deploymentTarget: { type: deploymentTarget, ...targetConfig },
        channels: channelConfigs,
        environment: fleets.find((f) => f.id === selectedFleetId)?.environment || "dev",
      });
      setDeployedInstanceId(result.instanceId);
      setStep("deploying");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deployment failed.");
    } finally {
      setLoading(false);
    }
  };

  const stepIndex = stepOrder.indexOf(step);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Add New Bot</h1>
          <p className="text-muted-foreground">
            Configure and deploy a new Moltbot instance
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push("/bots")}>
          Cancel
        </Button>
      </div>

      {/* Step indicator */}
      {step !== "deploying" && (
        <div className="flex items-center gap-2">
          {stepOrder.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  i < stepIndex
                    ? "bg-primary text-primary-foreground"
                    : i === stepIndex
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < stepOrder.length - 1 && (
                <div
                  className={`w-8 h-0.5 ${
                    i < stepIndex ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Step: Fleet & Name */}
      {step === "fleet" && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Fleet & Bot Name</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Fleet</label>
                <Select
                  value={selectedFleetId}
                  onChange={(e) => setSelectedFleetId(e.target.value)}
                >
                  <option value="" disabled>
                    Select a fleet
                  </option>
                  {fleets.map((fleet) => (
                    <option key={fleet.id} value={fleet.id}>
                      {fleet.name} ({fleet.environment})
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose the fleet this bot will belong to
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bot Name</label>
                <Input
                  placeholder="e.g., support-bot, devops-agent"
                  value={botName}
                  onChange={(e) => setBotName(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  A unique name for this bot instance
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Step: Template */}
      {step === "template" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Choose a Template</h2>
          <TemplatePicker
            templates={templates}
            selected={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />
        </div>
      )}

      {/* Step: Channels */}
      {step === "channels" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Configure Channels</h2>
          <ChannelSetupStep
            templateChannels={templateChannels}
            channelConfigs={channelConfigs}
            onChannelChange={setChannelConfigs}
          />
        </div>
      )}

      {/* Step: Deployment */}
      {step === "deployment" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Deployment Target</h2>
          <DeploymentStep
            selectedTarget={deploymentTarget}
            targetConfig={targetConfig}
            onTargetSelect={(type) =>
              setDeploymentTarget(type as "docker" | "ecs-fargate")
            }
            onConfigChange={setTargetConfig}
          />
        </div>
      )}

      {/* Step: Review */}
      {step === "review" && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Review & Deploy</h2>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Bot Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{botName}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Fleet</span>
                <span className="font-medium">
                  {fleets.find((f) => f.id === selectedFleetId)?.name || "—"}
                </span>
              </div>
            </CardContent>
          </Card>
          <ReviewStep
            templateName={selectedTemplate?.name || "Unknown"}
            deploymentTarget={{
              type: deploymentTarget || "docker",
              ...(targetConfig.region ? { region: targetConfig.region as string } : {}),
            }}
            channels={channelConfigs}
            configPreview={configPreview}
          />
        </div>
      )}

      {/* Step: Deploying */}
      {step === "deploying" && deployedInstanceId && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Rocket className="w-5 h-5" />
                Deploying {botName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DeployProgress instanceId={deployedInstanceId} />
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button onClick={() => router.push(`/bots/${deployedInstanceId}`)}>
              Go to Bot Details
            </Button>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      {step !== "deploying" && (
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={stepIndex === 0}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          {step === "review" ? (
            <Button onClick={handleDeploy} disabled={loading}>
              <Rocket className="w-4 h-4 mr-2" />
              {loading ? "Deploying..." : "Deploy Bot"}
            </Button>
          ) : (
            <Button onClick={goNext} disabled={!canProceed()}>
              Next
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
