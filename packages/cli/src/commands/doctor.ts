import chalk from "chalk";
import ora from "ora";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";

const MOLTHUB_DIR = path.join(os.homedir(), ".molthub");

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  fix?: string;
}

export async function doctor() {
  console.log(chalk.blue.bold("🔧 Molthub Doctor\n"));
  console.log(chalk.gray("Diagnosing common issues...\n"));

  const checks: CheckResult[] = [];
  const spinner = ora("Running diagnostics...").start();

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

  spinner.stop();
  console.log();

  // Display results
  const passCount = checks.filter(c => c.status === "pass").length;
  const failCount = checks.filter(c => c.status === "fail").length;
  const warnCount = checks.filter(c => c.status === "warn").length;

  for (const check of checks) {
    const icon = check.status === "pass" ? chalk.green("✓") :
                 check.status === "fail" ? chalk.red("✗") :
                 chalk.yellow("⚠");
    
    const color = check.status === "pass" ? chalk.green :
                  check.status === "fail" ? chalk.red :
                  chalk.yellow;
    
    console.log(`${icon} ${check.name}: ${color(check.message)}`);
    
    if (check.fix) {
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