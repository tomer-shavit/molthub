import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SyncScheduler } from "../sync-scheduler";
import { LocalStateSyncBackend } from "../local-backend";
import type { StateSyncBackend, SyncResult, SyncOptions } from "../interface";

describe("SyncScheduler", () => {
  let backupDir: string;
  let sourceDir: string;
  let backend: LocalStateSyncBackend;

  beforeEach(async () => {
    backupDir = await mkdtemp(join(tmpdir(), "sched-backup-"));
    sourceDir = await mkdtemp(join(tmpdir(), "sched-source-"));
    backend = new LocalStateSyncBackend({ type: "local", basePath: backupDir });
  });

  afterEach(async () => {
    await rm(backupDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  });

  it("should start and stop correctly", () => {
    const scheduler = new SyncScheduler(backend, { intervalSeconds: 60 });
    expect(scheduler.isRunning()).toBe(false);

    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    // Starting again should be no-op
    scheduler.start();
    expect(scheduler.isRunning()).toBe(true);

    scheduler.stop();
    expect(scheduler.isRunning()).toBe(false);
  });

  it("should manage instances", () => {
    const scheduler = new SyncScheduler(backend);

    expect(scheduler.getRegisteredInstances()).toEqual([]);
    expect(scheduler.hasInstance("inst-1")).toBe(false);

    scheduler.addInstance({
      instanceId: "inst-1",
      localPath: sourceDir,
      encrypt: false,
    });

    expect(scheduler.hasInstance("inst-1")).toBe(true);
    expect(scheduler.getRegisteredInstances()).toEqual(["inst-1"]);

    scheduler.removeInstance("inst-1");
    expect(scheduler.hasInstance("inst-1")).toBe(false);
    expect(scheduler.getRegisteredInstances()).toEqual([]);
  });

  it("should return configured interval", () => {
    const scheduler = new SyncScheduler(backend, { intervalSeconds: 120 });
    expect(scheduler.getIntervalMs()).toBe(120_000);
  });

  it("should default to 5 minute interval", () => {
    const scheduler = new SyncScheduler(backend);
    expect(scheduler.getIntervalMs()).toBe(300_000);
  });

  it("should run a backup cycle for registered instances", async () => {
    await writeFile(join(sourceDir, "data.txt"), "test data");

    const scheduler = new SyncScheduler(backend, { intervalSeconds: 60 });
    scheduler.addInstance({
      instanceId: "inst-cycle",
      localPath: sourceDir,
      encrypt: false,
    });

    const results = await scheduler.runBackupCycle();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("success");
    expect(results[0].instanceId).toBe("inst-cycle");
    expect(results[0].direction).toBe("backup");
  });

  it("should return empty results when no instances registered", async () => {
    const scheduler = new SyncScheduler(backend);
    const results = await scheduler.runBackupCycle();
    expect(results).toEqual([]);
  });

  it("should invoke onSyncComplete callback", async () => {
    await writeFile(join(sourceDir, "cb.txt"), "callback test");

    const completedResults: SyncResult[] = [];
    const scheduler = new SyncScheduler(backend, {
      intervalSeconds: 60,
      onSyncComplete: (result) => completedResults.push(result),
    });

    scheduler.addInstance({
      instanceId: "cb-inst",
      localPath: sourceDir,
      encrypt: false,
    });

    await scheduler.runBackupCycle();
    expect(completedResults).toHaveLength(1);
    expect(completedResults[0].instanceId).toBe("cb-inst");
  });

  it("should invoke onError callback on backend failure", async () => {
    const errors: Array<{ error: Error; instanceId: string }> = [];

    // Create a mock backend that always throws
    const failingBackend: StateSyncBackend = {
      type: "local",
      async backup(): Promise<SyncResult> {
        throw new Error("Simulated backup failure");
      },
      async restore(): Promise<SyncResult> {
        throw new Error("Simulated restore failure");
      },
      async getLastBackupTimestamp(): Promise<string | null> {
        return null;
      },
      async healthCheck(): Promise<boolean> {
        return false;
      },
    };

    const scheduler = new SyncScheduler(failingBackend, {
      intervalSeconds: 60,
      onError: (error, instanceId) => errors.push({ error, instanceId }),
    });

    scheduler.addInstance({
      instanceId: "fail-inst",
      localPath: sourceDir,
      encrypt: false,
    });

    const results = await scheduler.runBackupCycle();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("error");
    expect(errors).toHaveLength(1);
    expect(errors[0].instanceId).toBe("fail-inst");
    expect(errors[0].error.message).toBe("Simulated backup failure");
  });

  it("should restore a registered instance", async () => {
    await writeFile(join(sourceDir, "restore-test.txt"), "restore me");

    const scheduler = new SyncScheduler(backend);
    scheduler.addInstance({
      instanceId: "restore-inst",
      localPath: sourceDir,
      encrypt: false,
    });

    // First backup
    await scheduler.runBackupCycle();

    // Then restore
    const result = await scheduler.restoreInstance("restore-inst");
    expect(result.status).toBe("success");
    expect(result.direction).toBe("restore");
  });

  it("should return error when restoring unregistered instance", async () => {
    const scheduler = new SyncScheduler(backend);
    const result = await scheduler.restoreInstance("unknown");
    expect(result.status).toBe("error");
    expect(result.message).toContain("not registered");
  });

  it("should update lastSyncedAt after successful backup", async () => {
    await writeFile(join(sourceDir, "ts.txt"), "timestamp test");

    const scheduler = new SyncScheduler(backend);
    scheduler.addInstance({
      instanceId: "ts-inst",
      localPath: sourceDir,
      encrypt: false,
    });

    // First backup should succeed
    const firstResults = await scheduler.runBackupCycle();
    expect(firstResults[0].status).toBe("success");

    // Second backup should be skipped (same checksum, but won't fail)
    const secondResults = await scheduler.runBackupCycle();
    expect(secondResults[0].status).toBe("skipped");
  });

  it("should backup multiple instances in one cycle", async () => {
    const sourceDir2 = await mkdtemp(join(tmpdir(), "sched-source2-"));
    try {
      await writeFile(join(sourceDir, "a.txt"), "data A");
      await writeFile(join(sourceDir2, "b.txt"), "data B");

      const scheduler = new SyncScheduler(backend);
      scheduler.addInstance({
        instanceId: "multi-1",
        localPath: sourceDir,
        encrypt: false,
      });
      scheduler.addInstance({
        instanceId: "multi-2",
        localPath: sourceDir2,
        encrypt: false,
      });

      const results = await scheduler.runBackupCycle();
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.status === "success")).toBe(true);
    } finally {
      await rm(sourceDir2, { recursive: true, force: true });
    }
  });
});
