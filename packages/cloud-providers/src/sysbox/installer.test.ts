import { attemptSysboxInstall, type SysboxInstallResult } from "./installer";
import * as detect from "./detect";
import * as childProcess from "child_process";
import type { SysboxCapability, Platform } from "./types";

// Mock child_process.execFile for install commands
jest.mock("child_process", () => ({
  execFile: jest.fn(),
}));

// Mock detect module — keep real types
jest.mock("./detect", () => ({
  detectPlatform: jest.fn(),
  detectSysboxCapability: jest.fn(),
  getSysboxInstallCommand: jest.fn(() => "mock-install-command"),
  resetCache: jest.fn(),
}));

const mockDetectPlatform = detect.detectPlatform as jest.MockedFunction<typeof detect.detectPlatform>;
const mockDetectCapability = detect.detectSysboxCapability as jest.MockedFunction<typeof detect.detectSysboxCapability>;
const mockExecFile = childProcess.execFile as unknown as jest.MockedFunction<typeof childProcess.execFile>;

function mockCapability(overrides: Partial<SysboxCapability> = {}): SysboxCapability {
  return {
    available: "not-installed",
    reason: "Sysbox runtime not registered with Docker",
    installMethod: "apt",
    installCommand: "mock-install-command",
    ...overrides,
  };
}

/**
 * Helper: make execFile resolve or reject based on the command.
 * Accepts a map of command patterns to outcomes.
 */
function setupExecFile(
  outcomes: Array<{
    match: (cmd: string, args: string[]) => boolean;
    result: "resolve" | "reject";
    stdout?: string;
    stderr?: string;
  }>,
) {
  mockExecFile.mockImplementation(((
    cmd: string,
    args: string[],
    opts: unknown,
    cb: (err: Error | null, stdout: string, stderr: string) => void,
  ) => {
    const outcome = outcomes.find((o) => o.match(cmd, args as string[]));
    if (!outcome || outcome.result === "reject") {
      const stderr = outcome?.stderr ?? "command failed";
      cb(new Error(stderr), "", stderr);
    } else {
      cb(null, outcome.stdout ?? "", "");
    }
    return undefined;
  }) as unknown as typeof childProcess.execFile);
}

