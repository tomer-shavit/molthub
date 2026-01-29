import chalk from "chalk";
import ora from "ora";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import { glob } from "glob";

const MOLTHUB_DIR = path.join(os.homedir(), ".molthub");

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn" | "skip";
  message: string;
  fix?: string;
}

export interface DoctorOptions {
  security?: boolean;
}

export async function doctor(options: DoctorOptions = {}) {
  const securityOnly = options.security === true;

  if (securityOnly) {
    console.log(chalk.blue.bold("🔒 Molthub Security Doctor\n"));
    console.log(chalk.gray("Running security-focused diagnostics...\n"));
  } else {
    console.log(chalk.blue.bold("🔧 Molthub Doctor\n"));
    console.log(chalk.gray("Diagnosing common issues...\n"));
  }

  const checks: CheckResult[] = [];
  const spinner = ora(securityOnly ? "Running security checks..." : "Running diagnostics...").start();

  if (!securityOnly) {

  // Check 1: Node.js version
  try {
    const version = process.version;
    const majorVersion = parseInt(version.slice(1).split(".")[0]);
    if (majorVersion >= 18) {
      checks.push({
        name: "Node.js version",
        status: "pass",
        message: version,
      });
    } else {
      checks.push({
        name: "Node.js version",
        status: "fail",
        message: `${version} (requires 18+)`,
        fix: "Upgrade Node.js to version 18 or higher",
      });
    }
  } catch (error) {
    checks.push({
      name: "Node.js version",
      status: "fail",
      message: "Could not determine version",
    });
  }

  // Check 2: Docker
  try {
    const version = execSync("docker --version", { encoding: "utf-8", stdio: "pipe" }).trim();
    checks.push({
      name: "Docker",
      status: "pass",
      message: version.split("\n")[0],
    });
  } catch {
    checks.push({
      name: "Docker",
      status: "fail",
      message: "Not installed or not in PATH",
      fix: "Install Docker from https://docker.com",
    });
  }

  // Check 3: Docker Compose
  try {
    execSync("docker compose version", { encoding: "utf-8", stdio: "pipe" });
    checks.push({
      name: "Docker Compose",
      status: "pass",
      message: "Installed",
    });
  } catch {
    checks.push({
      name: "Docker Compose",
      status: "warn",
      message: "Plugin not found",
      fix: "Update Docker to include the Compose plugin",
    });
  }

  // Check 4: AWS CLI (if AWS config exists)
  const hasAwsConfig = await fs.pathExists(path.join(MOLTHUB_DIR, ".aws")) ||
                       process.env.AWS_ACCESS_KEY_ID;
  if (hasAwsConfig) {
    try {
      execSync("aws --version", { encoding: "utf-8", stdio: "pipe" });
      
      // Check credentials
      try {
        execSync("aws sts get-caller-identity", { stdio: "pipe" });
        checks.push({
          name: "AWS credentials",
          status: "pass",
          message: "Configured and valid",
        });
      } catch {
        checks.push({
          name: "AWS credentials",
          status: "fail",
          message: "Invalid or expired",
          fix: "Run 'aws configure' or check your AWS credentials",
        });
      }
    } catch {
      checks.push({
        name: "AWS CLI",
        status: "fail",
        message: "Not installed",
        fix: "Install AWS CLI from https://aws.amazon.com/cli",
      });
    }
  }

  // Check 5: Molthub configuration
  const configFiles = await fs.readdir(MOLTHUB_DIR).catch(() => []);
  const workspaceConfigs = configFiles.filter(f => f.endsWith(".json") && f !== "users.json");
  
  if (workspaceConfigs.length > 0) {
    checks.push({
      name: "Molthub configuration",
      status: "pass",
      message: `${workspaceConfigs.length} workspace(s) configured`,
    });

    // Check each workspace
    for (const configFile of workspaceConfigs) {
      const configPath = path.join(MOLTHUB_DIR, configFile);
      try {
        const config = await fs.readJson(configPath);
        if (config.resources && config.provider) {
          checks.push({
            name: `  └─ ${configFile.replace(".json", "")}`,
            status: "pass",
            message: `${config.provider} in ${config.region}`,
          });
        } else {
          checks.push({
            name: `  └─ ${configFile.replace(".json", "")}`,
            status: "warn",
            message: "Incomplete configuration",
            fix: "Run 'molthub init' to reconfigure",
          });
        }
      } catch {
        checks.push({
          name: `  └─ ${configFile.replace(".json", "")}`,
          status: "fail",
          message: "Invalid JSON",
          fix: `Delete ${configPath} and reconfigure`,
        });
      }
    }
  } else {
    checks.push({
      name: "Molthub configuration",
      status: "warn",
      message: "No workspaces configured",
      fix: "Run 'molthub init' to set up a workspace",
    });
  }

  // Check 6: Environment variables
  const requiredVars = ["DATABASE_URL"];
  const missingVars = requiredVars.filter(v => !process.env[v]);
  
  if (missingVars.length === 0) {
    checks.push({
      name: "Environment variables",
      status: "pass",
      message: "Required variables set",
    });
  } else {
    checks.push({
      name: "Environment variables",
      status: "warn",
      message: `Missing: ${missingVars.join(", ")}`,
      fix: "Source your workspace .env file or set the variables",
    });
  }

  // Check 7: pnpm
  try {
    const version = execSync("pnpm --version", { encoding: "utf-8", stdio: "pipe" }).trim();
    checks.push({
      name: "pnpm",
      status: "pass",
      message: version,
    });
  } catch {
    checks.push({
      name: "pnpm",
      status: "warn",
      message: "Not installed",
      fix: "Install pnpm: npm install -g pnpm",
    });
  }

  } // end if (!securityOnly)

  // ── Security Checks ────────────────────────────────────────────────────

  // Check 8: SSH Key Permissions
  const sshDir = path.join(os.homedir(), ".ssh");
  if (os.platform() !== "win32") {
    if (await fs.pathExists(sshDir)) {
      try {
        const sshFiles = await fs.readdir(sshDir);
        const badPerms: string[] = [];

        for (const file of sshFiles) {
          const filePath = path.join(sshDir, file);
          try {
            const stat = await fs.stat(filePath);
            if (!stat.isFile()) continue;

            const mode = (stat.mode & 0o777).toString(8);

            if (file.endsWith(".pub")) {
              // Public keys should be 644 or stricter
              if (stat.mode & 0o022) {
                // World or group writable
                badPerms.push(`${file} (${mode}, expected 644 or stricter)`);
              }
            } else if (!file.startsWith("known_hosts") && !file.startsWith("config") && !file.startsWith("authorized_keys")) {
              // Private keys should be 600
              if (stat.mode & 0o077) {
                badPerms.push(`${file} (${mode}, expected 600)`);
              }
            }
          } catch {
            // Skip files we can't stat
          }
        }

        if (badPerms.length === 0) {
          checks.push({
            name: "SSH key permissions",
            status: "pass",
            message: "All SSH key files have correct permissions",
          });
        } else {
          checks.push({
            name: "SSH key permissions",
            status: "warn",
            message: `SSH key files have overly permissive modes: ${badPerms.join(", ")}`,
            fix: "Run: chmod 600 ~/.ssh/<private-key> && chmod 644 ~/.ssh/<key>.pub",
          });
        }
      } catch {
        checks.push({
          name: "SSH key permissions",
          status: "warn",
          message: "Could not read SSH directory",
        });
      }
    } else {
      checks.push({
        name: "SSH key permissions",
        status: "skip",
        message: "No SSH directory found (not applicable)",
      });
    }
  } else {
    checks.push({
      name: "SSH key permissions",
      status: "skip",
      message: "Not applicable on Windows",
    });
  }

  // Check 9: Docker Socket Permissions
  const dockerSocket = "/var/run/docker.sock";
  if (os.platform() !== "win32") {
    if (await fs.pathExists(dockerSocket)) {
      try {
        const stat = await fs.stat(dockerSocket);
        const mode = stat.mode & 0o777;
        // Check if world-readable (others have read permission)
        if (mode & 0o004) {
          checks.push({
            name: "Docker socket permissions",
            status: "warn",
            message: `Docker socket is world-readable (mode: ${mode.toString(8)})`,
            fix: "Run: sudo chmod 660 /var/run/docker.sock",
          });
        } else {
          checks.push({
            name: "Docker socket permissions",
            status: "pass",
            message: "Docker socket has restricted permissions",
          });
        }
      } catch {
        checks.push({
          name: "Docker socket permissions",
          status: "pass",
          message: "Docker socket not accessible (restricted)",
        });
      }
    } else {
      checks.push({
        name: "Docker socket permissions",
        status: "skip",
        message: "Docker socket not found",
      });
    }
  } else {
    checks.push({
      name: "Docker socket permissions",
      status: "skip",
      message: "Not applicable on Windows",
    });
  }

  // Check 10: Plaintext Secrets Detection
  try {
    const secretPattern = /(?:token|secret|password|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_-]{20,}/i;
    const configGlobs = [
      path.join(os.homedir(), ".molthub", "**", "*.json"),
      path.join(os.homedir(), ".molthub", "**", "*.yaml"),
    ];

    const filesWithSecrets: string[] = [];

    for (const pattern of configGlobs) {
      const matchedFiles = await glob(pattern, { nodir: true });
      for (const file of matchedFiles) {
        try {
          const content = await fs.readFile(file, "utf-8");
          if (secretPattern.test(content)) {
            filesWithSecrets.push(path.relative(os.homedir(), file));
          }
        } catch {
          // Skip unreadable files
        }
      }
    }

    if (filesWithSecrets.length === 0) {
      checks.push({
        name: "Plaintext secrets detection",
        status: "pass",
        message: "No plaintext secrets detected in config files",
      });
    } else {
      checks.push({
        name: "Plaintext secrets detection",
        status: "warn",
        message: `Possible plaintext secrets found in: ${filesWithSecrets.join(", ")}`,
        fix: "Move secrets to environment variables or a secret manager",
      });
    }
  } catch {
    checks.push({
      name: "Plaintext secrets detection",
      status: "pass",
      message: "No config directory to scan",
    });
  }

  // Check 11: fail2ban Status (Linux only)
  if (os.platform() === "linux") {
    try {
      const status = execSync("systemctl is-active fail2ban", {
        encoding: "utf-8",
        stdio: "pipe",
      }).trim();

      if (status === "active") {
        checks.push({
          name: "fail2ban",
          status: "pass",
          message: "fail2ban is installed and active",
        });
      } else {
        checks.push({
          name: "fail2ban",
          status: "warn",
          message: `fail2ban is installed but not active (status: ${status})`,
          fix: "Run: sudo systemctl enable --now fail2ban",
        });
      }
    } catch {
      // Check if fail2ban is installed at all
      try {
        execSync("which fail2ban-server", { encoding: "utf-8", stdio: "pipe" });
        checks.push({
          name: "fail2ban",
          status: "warn",
          message: "fail2ban is installed but not running",
          fix: "Run: sudo systemctl enable --now fail2ban",
        });
      } catch {
        checks.push({
          name: "fail2ban",
          status: "warn",
          message: "fail2ban is not installed — recommended for SSH protection",
          fix: "Run: sudo apt install fail2ban && sudo systemctl enable --now fail2ban",
        });
      }
    }
  } else {
    checks.push({
      name: "fail2ban",
      status: "skip",
      message: "Not a Linux system",
    });
  }

  spinner.stop();
  console.log();

  // Display results
  const passCount = checks.filter(c => c.status === "pass").length;
  const failCount = checks.filter(c => c.status === "fail").length;
  const warnCount = checks.filter(c => c.status === "warn").length;

  for (const check of checks) {
    const icon = check.status === "pass" ? chalk.green("✓") :
                 check.status === "fail" ? chalk.red("✗") :
                 check.status === "skip" ? chalk.gray("—") :
                 chalk.yellow("⚠");

    const color = check.status === "pass" ? chalk.green :
                  check.status === "fail" ? chalk.red :
                  check.status === "skip" ? chalk.gray :
                  chalk.yellow;

    console.log(`${icon} ${check.name}: ${color(check.message)}`);

    if (check.fix && (securityOnly || check.status !== "pass")) {
      console.log(chalk.gray(`   Fix: ${check.fix}`));
    }
  }

  console.log();
  
  if (failCount === 0 && warnCount === 0) {
    console.log(chalk.green.bold("✓ All checks passed!"));
  } else {
    console.log(chalk.white("Summary: ") + 
      chalk.green(`${passCount} passed`) + ", " + 
      (failCount > 0 ? chalk.red(`${failCount} failed`) + ", " : "") +
      (warnCount > 0 ? chalk.yellow(`${warnCount} warnings`) : "")
    );
    
    if (failCount > 0) {
      console.log();
      console.log(chalk.red("Please fix the failed checks before continuing."));
      process.exit(1);
    }
  }

  console.log();
}