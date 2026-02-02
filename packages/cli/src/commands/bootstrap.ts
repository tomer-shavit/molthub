import inquirer from "inquirer";
import chalk from "chalk";
import ora, { Ora } from "ora";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { execSync } from "child_process";
import {
  CloudProviderFactory,
  CloudProviderType,
  CloudResources,
  BootstrapOptions,
  ProgressCallback,
} from "@clawster/cloud-providers";

interface CLIBootstrapOptions {
  provider?: CloudProviderType;
  region?: string;
  workspace?: string;
  skipWizard?: boolean;
  yes?: boolean;
}

interface ConfigFile {
  version: string;
  provider: CloudProviderType;
  region: string;
  workspace: string;
  resources: CloudResources;
  createdAt: string;
}

const CLAWSTER_DIR = path.join(os.homedir(), ".clawster");
const REGIONS: Record<CloudProviderType, string[]> = {
  aws: ["us-east-1", "us-west-2", "eu-west-1", "eu-central-1", "ap-southeast-1"],
  azure: ["eastus", "westus2", "westeurope", "southeastasia"],
  gcp: ["us-central1", "us-east1", "europe-west1", "asia-east1"],
  digitalocean: ["nyc1", "nyc3", "ams3", "fra1", "sgp1"],
  selfhosted: ["local"],
  simulated: ["local"],
};

export async function bootstrap(options: CLIBootstrapOptions) {
  console.log(chalk.blue.bold("🚀 Clawster Bootstrap"));
  console.log(chalk.gray("Set up cloud infrastructure for your OpenClaw fleet\n"));

  // Interactive wizard if not all options provided
  let config = await gatherConfiguration(options);

  // Check prerequisites
  const prereqSpinner = ora("Checking prerequisites...").start();
  const prereqs = await checkPrerequisites(config.provider);
  prereqSpinner.stop();

  if (!prereqs.allPassed) {
    console.log(chalk.red("\n❌ Prerequisites check failed:"));
    for (const check of prereqs.checks) {
      if (check.passed) {
        console.log(chalk.green(`  ✓ ${check.name}`));
      } else {
        console.log(chalk.red(`  ✗ ${check.name}`));
        console.log(chalk.gray(`    ${check.message}`));
        if (check.fix) {
          console.log(chalk.yellow(`    Fix: ${check.fix}`));
        }
      }
    }
    console.log();
    process.exit(1);
  }

  console.log(chalk.green("✓ All prerequisites passed\n"));

  // Confirm before proceeding
  if (!options.yes) {
    console.log(chalk.white("Configuration summary:"));
    console.log(chalk.gray(`  Provider: ${config.provider}`));
    console.log(chalk.gray(`  Region: ${config.region}`));
    console.log(chalk.gray(`  Workspace: ${config.workspace}`));
    console.log();

    const { confirm } = await inquirer.prompt([{
      type: "confirm",
      name: "confirm",
      message: chalk.yellow("This will create cloud resources. Continue?"),
      default: false,
    }]);

    if (!confirm) {
      console.log(chalk.yellow("\nBootstrap cancelled."));
      return;
    }
  }

  console.log();

  // Initialize provider and bootstrap
  try {
    const provider = CloudProviderFactory.createProvider(config.provider);
    await provider.initialize({
      provider: config.provider,
      region: config.region,
      workspace: config.workspace,
    });

    // Validate configuration
    const validation = await provider.validate();
    if (!validation.valid) {
      console.log(chalk.red("\n❌ Provider validation failed:"));
      for (const error of validation.errors) {
        console.log(chalk.red(`  • ${error}`));
      }
      process.exit(1);
    }

    // Show warnings
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow("⚠ Warnings:"));
      for (const warning of validation.warnings) {
        console.log(chalk.yellow(`  • ${warning}`));
      }
      console.log();
    }

    // Bootstrap infrastructure
    const bootstrapSpinner = ora("Creating infrastructure...").start();
    const progressCallback: ProgressCallback = (step, status, message) => {
      if (status === "complete") {
        bootstrapSpinner.succeed(message || `Completed: ${step}`);
      } else if (status === "error") {
        bootstrapSpinner.fail(message || `Failed: ${step}`);
      } else if (status === "in_progress") {
        bootstrapSpinner.text = message || `${step}...`;
      }
    };

    const resources = await provider.bootstrap({
      workspace: config.workspace,
      region: config.region,
      createVpc: true,
      tags: {
        managedBy: "clawster",
        workspace: config.workspace,
      },
    }, progressCallback);

    // Save configuration
    const configFile: ConfigFile = {
      version: "1.0.0",
      provider: config.provider,
      region: config.region,
      workspace: config.workspace,
      resources,
      createdAt: new Date().toISOString(),
    };

    await fs.ensureDir(CLAWSTER_DIR);
    const configPath = path.join(CLAWSTER_DIR, `${config.workspace}.json`);
    await fs.writeJson(configPath, configFile, { spaces: 2 });

    // Save environment variables
    const envVars = generateEnvVars(configFile);
    const envPath = path.join(CLAWSTER_DIR, `${config.workspace}.env`);
    await fs.writeFile(envPath, envVars, "utf-8");

    console.log();
    console.log(chalk.green.bold("✓ Bootstrap complete!"));
    console.log();
    console.log(chalk.white("Configuration saved to:"));
    console.log(chalk.gray(`  ${configPath}`));
    console.log();
    console.log(chalk.white("Environment variables saved to:"));
    console.log(chalk.gray(`  ${envPath}`));
    console.log();
    console.log(chalk.white("Next steps:"));
    console.log(chalk.gray("  1. Source the environment: ") + chalk.cyan(`source ${envPath}`));
    console.log(chalk.gray("  2. Start the database: ") + chalk.cyan("clawster db:start"));
    console.log(chalk.gray("  3. Run migrations: ") + chalk.cyan("clawster db:migrate"));
    console.log(chalk.gray("  4. Create admin user: ") + chalk.cyan("clawster auth:create-user"));
    console.log(chalk.gray("  5. Start the API: ") + chalk.cyan("clawster dev:api"));
    console.log();

    if (config.provider === "aws") {
      console.log(chalk.white("AWS Console URLs:"));
      console.log(chalk.gray(`  ECS Cluster: ${provider.getConsoleUrl("cluster", resources.clusterId)}`));
      if (resources.logging.logGroupName) {
        console.log(chalk.gray(`  CloudWatch Logs: ${provider.getConsoleUrl("logs", resources.logging.logGroupName)}`));
      }
      console.log();
    }

  } catch (error) {
    console.log();
    console.log(chalk.red.bold("❌ Bootstrap failed"));
    console.log(chalk.red((error as Error).message));
    if (process.env.DEBUG) {
      console.error(error);
    }
    process.exit(1);
  }
}

