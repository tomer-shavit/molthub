import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { LocalStateSyncBackend } from "../local-backend";
import { encryptBuffer, decryptBuffer } from "../encryption";

describe("LocalStateSyncBackend", () => {
  let backupDir: string;
  let sourceDir: string;
  let restoreDir: string;
  let backend: LocalStateSyncBackend;

  beforeEach(async () => {
    backupDir = await mkdtemp(join(tmpdir(), "clawster-backup-"));
    sourceDir = await mkdtemp(join(tmpdir(), "clawster-source-"));
    restoreDir = await mkdtemp(join(tmpdir(), "clawster-restore-"));
    backend = new LocalStateSyncBackend({ type: "local", basePath: backupDir });
  });

  afterEach(async () => {
    await rm(backupDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
    await rm(restoreDir, { recursive: true, force: true });
  });

  it("should report healthy when backup dir is writable", async () => {
    const healthy = await backend.healthCheck();
    expect(healthy).toBe(true);
  });

  it("should skip backup when source dir is empty", async () => {
    const result = await backend.backup({
      instanceId: "test-1",
      localPath: sourceDir,
      encrypt: false,
      force: false,
    });
    expect(result.status).toBe("skipped");
    expect(result.message).toContain("No files");
  });

  it("should backup and restore a single file", async () => {
    const content = "hello world state data";
    await writeFile(join(sourceDir, "state.json"), content);

    const backupResult = await backend.backup({
      instanceId: "inst-1",
      localPath: sourceDir,
      encrypt: false,
      force: false,
    });

    expect(backupResult.status).toBe("success");
    expect(backupResult.direction).toBe("backup");
    expect(backupResult.backendType).toBe("local");
    expect(backupResult.checksum).toBeDefined();
    expect(backupResult.bytesTransferred).toBeGreaterThan(0);

    // Restore to a different directory
    const restoreResult = await backend.restore({
      instanceId: "inst-1",
      localPath: restoreDir,
      encrypt: false,
      force: false,
    });

    expect(restoreResult.status).toBe("success");
    expect(restoreResult.direction).toBe("restore");

    const restored = await readFile(join(restoreDir, "state.json"), "utf-8");
    expect(restored).toBe(content);
  });

  it("should backup and restore nested directories", async () => {
    await mkdir(join(sourceDir, "sub", "deep"), { recursive: true });
    await writeFile(join(sourceDir, "root.txt"), "root file");
    await writeFile(join(sourceDir, "sub", "mid.txt"), "mid file");
    await writeFile(join(sourceDir, "sub", "deep", "leaf.txt"), "leaf file");

    const backupResult = await backend.backup({
      instanceId: "nested-1",
      localPath: sourceDir,
      encrypt: false,
      force: false,
    });
    expect(backupResult.status).toBe("success");

    const restoreResult = await backend.restore({
      instanceId: "nested-1",
      localPath: restoreDir,
      encrypt: false,
      force: false,
    });
    expect(restoreResult.status).toBe("success");

    expect(await readFile(join(restoreDir, "root.txt"), "utf-8")).toBe("root file");
    expect(await readFile(join(restoreDir, "sub", "mid.txt"), "utf-8")).toBe("mid file");
    expect(await readFile(join(restoreDir, "sub", "deep", "leaf.txt"), "utf-8")).toBe("leaf file");
  });

  it("should skip backup when checksum is unchanged", async () => {
    await writeFile(join(sourceDir, "data.txt"), "unchanged data");

    const first = await backend.backup({
      instanceId: "inst-dup",
      localPath: sourceDir,
      encrypt: false,
      force: false,
    });
    expect(first.status).toBe("success");

    const second = await backend.backup({
      instanceId: "inst-dup",
      localPath: sourceDir,
      encrypt: false,
      force: false,
    });
    expect(second.status).toBe("skipped");
    expect(second.message).toContain("Checksum unchanged");
  });

  it("should force backup even when checksum unchanged", async () => {
    await writeFile(join(sourceDir, "data.txt"), "some data");

    await backend.backup({
      instanceId: "inst-force",
      localPath: sourceDir,
      encrypt: false,
      force: false,
    });

    const forced = await backend.backup({
      instanceId: "inst-force",
      localPath: sourceDir,
      encrypt: false,
      force: true,
    });
    expect(forced.status).toBe("success");
  });

  it("should skip restore when no backup exists", async () => {
    const result = await backend.restore({
      instanceId: "nonexistent",
      localPath: restoreDir,
      encrypt: false,
      force: false,
    });
    expect(result.status).toBe("skipped");
    expect(result.message).toContain("No backup found");
  });

  it("should skip restore when remote is not newer", async () => {
    await writeFile(join(sourceDir, "data.txt"), "data");

    const backupResult = await backend.backup({
      instanceId: "inst-ts",
      localPath: sourceDir,
      encrypt: false,
      force: false,
    });
    expect(backupResult.status).toBe("success");

    // Use a future timestamp as lastSyncedAt
    const futureTs = new Date(Date.now() + 60000).toISOString();
    const restoreResult = await backend.restore({
      instanceId: "inst-ts",
      localPath: restoreDir,
      lastSyncedAt: futureTs,
      encrypt: false,
      force: false,
    });
    expect(restoreResult.status).toBe("skipped");
    expect(restoreResult.message).toContain("not newer");
  });

  it("should return last backup timestamp", async () => {
    expect(await backend.getLastBackupTimestamp("no-backup")).toBeNull();

    await writeFile(join(sourceDir, "f.txt"), "x");
    await backend.backup({
      instanceId: "inst-ts2",
      localPath: sourceDir,
      encrypt: false,
      force: false,
    });

    const ts = await backend.getLastBackupTimestamp("inst-ts2");
    expect(ts).toBeDefined();
    expect(new Date(ts!).getTime()).toBeGreaterThan(0);
  });

  it("should backup and restore with encryption", async () => {
    const key = randomBytes(32).toString("hex");
    const content = "encrypted state data";
    await writeFile(join(sourceDir, "secret.json"), content);

    const backupResult = await backend.backup({
      instanceId: "enc-1",
      localPath: sourceDir,
      encrypt: true,
      encryptionKey: key,
      force: false,
    });
    expect(backupResult.status).toBe("success");

    const restoreResult = await backend.restore({
      instanceId: "enc-1",
      localPath: restoreDir,
      encrypt: true,
      encryptionKey: key,
      force: false,
    });
    expect(restoreResult.status).toBe("success");

    const restored = await readFile(join(restoreDir, "secret.json"), "utf-8");
    expect(restored).toBe(content);
  });

  it("should fail restore with wrong encryption key", async () => {
    const key1 = randomBytes(32).toString("hex");
    const key2 = randomBytes(32).toString("hex");

    await writeFile(join(sourceDir, "secret.json"), "data");

    await backend.backup({
      instanceId: "enc-wrong",
      localPath: sourceDir,
      encrypt: true,
      encryptionKey: key1,
      force: false,
    });

    const result = await backend.restore({
      instanceId: "enc-wrong",
      localPath: restoreDir,
      encrypt: true,
      encryptionKey: key2,
      force: false,
    });
    expect(result.status).toBe("error");
  });
});

describe("encryption helpers", () => {
  it("should encrypt and decrypt a buffer", () => {
    const key = randomBytes(32).toString("hex");
    const plaintext = Buffer.from("hello world encryption test");

    const encrypted = encryptBuffer(plaintext, key);
    expect(encrypted).not.toEqual(plaintext);
    expect(encrypted.length).toBeGreaterThan(plaintext.length);

    const decrypted = decryptBuffer(encrypted, key);
    expect(decrypted).toEqual(plaintext);
  });

  it("should reject invalid key length", () => {
    expect(() => encryptBuffer(Buffer.from("test"), "short")).toThrow(
      "32 bytes",
    );
    expect(() => decryptBuffer(Buffer.alloc(30), "short")).toThrow(
      "32 bytes",
    );
  });

  it("should reject tampered ciphertext", () => {
    const key = randomBytes(32).toString("hex");
    const encrypted = encryptBuffer(Buffer.from("test data"), key);

    // Tamper with the ciphertext
    encrypted[encrypted.length - 1] ^= 0xff;

    expect(() => decryptBuffer(encrypted, key)).toThrow();
  });

  it("should reject too-short encrypted data", () => {
    const key = randomBytes(32).toString("hex");
    expect(() => decryptBuffer(Buffer.alloc(10), key)).toThrow("too short");
  });
});
