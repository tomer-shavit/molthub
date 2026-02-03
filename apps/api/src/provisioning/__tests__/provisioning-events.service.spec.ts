import { ProvisioningEventsService, PROVISIONING_STEPS } from "../provisioning-events.service";
import type { ProvisioningEventsGateway } from "../provisioning-events.gateway";

describe("ProvisioningEventsService", () => {
  let service: ProvisioningEventsService;
  let mockGateway: jest.Mocked<ProvisioningEventsGateway>;

  beforeEach(() => {
    service = new ProvisioningEventsService();
    mockGateway = {
      emitProgress: jest.fn(),
    } as unknown as jest.Mocked<ProvisioningEventsGateway>;
    service.setGateway(mockGateway);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe("startProvisioning", () => {
    it("should create progress with correct steps for docker deployment", () => {
      service.startProvisioning("inst-1", "docker");
      const progress = service.getProgress("inst-1");
      expect(progress).not.toBeNull();
      expect(progress!.instanceId).toBe("inst-1");
      expect(progress!.status).toBe("in_progress");
      expect(progress!.steps).toHaveLength(PROVISIONING_STEPS["docker"].length);
      expect(progress!.steps[0].status).toBe("pending");
    });

    it("should create progress with correct steps for kubernetes deployment", () => {
      service.startProvisioning("inst-2", "kubernetes");
      const progress = service.getProgress("inst-2");
      expect(progress!.steps).toHaveLength(PROVISIONING_STEPS["kubernetes"].length);
    });

    it("should create progress with correct steps for local deployment", () => {
      service.startProvisioning("inst-3", "local");
      const progress = service.getProgress("inst-3");
      expect(progress!.steps).toHaveLength(PROVISIONING_STEPS["local"].length);
    });

    it("should create progress with correct steps for ecs-ec2 deployment", () => {
      service.startProvisioning("inst-4", "ecs-ec2");
      const progress = service.getProgress("inst-4");
      expect(progress!.steps).toHaveLength(PROVISIONING_STEPS["ecs-ec2"].length);
    });

    it("should create progress with correct steps for cloudflare-workers deployment", () => {
      service.startProvisioning("inst-5", "cloudflare-workers");
      const progress = service.getProgress("inst-5");
      expect(progress!.steps).toHaveLength(PROVISIONING_STEPS["cloudflare-workers"].length);
    });

    it("should emit progress via gateway", () => {
      service.startProvisioning("inst-1", "docker");
      expect(mockGateway.emitProgress).toHaveBeenCalledWith(
        "inst-1",
        expect.objectContaining({ instanceId: "inst-1", status: "in_progress" }),
      );
    });
  });

  describe("updateStep", () => {
    beforeEach(() => {
      service.startProvisioning("inst-1", "docker");
    });

    it("should update step status to in_progress", () => {
      service.updateStep("inst-1", "validate_config", "in_progress");
      const progress = service.getProgress("inst-1");
      const step = progress!.steps.find((s) => s.id === "validate_config");
      expect(step!.status).toBe("in_progress");
      expect(step!.startedAt).toBeDefined();
    });

    it("should update step status to completed", () => {
      service.updateStep("inst-1", "validate_config", "in_progress");
      service.updateStep("inst-1", "validate_config", "completed");
      const progress = service.getProgress("inst-1");
      const step = progress!.steps.find((s) => s.id === "validate_config");
      expect(step!.status).toBe("completed");
      expect(step!.completedAt).toBeDefined();
    });

    it("should set error on error status", () => {
      service.updateStep("inst-1", "validate_config", "in_progress");
      service.updateStep("inst-1", "validate_config", "error", "Config invalid");
      const progress = service.getProgress("inst-1");
      const step = progress!.steps.find((s) => s.id === "validate_config");
      expect(step!.status).toBe("error");
      expect(step!.error).toBe("Config invalid");
    });

    it("should update currentStep when step becomes in_progress", () => {
      service.updateStep("inst-1", "security_audit", "in_progress");
      const progress = service.getProgress("inst-1");
      expect(progress!.currentStep).toBe("security_audit");
    });

    it("should advance currentStep to next pending on completion", () => {
      service.updateStep("inst-1", "validate_config", "in_progress");
      service.updateStep("inst-1", "validate_config", "completed");
      const progress = service.getProgress("inst-1");
      expect(progress!.currentStep).toBe("security_audit");
    });

    it("should emit progress on each update", () => {
      const callCount = mockGateway.emitProgress.mock.calls.length;
      service.updateStep("inst-1", "validate_config", "in_progress");
      expect(mockGateway.emitProgress).toHaveBeenCalledTimes(callCount + 1);
    });

    it("should be a no-op for unknown instance", () => {
      service.updateStep("nonexistent", "validate_config", "in_progress");
      expect(service.getProgress("nonexistent")).toBeNull();
    });
  });

  describe("completeProvisioning", () => {
    beforeEach(() => {
      service.startProvisioning("inst-1", "docker");
    });

    it("should set status to completed", () => {
      service.completeProvisioning("inst-1");
      const progress = service.getProgress("inst-1");
      expect(progress!.status).toBe("completed");
      expect(progress!.completedAt).toBeDefined();
    });

    it("should mark remaining pending steps as skipped", () => {
      service.updateStep("inst-1", "validate_config", "completed");
      service.completeProvisioning("inst-1");
      const progress = service.getProgress("inst-1");
      const pendingSteps = progress!.steps.filter((s) => s.status === "pending");
      expect(pendingSteps).toHaveLength(0);
      const skippedSteps = progress!.steps.filter((s) => s.status === "skipped");
      expect(skippedSteps.length).toBeGreaterThan(0);
    });

    it("should clean up progress after 60 seconds", () => {
      service.completeProvisioning("inst-1");
      expect(service.getProgress("inst-1")).not.toBeNull();
      jest.advanceTimersByTime(61_000);
      expect(service.getProgress("inst-1")).toBeNull();
    });
  });

  describe("failProvisioning", () => {
    beforeEach(() => {
      service.startProvisioning("inst-1", "docker");
    });

    it("should set status to error with message", () => {
      service.failProvisioning("inst-1", "Deploy crashed");
      const progress = service.getProgress("inst-1");
      expect(progress!.status).toBe("error");
      expect(progress!.error).toBe("Deploy crashed");
    });

    it("should mark in_progress steps as error", () => {
      service.updateStep("inst-1", "validate_config", "in_progress");
      service.failProvisioning("inst-1", "Failed");
      const progress = service.getProgress("inst-1");
      const step = progress!.steps.find((s) => s.id === "validate_config");
      expect(step!.status).toBe("error");
    });

    it("should clean up progress after 5 minutes", () => {
      service.failProvisioning("inst-1", "Error");
      expect(service.getProgress("inst-1")).not.toBeNull();
      jest.advanceTimersByTime(5 * 60_000 + 1000);
      expect(service.getProgress("inst-1")).toBeNull();
    });
  });

  describe("getProgress", () => {
    it("should return null for unknown instance", () => {
      expect(service.getProgress("unknown")).toBeNull();
    });

    it("should return progress for active provisioning", () => {
      service.startProvisioning("inst-1", "docker");
      expect(service.getProgress("inst-1")).not.toBeNull();
    });
  });

  describe("step names", () => {
    it("should have human-readable names for all docker steps", () => {
      service.startProvisioning("inst-1", "docker");
      const progress = service.getProgress("inst-1");
      for (const step of progress!.steps) {
        expect(step.name).not.toBe(step.id);
        expect(step.name.length).toBeGreaterThan(3);
      }
    });
  });
});
