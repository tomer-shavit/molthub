import {
  DeploymentTarget,
  DeploymentTargetType,
  InstallOptions,
  InstallResult,
  MoltbotConfigPayload,
  ConfigureResult,
  TargetStatus,
  DeploymentLogOptions,
  GatewayEndpoint,
  RemoteVMConfig,
} from "../../interface/deployment-target";

/**
 * Represents an SSH command to be executed on the remote host.
 * Used internally to construct command strings that will be
 * executed via SSH when the transport layer is wired up.
 */
interface SSHCommand {
  command: string;
  args: string[];
  /** Combined shell command string for execution */
  asShellString(): string;
}

/**
 * Creates an SSHCommand object from a command and arguments.
 */
function sshCommand(command: string, args: string[]): SSHCommand {
  return {
    command,
    args,
    asShellString(): string {
      const escaped = args.map((a) => {
        // Escape single quotes for shell safety
        if (a.includes(" ") || a.includes("'") || a.includes('"')) {
          return `'${a.replace(/'/g, "'\\''")}'`;
        }
        return a;
      });
      return `${command} ${escaped.join(" ")}`;
    },
  };
}

/**
 * RemoteVMTarget manages a Moltbot gateway on a remote machine via SSH.
 *
 * This implementation constructs the correct command strings for all
 * operations. The actual SSH transport is stubbed — commands are built
 * and stored, but not yet executed over a real SSH connection.
 *
 * When SSH execution is wired up, each method will send its constructed
 * command through the SSH channel instead of running locally.
 */
export class RemoteVMTarget implements DeploymentTarget {
  readonly type = DeploymentTargetType.REMOTE_VM;

  private sshConfig: RemoteVMConfig;
  private profileName: string = "";
  private port: number = 0;

  /** Last constructed command (useful for testing/debugging) */
  private lastCommand: SSHCommand | null = null;

  constructor(config: RemoteVMConfig) {
    this.sshConfig = config;
  }

  // ── Security hardening ────────────────────────────────────────────

  /**
   * Validates the SSH configuration for security best-practices.
   * Throws if no private key is configured; warns when the SSH port is 22.
   */
  validateSSHConfig(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    if (!this.sshConfig.privateKey) {
      const msg = "SSH privateKey is not configured — password-only auth is insecure";
      console.error(`[RemoteVMTarget] ERROR: ${msg}`);
      throw new Error(msg);
    }

    const sshPort = this.sshConfig.sshPort ?? this.sshConfig.port ?? 22;
    if (sshPort === 22) {
      const warn = "SSH is using default port 22 — consider changing to a non-standard port";
      console.warn(`[RemoteVMTarget] WARN: ${warn}`);
      warnings.push(warn);
    }

    return { valid: true, warnings };
  }

