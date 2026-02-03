import chalk from "chalk";
import { DeploymentTargetFactory } from "@clawster/cloud-providers";

interface CLIBootstrapOptions {
  provider?: string;
  region?: string;
  workspace?: string;
  skipWizard?: boolean;
  yes?: boolean;
}

export async function bootstrap(_options: CLIBootstrapOptions) {
  console.log(chalk.blue.bold("🚀 Clawster Bootstrap"));
  console.log();
  console.log(chalk.yellow("⚠  The CLI bootstrap command has been deprecated."));
  console.log();
  console.log(chalk.white("Infrastructure provisioning is now handled through the web UI:"));
  console.log();
  console.log(chalk.cyan("  1. Start Clawster:    pnpm dev"));
  console.log(chalk.cyan("  2. Open browser:      http://localhost:3000"));
  console.log(chalk.cyan("  3. Use Deploy Wizard: Create Bot → Select Platform"));
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
    console.log(chalk.gray(`      ${target.description}`));
  }

  console.log();
  console.log(chalk.white("For local development, use:"));
  console.log(chalk.cyan("  clawster setup"));
  console.log();
}
