#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { bootstrap } from "./commands/bootstrap";
import { status } from "./commands/status";
import { doctor } from "./commands/doctor";
import { createUser, login, listUsers, deleteUser } from "./commands/auth";
import { MOLTHUB_VERSION } from "@molthub/core";

const program = new Command();

program
  .name("molthub")
  .description("Molthub CLI - Control plane for Moltbot instances")
  .version(MOLTHUB_VERSION);

// Bootstrap command
program
  .command("init")
  .description("Initialize Molthub infrastructure with interactive wizard")
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
  .description("Check Molthub status and instance health")
  .option("-w, --workspace <name>", "Workspace name")
  .action(status);

program
  .command("doctor")
  .description("Diagnose common issues with Molthub setup")
  .action(doctor);

// Authentication commands
const auth = program
  .command("auth")
  .description("Authentication management commands");

auth
  .command("create-user")
  .description("Create a new user account")
  .option("-u, --username <username>", "Username")
  .option("-p, --password <password>", "Password")
  .option("-r, --role <role>", "Role (admin, operator, viewer)")
  .action(createUser);

auth
  .command("login")
  .description("Login and get JWT token")
  .option("-u, --username <username>", "Username")
  .option("-p, --password <password>", "Password")
  .action(login);

auth
  .command("list-users")
  .description("List all users")
  .action(listUsers);

auth
  .command("delete-user")
  .description("Delete a user account")
  .option("-u, --username <username>", "Username to delete")
  .action(deleteUser);

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
    console.log(chalk.cyan("Run: pnpm dev --filter=@molthub/api"));
  });

dev
  .command("web")
  .description("Start web UI in development mode")
  .action(async () => {
    console.log(chalk.blue("Starting web UI..."));
    console.log(chalk.cyan("Run: pnpm dev --filter=@molthub/web"));
  });

dev
  .command("all")
  .description("Start all services in development mode")
  .action(async () => {
    console.log(chalk.blue("Starting all services..."));
    console.log(chalk.cyan("Run: pnpm dev"));
  });

// Provider commands
const provider = program
  .command("provider")
  .description("Cloud provider management");

provider
  .command("list")
  .description("List available cloud providers")
  .action(() => {
    const { CloudProviderFactory } = require("@molthub/cloud-providers");
    const providers = CloudProviderFactory.getAvailableProviders();
    
    console.log(chalk.blue.bold("\nAvailable Cloud Providers\n"));
    
    for (const p of providers) {
      const status = p.status === "ready" 
        ? chalk.green("✓ Ready") 
        : p.status === "beta" 
          ? chalk.yellow("β Beta")
          : chalk.gray("○ Coming Soon");
      
      console.log(`  ${chalk.cyan(p.name)} ${status}`);
    }
    console.log();
  });

// Add error handling
program.exitOverride();

try {
  program.parse();
} catch (error: any) {
  if (error.code !== "commander.help" && error.code !== "commander.version") {
    console.error(chalk.red("Error:"), error.message);
    process.exit(1);
  }
}