  /**
   * Builds and executes a sequence of SSH commands that harden the remote
   * host against brute-force attacks and reduce the attack surface.
   *
   * Steps performed:
   *  1. Disable password-based SSH authentication
   *  2. Disable root login via SSH
   *  3. Configure UFW firewall (deny all incoming, allow SSH + gateway)
   *  4. Install & configure fail2ban
   *  5. Enable unattended security upgrades
   *  6. Create a dedicated `moltbot` system user
   *  7. Restart sshd to apply changes
   */
  private async hardenHost(config: {
    sshPort: number;
    gatewayPort?: number;
    dryRun?: boolean;
  }): Promise<string[]> {
    const { sshPort, gatewayPort, dryRun } = config;
    const additionalPorts = this.sshConfig.firewallPorts ?? [];
    const commands: string[] = [];

    // 1. Disable password authentication
    console.log("[RemoteVMTarget] Hardening: disabling SSH password authentication");
    commands.push(
      `sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config`
    );

    // 2. Disable root login
    console.log("[RemoteVMTarget] Hardening: disabling SSH root login");
    commands.push(
      `sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config`
    );

    // 3. Configure UFW firewall
    console.log("[RemoteVMTarget] Hardening: configuring UFW firewall");
    commands.push("ufw default deny incoming");
    commands.push("ufw default allow outgoing");
    commands.push(`ufw allow ${sshPort}/tcp`);
    if (gatewayPort !== undefined) {
      commands.push(`ufw allow ${gatewayPort}/tcp`);
    }
    for (const port of additionalPorts) {
      commands.push(`ufw allow ${port}/tcp`);
    }
    commands.push("ufw --force enable");

    // 4. Install and configure fail2ban
    console.log("[RemoteVMTarget] Hardening: installing fail2ban");
    commands.push("apt-get update && apt-get install -y fail2ban");

    const jail = [
      "[sshd]",
      "enabled = true",
      `port = ${sshPort}`,
      "maxretry = 5",
      "bantime = 3600",
      "findtime = 600",
    ].join("\\n");

    commands.push(`printf '${jail}\\n' > /etc/fail2ban/jail.local`);
    commands.push("systemctl enable fail2ban && systemctl restart fail2ban");

    // 5. Enable unattended-upgrades
    console.log("[RemoteVMTarget] Hardening: enabling unattended-upgrades");
    commands.push("apt-get install -y unattended-upgrades");
    commands.push("dpkg-reconfigure -plow unattended-upgrades");

    // 6. Create dedicated moltbot system user
    console.log("[RemoteVMTarget] Hardening: creating dedicated moltbot user");
    commands.push(
      "useradd --system --create-home --shell /usr/sbin/nologin moltbot || true"
    );

    // 7. Restart sshd
    console.log("[RemoteVMTarget] Hardening: restarting sshd");
    commands.push("systemctl restart sshd");

    // Execute each command on the remote host (unless dry-run)
    if (!dryRun) {
      for (const cmd of commands) {
        await this.executeRemote("bash", ["-c", cmd]);
      }
    }

    return commands;
  }

  /**
   * Constructs an SSH command and records it.
   * In the future, this will execute the command over SSH.
   * For now, it returns the constructed command string.
   */
  private async executeRemote(command: string, args: string[]): Promise<string> {
    const cmd = sshCommand(command, args);
    this.lastCommand = cmd;

    // Stub: In production, this would use ssh2 to execute:
    //   ssh -p <sshPort> <user>@<host> <cmd.asShellString()>
    // For now, return a stub response indicating the command that would run.
    const connStr = `${this.sshConfig.username}@${this.sshConfig.host}:${this.sshConfig.port}`;
    return `[SSH stub] Would execute on ${connStr}: ${cmd.asShellString()}`;
  }

  /**
   * Returns the systemd service unit name.
   * Remote VMs are assumed to be Linux.
   */
  private getSystemdUnitName(profile: string): string {
    return `moltbot-gateway-${profile}.service`;
  }

  /**
   * Returns the SSH connection string for display/logging purposes.
   */
  getConnectionString(): string {
    return `${this.sshConfig.username}@${this.sshConfig.host}:${this.sshConfig.port}`;
  }

  /**
   * Returns the last command that was constructed (for testing).
   */
  getLastCommand(): SSHCommand | null {
    return this.lastCommand;
  }

  async install(options: InstallOptions): Promise<InstallResult> {
    this.profileName = options.profileName;
    this.port = options.port;

    const serviceName = this.getSystemdUnitName(options.profileName);

    const args = [
      "gateway",
      "install",
      "--profile",
      options.profileName,
      "--port",
      options.port.toString(),
    ];

    if (options.moltbotVersion) {
      args.push("--version", options.moltbotVersion);
    }

    try {
      const output = await this.executeRemote("moltbot", args);

      // Enable linger on the remote host
      await this.executeRemote("loginctl", [
        "enable-linger",
        this.sshConfig.username,
      ]);

      // Host hardening (default: enabled)
      const shouldHarden = this.sshConfig.hardenOnInstall !== false;
      if (shouldHarden) {
        console.log("[RemoteVMTarget] Running host hardening steps...");
        const sshPort = this.sshConfig.sshPort ?? this.sshConfig.port ?? 22;
        await this.hardenHost({
          sshPort,
          gatewayPort: options.port,
        });
        console.log("[RemoteVMTarget] Host hardening complete.");
      }

      return {
        success: true,
        instanceId: `${this.sshConfig.host}:${serviceName}`,
        message: `Installed Moltbot gateway on remote VM ${this.sshConfig.host}. ${output}`,
        serviceName,
      };
    } catch (error) {
      return {
        success: false,
        instanceId: `${this.sshConfig.host}:${serviceName}`,
        message: `Failed to install on remote VM: ${error instanceof Error ? error.message : String(error)}`,
        serviceName,
      };
    }
  }

