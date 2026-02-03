import chalk from "chalk";
import { DeploymentTargetFactory } from "@clawster/cloud-providers";

interface StatusOptions {
  workspace?: string;
}

export async function status(_options: StatusOptions) {
  console.log(chalk.blue.bold("📊 Clawster Status"));
  console.log();
  console.log(chalk.yellow("⚠  The CLI status command has been deprecated."));
  console.log();
  console.log(chalk.white("Bot status monitoring is now available through the web UI:"));
  console.log();
  console.log(chalk.cyan("  1. Start Clawster:    pnpm dev"));
  console.log(chalk.cyan("  2. Open browser:      http://localhost:3000"));
  console.log(chalk.cyan("  3. View Dashboard:    Bot status, health, and logs"));
  console.log();
  console.log(chalk.white("Available deployment targets:"));
  console.log();

  const targets = DeploymentTargetFactory.getAvailableTargets();
  for (const target of targets) {
    const status = target.status === "ready"
      ? chalk.green("✓")
      : target.status === "beta"
        ? chalk.yellow("β")
        : chalk.gray("○");

    console.log(`  ${status} ${chalk.cyan(target.name)}`);
  }

  console.log();
  console.log(chalk.white("For local diagnostics, use:"));
  console.log(chalk.cyan("  clawster doctor"));
  console.log();
}