describe("attemptSysboxInstall", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns success immediately if Sysbox is already available", async () => {
    mockDetectCapability.mockResolvedValue(mockCapability({ available: "available", version: "0.6.4" }));

    const result = await attemptSysboxInstall();

    expect(result.success).toBe(true);
    expect(result.message).toContain("already installed");
    // Should not attempt any install commands
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  describe("Linux/WSL2", () => {
    it("installs successfully with passwordless sudo", async () => {
      // First call: not installed. Second call (verify): available
      mockDetectCapability
        .mockResolvedValueOnce(mockCapability({ available: "not-installed" }))
        .mockResolvedValueOnce(mockCapability({ available: "available", version: "0.6.4" }));
      mockDetectPlatform.mockReturnValue("linux");

      setupExecFile([
        { match: (cmd) => cmd === "sudo", result: "resolve", stdout: "installed" },
      ]);

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(true);
      expect(result.message).toContain("verified");
    });

    it("returns manual instructions when sudo requires password", async () => {
      mockDetectCapability.mockResolvedValue(mockCapability({ available: "not-installed" }));
      mockDetectPlatform.mockReturnValue("linux");

      setupExecFile([
        {
          match: (cmd) => cmd === "sudo",
          result: "reject",
          stderr: "sudo: a password is required",
        },
      ]);

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(false);
      expect(result.requiresManualAction).toBe(true);
      expect(result.manualCommand).toContain("sudo");
    });

    it("returns manual instructions on install script failure", async () => {
      mockDetectCapability.mockResolvedValue(mockCapability({ available: "not-installed" }));
      mockDetectPlatform.mockReturnValue("linux");

      setupExecFile([
        {
          match: (cmd) => cmd === "sudo",
          result: "reject",
          stderr: "curl: (7) Failed to connect",
        },
      ]);

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(false);
      expect(result.requiresManualAction).toBe(true);
      expect(result.manualCommand).toBeDefined();
    });

    it("handles Docker restart failure after successful install", async () => {
      mockDetectCapability.mockResolvedValue(mockCapability({ available: "not-installed" }));
      mockDetectPlatform.mockReturnValue("linux");

      let callCount = 0;
      setupExecFile([
        {
          // First sudo call (install) succeeds
          match: (cmd, args) => {
            if (cmd === "sudo" && args.includes("bash")) {
              callCount++;
              return callCount === 1;
            }
            return false;
          },
          result: "resolve",
        },
        {
          // Second sudo call (systemctl restart) fails
          match: (cmd, args) => cmd === "sudo" && args.includes("systemctl"),
          result: "reject",
          stderr: "Failed to restart docker.service",
        },
      ]);

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(false);
      expect(result.message).toContain("Docker restart failed");
      expect(result.manualCommand).toContain("systemctl restart docker");
    });
  });

  describe("WSL2 specific", () => {
    it("checks systemd before attempting install", async () => {
      mockDetectCapability.mockResolvedValue(mockCapability({ available: "not-installed" }));
      mockDetectPlatform.mockReturnValue("wsl2");

      setupExecFile([
        {
          match: (cmd, args) => cmd === "ps" && args.includes("comm="),
          result: "resolve",
          stdout: "init", // systemd NOT running
        },
      ]);

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(false);
      expect(result.requiresManualAction).toBe(true);
      expect(result.manualCommand).toContain("wsl.conf");
    });

    it("proceeds with install when systemd is running", async () => {
      mockDetectCapability
        .mockResolvedValueOnce(mockCapability({ available: "not-installed" }))
        .mockResolvedValueOnce(mockCapability({ available: "available" }));
      mockDetectPlatform.mockReturnValue("wsl2");

      setupExecFile([
        {
          match: (cmd, args) => cmd === "ps" && args.includes("comm="),
          result: "resolve",
          stdout: "systemd",
        },
        { match: (cmd) => cmd === "sudo", result: "resolve" },
      ]);

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(true);
    });
  });

  describe("macOS", () => {
    it("installs Lima and creates VM when Lima is missing", async () => {
      mockDetectCapability
        .mockResolvedValueOnce(mockCapability({ available: "not-installed", installMethod: "lima" }))
        .mockResolvedValueOnce(mockCapability({ available: "available" }));
      mockDetectPlatform.mockReturnValue("macos");

      setupExecFile([
        {
          match: (cmd) => cmd === "limactl",
          result: "reject",
          stderr: "command not found",
        },
        {
          match: (cmd, args) => cmd === "brew" && args.includes("lima"),
          result: "resolve",
        },
        {
          match: (cmd, args) => cmd === "limactl" && args.includes("start"),
          result: "resolve",
        },
      ]);

      // Override for second limactl call (list --json for existing VM check)
      // and third (start --name=clawster)
      let limactlCalls = 0;
      mockExecFile.mockImplementation(((
        cmd: string,
        args: string[],
        opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (cmd === "limactl") {
          limactlCalls++;
          if (limactlCalls === 1) {
            // --version check fails
            cb(new Error("command not found"), "", "command not found");
          } else if (args.includes("--json")) {
            // list returns empty
            cb(null, "[]", "");
          } else if (args.includes("start")) {
            cb(null, "started", "");
          } else {
            cb(new Error("unexpected"), "", "");
          }
        } else if (cmd === "brew") {
          cb(null, "installed", "");
        } else {
          cb(new Error("unexpected command"), "", "");
        }
        return undefined;
      }) as unknown as typeof childProcess.execFile);

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(true);
    });

    it("returns manual instructions when brew fails", async () => {
      mockDetectCapability.mockResolvedValue(
        mockCapability({ available: "not-installed", installMethod: "lima" }),
      );
      mockDetectPlatform.mockReturnValue("macos");

      mockExecFile.mockImplementation(((
        cmd: string,
        _args: string[],
        _opts: unknown,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        if (cmd === "limactl") {
          cb(new Error("not found"), "", "not found");
        } else if (cmd === "brew") {
          cb(new Error("brew not found"), "", "brew not found");
        } else {
          cb(new Error("unexpected"), "", "");
        }
        return undefined;
      }) as unknown as typeof childProcess.execFile);

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(false);
      expect(result.requiresManualAction).toBe(true);
      expect(result.manualCommand).toContain("brew install lima");
    });
  });

  describe("Windows native", () => {
    it("returns manual WSL2 instructions", async () => {
      mockDetectCapability.mockResolvedValue(
        mockCapability({ available: "unavailable", reason: "Sysbox requires Linux" }),
      );
      mockDetectPlatform.mockReturnValue("windows-native");

      const result = await attemptSysboxInstall();

      expect(result.success).toBe(false);
      expect(result.requiresManualAction).toBe(true);
      expect(result.manualCommand).toContain("wsl --install");
    });
  });

  describe("log callback", () => {
    it("calls logCallback with progress messages", async () => {
      mockDetectCapability.mockResolvedValue(mockCapability({ available: "not-installed" }));
      mockDetectPlatform.mockReturnValue("linux");

      setupExecFile([
        {
          match: (cmd) => cmd === "sudo",
          result: "reject",
          stderr: "a password is required",
        },
      ]);

      const logs: Array<{ msg: string; stream: string }> = [];
      await attemptSysboxInstall((msg, stream) => logs.push({ msg, stream }));

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((l) => l.msg.includes("Platform detected"))).toBe(true);
    });
  });
});