  async configure(config: MoltbotConfigPayload): Promise<ConfigureResult> {
    this.profileName = config.profileName;
    this.port = config.gatewayPort;

    const args = [
      "gateway",
      "config",
      "--profile",
      config.profileName,
      "--port",
      config.gatewayPort.toString(),
    ];

    if (config.environment) {
      for (const [key, value] of Object.entries(config.environment)) {
        args.push("--env", `${key}=${value}`);
      }
    }

    try {
      await this.executeRemote("moltbot", args);
      return {
        success: true,
        message: `Configuration applied to profile "${config.profileName}" on ${this.sshConfig.host}`,
        requiresRestart: true,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to configure: ${error instanceof Error ? error.message : String(error)}`,
        requiresRestart: false,
      };
    }
  }

  async start(): Promise<void> {
    if (!this.profileName) {
      throw new Error("Cannot start: no profile configured. Call install() or configure() first.");
    }
    const unit = this.getSystemdUnitName(this.profileName);
    await this.executeRemote("systemctl", ["--user", "start", unit]);
  }

  async stop(): Promise<void> {
    if (!this.profileName) {
      throw new Error("Cannot stop: no profile configured.");
    }
    const unit = this.getSystemdUnitName(this.profileName);
    await this.executeRemote("systemctl", ["--user", "stop", unit]);
  }

  async restart(): Promise<void> {
    if (!this.profileName) {
      throw new Error("Cannot restart: no profile configured.");
    }
    const unit = this.getSystemdUnitName(this.profileName);
    await this.executeRemote("systemctl", ["--user", "restart", unit]);
  }

  async getStatus(): Promise<TargetStatus> {
    if (!this.profileName) {
      return { state: "not-installed" };
    }

    try {
      const unit = this.getSystemdUnitName(this.profileName);
      const output = await this.executeRemote("systemctl", [
        "--user",
        "show",
        unit,
        "--property=ActiveState,MainPID",
      ]);

      // In stub mode, we return a synthetic status.
      // When SSH is wired, we would parse the actual output.
      return {
        state: "stopped",
        gatewayPort: this.port,
      };
    } catch {
      return { state: "not-installed" };
    }
  }

  async getLogs(options?: DeploymentLogOptions): Promise<string[]> {
    if (!this.profileName) {
      return [];
    }

    const unit = this.getSystemdUnitName(this.profileName);
    const args = ["--user", "-u", unit, "--no-pager", "-n", String(options?.lines ?? 100)];

    if (options?.since) {
      args.push("--since", options.since.toISOString());
    }

    try {
      const output = await this.executeRemote("journalctl", args);
      return output.split("\n").filter(Boolean);
    } catch {
      return [];
    }
  }

  async getEndpoint(): Promise<GatewayEndpoint> {
    return {
      host: this.sshConfig.host,
      port: this.port,
      protocol: "ws",
    };
  }

  async destroy(): Promise<void> {
    if (!this.profileName) return;

    try {
      await this.stop();
    } catch {
      // May already be stopped
    }

    try {
      await this.executeRemote("moltbot", [
        "gateway",
        "uninstall",
        "--profile",
        this.profileName,
      ]);
    } catch {
      // Best-effort cleanup
    }

    this.profileName = "";
    this.port = 0;
  }
}
