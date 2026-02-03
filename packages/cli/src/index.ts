#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { bootstrap } from "./commands/bootstrap";
import { status } from "./commands/status";
import { doctor } from "./commands/doctor";
import { setup } from "./commands/setup";
import { sysboxStatus, sysboxInstall } from "./commands/sysbox";
import { CLAWSTER_VERSION } from "@clawster/core";

const program = new Command();

program
  .name("clawster")
  .description("Clawster CLI - Control plane for OpenClaw instances")
  .version(CLAWSTER_VERSION);

// Setup command - primary entry point for new users
program
  .command("setup")
  .description("Set up Clawster for local development (environment, database)")
  .option("--skip-start", "Don't start development servers after setup")
  .option("--skip-open", "Don't open browser after setup")
  .option("--non-interactive", "Use defaults without prompting")
  .action(setup);

// Bootstrap command
program
  .command("init")
  .description("Initialize Clawster infrastructure with interactive wizard")
  .option("-p, --provider <provider>", "Cloud provider (aws, azure, gcp, digitalocean, selfhosted)")
  .option("-r, --region <region>", "Cloud region")
  .option("-w, --workspace <name>", "Workspace name")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(bootstrap);

program
  .command("bootstrap")
  .description("Alias for 'init'")
  .option("-p, --provider <provider>", "Cloud provider")
  .option("-r, --region <region>", "Cloud region")
  .option("-w, --workspace <name>", "Workspace name")
  .option("-y, --yes", "Skip confirmation prompts")
  .action(bootstrap);

// Status and diagnostics
program
  .command("status")
  .description("Check Clawster status and instance health")
  .option("-w, --workspace <name>", "Workspace name")
  .action(status);

program
  .command("doctor")
  .description("Diagnose common issues with Clawster setup")
  .action(doctor);

// Database commands
const db = program
  .command("db")
  .description("Database management commands");

db
  .command("start")
  .description("Start local PostgreSQL database (self-hosted only)")
  .action(async () => {
    console.log(chalk.blue("Starting database..."));
    console.log(chalk.yellow("Use 'docker-compose up -d postgres' in your workspace directory"));
  });

db
  .command("migrate")
  .description("Run database migrations")
  .action(async () => {
    console.log(chalk.blue("Running migrations..."));
    console.log(chalk.yellow("Run: pnpm db:migrate"));
  });

db
  .command("status")
  .description("Check database connection status")
  .action(async () => {
    console.log(chalk.blue("Checking database..."));
  });

// Development commands
const dev = program
  .command("dev")
  .description("Development commands");

dev
  .command("api")
  .description("Start API server in development mode")
  .action(async () => {
    console.log(chalk.blue("Starting API server..."));
    console.log(chalk.cyan("Run: pnpm dev --filter=@clawster/api"));
  });

dev
  .command("web")
  .description("Start web UI in development mode")
  .action(async () => {
    console.log(chalk.blue("Starting web UI..."));
    console.log(chalk.cyan("Run: pnpm dev --filter=@clawster/web"));
  });

dev
  .command("all")
  .description("Start all services in development mode")
  .action(async () => {
    console.log(chalk.blue("Starting all services..."));
    console.log(chalk.cyan("Run: pnpm dev"));
  });

// Sysbox commands
const sysbox = program
  .command("sysbox")
  .description("Sysbox runtime management for Docker sandbox support");

sysbox
  .command("status")
  .description("Check Sysbox installation status")
  .action(sysboxStatus);

sysbox
  .command("install")
  .description("Install Sysbox for the current platform")
  .action(sysboxInstall);

// Provider commands
const provider = program
  .command("provider")
  .description("Cloud provider management");

provider
  .command("list")
  .description("List available deployment targets")
  .action(() => {
    const { DeploymentTargetFactory } = require("@clawster/cloud-providers");
    const targets = DeploymentTargetFactory.getAvailableTargets();

    console.log(chalk.blue.bold("\nAvailable Deployment Targets\n"));

    for (const t of targets) {
      const status = t.status === "ready"
        ? chalk.green("✓ Ready")
        : t.status === "beta"
          ? chalk.yellow("β Beta")
          : chalk.gray("○ Coming Soon");

      console.log(`  ${chalk.cyan(t.name)} ${status}`);
      console.log(chalk.gray(`      ${t.description}`));
    }
    console.log();
  });

// Add error handling
program.exitOverride();

try {
  program.parse();
} catch (error: unknown) {
  const err = error as { code?: string; message?: string };
  if (err.code !== "commander.help" && err.code !== "commander.version") {
    console.error(chalk.red("Error:"), err.message ?? String(error));
    process.exit(1);
  }
}