async function gatherConfiguration(options: CLIBootstrapOptions): Promise<{
  provider: CloudProviderType;
  region: string;
  workspace: string;
}> {
  let provider = options.provider;
  let region = options.region;
  let workspace = options.workspace;

  const availableProviders = CloudProviderFactory.getAvailableProviders();
  const readyProviders = availableProviders.filter(p => p.status === "ready");

  // Select provider
  if (!provider) {
    const { selectedProvider } = await inquirer.prompt([{
      type: "list",
      name: "selectedProvider",
      message: "Select cloud provider:",
      choices: availableProviders.map(p => ({
        name: `${p.name} ${p.status === "ready" ? "✓" : "(coming soon)"}`,
        value: p.type,
        disabled: p.status !== "ready" ? "Not yet implemented" : false,
      })),
    }]);
    provider = selectedProvider;
  }

  // Check if provider is ready
  if (!CloudProviderFactory.isProviderReady(provider!)) {
    console.log(chalk.red(`\n❌ Provider '${provider}' is not yet implemented.`));
    console.log(chalk.yellow("Please choose AWS or self-hosted instead."));
    process.exit(1);
  }

  // Select region
  if (!region) {
    const providerRegions = REGIONS[provider as CloudProviderType];
    const { selectedRegion } = await inquirer.prompt([{
      type: "list",
      name: "selectedRegion",
      message: "Select region:",
      choices: providerRegions,
      default: providerRegions[0],
    }]);
    region = selectedRegion;
  }

  // Enter workspace name
  if (!workspace) {
    const { selectedWorkspace } = await inquirer.prompt([{
      type: "input",
      name: "selectedWorkspace",
      message: "Workspace name:",
      default: "default",
      validate: (input: string) => {
        if (!input) return "Workspace name is required";
        if (!/^[a-z0-9-]+$/.test(input)) {
          return "Workspace name must be lowercase alphanumeric with hyphens only";
        }
        return true;
      },
    }]);
    workspace = selectedWorkspace;
  }

  return { provider: provider!, region: region!, workspace: workspace! };
}

interface PrerequisiteCheck {
  name: string;
  passed: boolean;
  message: string;
  fix?: string;
}

