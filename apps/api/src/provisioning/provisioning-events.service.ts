import { Injectable, Logger } from "@nestjs/common";
import type { ProvisioningEventsGateway } from "./provisioning-events.gateway";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProvisioningStep {
  id: string;
  name: string;
  status: "pending" | "in_progress" | "completed" | "error" | "skipped";
  message?: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface ProvisioningProgress {
  instanceId: string;
  status: "in_progress" | "completed" | "error" | "timeout";
  currentStep: string;
  steps: ProvisioningStep[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Step definitions per deployment type
// ---------------------------------------------------------------------------

const STEP_NAMES: Record<string, string> = {
  validate_config: "Validate configuration",
  security_audit: "Security audit",
  pull_image: "Pull container image",
  build_image: "Build container image",
  create_container: "Create container",
  write_config: "Write configuration",
  start_container: "Start container",
  install_openclaw: "Install OpenClaw",
  install_service: "Install service",
  start_service: "Start service",
  generate_manifests: "Generate Kubernetes manifests",
  apply_configmap: "Apply ConfigMap",
  apply_deployment: "Apply Deployment",
  apply_service: "Apply Service",
  wait_for_pod: "Wait for pod readiness",
  create_task_definition: "Create task definition",
  create_service: "Create ECS service",
  wait_for_task: "Wait for task startup",
  generate_wrangler_config: "Generate Wrangler config",
  build_worker: "Build worker",
  deploy_worker: "Deploy worker",
  restore_state: "Restore state",
  wait_for_gateway: "Wait for Gateway",
  health_check: "Health check",
};

export const PROVISIONING_STEPS: Record<string, string[]> = {
  docker: [
    "validate_config",
    "security_audit",
    "build_image",
    "create_container",
    "write_config",
    "start_container",
    "wait_for_gateway",
    "health_check",
  ],
  local: [
    "validate_config",
    "security_audit",
    "install_openclaw",
    "write_config",
    "install_service",
    "start_service",
    "wait_for_gateway",
    "health_check",
  ],
  kubernetes: [
    "validate_config",
    "security_audit",
    "generate_manifests",
    "apply_configmap",
    "apply_deployment",
    "apply_service",
    "wait_for_pod",
    "wait_for_gateway",
    "health_check",
  ],
  "ecs-fargate": [
    "validate_config",
    "security_audit",
    "create_task_definition",
    "create_service",
    "wait_for_task",
    "wait_for_gateway",
    "health_check",
  ],
  "cloudflare-workers": [
    "validate_config",
    "security_audit",
    "generate_wrangler_config",
    "build_worker",
    "deploy_worker",
    "restore_state",
    "wait_for_gateway",
    "health_check",
  ],
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const PROVISIONING_TIMEOUT_MS = 15 * 60 * 1000;

@Injectable()
export class ProvisioningEventsService {
  private readonly logger = new Logger(ProvisioningEventsService.name);
  private readonly progress = new Map<string, ProvisioningProgress>();
  private readonly timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private gateway: ProvisioningEventsGateway | null = null;

  setGateway(gateway: ProvisioningEventsGateway): void {
    this.gateway = gateway;
  }

  startProvisioning(instanceId: string, deploymentType: string): void {
    const stepIds =
      PROVISIONING_STEPS[deploymentType] ?? PROVISIONING_STEPS["docker"];
    const steps: ProvisioningStep[] = stepIds.map((id) => ({
      id,
      name: STEP_NAMES[id] ?? id,
      status: "pending" as const,
    }));

    const progress: ProvisioningProgress = {
      instanceId,
      status: "in_progress",
      currentStep: steps[0]?.id ?? "",
      steps,
      startedAt: new Date().toISOString(),
    };

    this.progress.set(instanceId, progress);
    this.emit(instanceId, progress);

    const timeout = setTimeout(() => {
      this.timeoutProvisioning(instanceId);
    }, PROVISIONING_TIMEOUT_MS);
    this.timeouts.set(instanceId, timeout);

    this.logger.log(
      `Provisioning started for ${instanceId} (${deploymentType}, ${steps.length} steps)`,
    );
  }

  updateStep(
    instanceId: string,
    stepId: string,
    status: ProvisioningStep["status"],
    message?: string,
  ): void {
    const progress = this.progress.get(instanceId);
    if (!progress) return;

    const step = progress.steps.find((s) => s.id === stepId);
    if (!step) return;

    const now = new Date().toISOString();
    step.status = status;
    if (message) step.message = message;

    if (status === "in_progress" && !step.startedAt) {
      step.startedAt = now;
    }
    if (status === "completed" || status === "error" || status === "skipped") {
      step.completedAt = now;
    }
    if (status === "error" && message) {
      step.error = message;
    }

    if (status === "in_progress") {
      progress.currentStep = stepId;
    } else if (status === "completed") {
      const nextPending = progress.steps.find((s) => s.status === "pending");
      if (nextPending) {
        progress.currentStep = nextPending.id;
      }
    }

    this.emit(instanceId, progress);
  }

  completeProvisioning(instanceId: string): void {
    const progress = this.progress.get(instanceId);
    if (!progress) return;

    progress.status = "completed";
    progress.completedAt = new Date().toISOString();

    for (const step of progress.steps) {
      if (step.status === "pending") {
        step.status = "skipped";
      }
    }

    this.clearTimeout(instanceId);
    this.emit(instanceId, progress);
    this.logger.log(`Provisioning completed for ${instanceId}`);

    setTimeout(() => {
      this.progress.delete(instanceId);
    }, 60_000);
  }

  failProvisioning(instanceId: string, error: string): void {
    const progress = this.progress.get(instanceId);
    if (!progress) return;

    progress.status = "error";
    progress.error = error;
    progress.completedAt = new Date().toISOString();

    for (const step of progress.steps) {
      if (step.status === "in_progress") {
        step.status = "error";
        step.error = error;
        step.completedAt = new Date().toISOString();
      }
    }

    this.clearTimeout(instanceId);
    this.emit(instanceId, progress);
    this.logger.warn(`Provisioning failed for ${instanceId}: ${error}`);

    setTimeout(() => {
      this.progress.delete(instanceId);
    }, 5 * 60_000);
  }

  getProgress(instanceId: string): ProvisioningProgress | null {
    return this.progress.get(instanceId) ?? null;
  }

  // ---- Private ----

  private timeoutProvisioning(instanceId: string): void {
    const progress = this.progress.get(instanceId);
    if (!progress || progress.status !== "in_progress") return;

    progress.status = "timeout";
    progress.error = "Provisioning timed out after 5 minutes";
    progress.completedAt = new Date().toISOString();

    this.emit(instanceId, progress);
    this.logger.warn(`Provisioning timed out for ${instanceId}`);

    setTimeout(() => {
      this.progress.delete(instanceId);
    }, 5 * 60_000);
  }

  private clearTimeout(instanceId: string): void {
    const timeout = this.timeouts.get(instanceId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(instanceId);
    }
  }

  private emit(instanceId: string, progress: ProvisioningProgress): void {
    if (this.gateway) {
      this.gateway.emitProgress(instanceId, progress);
    }
  }
}