async function checkPrerequisites(provider: CloudProviderType): Promise<{
  allPassed: boolean;
  checks: PrerequisiteCheck[];
}> {
  const checks: PrerequisiteCheck[] = [];

  // Check Node.js
  try {
    const version = execSync("node --version", { encoding: "utf-8" }).trim();
    checks.push({
      name: "Node.js",
      passed: true,
      message: version,
    });
  } catch {
    checks.push({
      name: "Node.js",
      passed: false,
      message: "Node.js is not installed",
      fix: "Install Node.js 18+ from https://nodejs.org",
    });
  }

  // Check Docker (skip for simulated provider)
  if (provider !== "simulated") {
    try {
      const version = execSync("docker --version", { encoding: "utf-8" }).trim();
      checks.push({
        name: "Docker",
        passed: true,
        message: version,
      });
    } catch {
      checks.push({
        name: "Docker",
        passed: false,
        message: "Docker is not installed or not in PATH",
        fix: "Install Docker from https://docker.com",
      });
    }
  }

  // Provider-specific checks
  if (provider === "aws") {
    try {
      const result = execSync("aws --version", { encoding: "utf-8" }).trim();
      checks.push({
        name: "AWS CLI",
        passed: true,
        message: result.split("\n")[0],
      });
    } catch {
      checks.push({
        name: "AWS CLI",
        passed: false,
        message: "AWS CLI is not installed",
        fix: "Install AWS CLI from https://aws.amazon.com/cli",
      });
    }

    // Check AWS credentials
    try {
      execSync("aws sts get-caller-identity", { stdio: "pipe" });
      checks.push({
        name: "AWS Credentials",
        passed: true,
        message: "AWS credentials configured",
      });
    } catch {
      checks.push({
        name: "AWS Credentials",
        passed: false,
        message: "AWS credentials not configured or invalid",
        fix: "Run 'aws configure' to set up credentials",
      });
    }
  }

  // Check pnpm (for local development)
  try {
    const version = execSync("pnpm --version", { encoding: "utf-8" }).trim();
    checks.push({
      name: "pnpm",
      passed: true,
      message: version,
    });
  } catch {
    checks.push({
      name: "pnpm",
      passed: false,
      message: "pnpm is not installed",
      fix: "Install pnpm: npm install -g pnpm",
    });
  }

  const allPassed = checks.every(c => c.passed);
  return { allPassed, checks };
}

function generateRandomPassword(): string {
  return require("crypto").randomBytes(16).toString("hex");
}

function generateRandomSecret(): string {
  return require("crypto").randomBytes(32).toString("base64");
}

function generateEnvVars(config: ConfigFile): string {
  const lines: string[] = [
    `# Clawster Configuration - ${config.workspace}`,
    `# Generated: ${config.createdAt}`,
    "",
    `# Provider: ${config.provider}`,
    `CLAWSTER_PROVIDER=${config.provider}`,
    `CLAWSTER_REGION=${config.region}`,
    `CLAWSTER_WORKSPACE=${config.workspace}`,
    "",
  ];

  if (config.provider === "aws") {
    lines.push(
      `# AWS Configuration`,
      `AWS_REGION=${config.region}`,
      `ECS_CLUSTER_ARN=${config.resources.clusterId}`,
    );

    if (config.resources.iam.executionRoleArn) {
      lines.push(`ECS_EXECUTION_ROLE_ARN=${config.resources.iam.executionRoleArn}`);
    }
    if (config.resources.iam.taskRoleArn) {
      lines.push(`ECS_TASK_ROLE_ARN=${config.resources.iam.taskRoleArn}`);
    }
    if (config.resources.network.subnetIds.length > 0) {
      lines.push(`PRIVATE_SUBNET_IDS=${config.resources.network.subnetIds.join(",")}`);
    }
    if (config.resources.network.securityGroupId) {
      lines.push(`SECURITY_GROUP_ID=${config.resources.network.securityGroupId}`);
    }
  } else if (config.provider === "selfhosted") {
    lines.push(
      `# Self-Hosted Configuration`,
      `CLAWSTER_DATA_DIR=${config.resources.metadata.dataDir}`,
    );
  }

  lines.push(
    "",
    `# Database (update with your settings)`,
    `DATABASE_URL=postgresql://clawster:${generateRandomPassword()}@localhost:5432/clawster`,
    "",
    `# JWT Secret (generate with: openssl rand -base64 32)`,
    `JWT_SECRET=${generateRandomSecret()}`,
    "",
    `# API Configuration`,
    `PORT=4000`,
    `FRONTEND_URL=http://localhost:3000`,
    "",
  );

  return lines.join("\n");
}
