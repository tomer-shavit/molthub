import chalk from "chalk";
import ora from "ora";
import fs from "fs-extra";
import path from "path";
import os from "os";
import { CloudProviderFactory } from "@molthub/cloud-providers";

const MOLTHUB_DIR = path.join(os.homedir(), ".molthub");

interface StatusOptions {
  workspace?: string;
}

export async function status(options: StatusOptions) {
  console.log(chalk.blue.bold("📊 Molthub Status\n"));

  // Find workspace config
  let workspace = options.workspace;
  
  if (!workspace) {
    // Try to find a workspace config
    const files = await fs.readdir(MOLTHUB_DIR).catch(() => []);
    const configs = files.filter(f => f.endsWith(".json") && f !== "users.json");
    
    if (configs.length === 0) {
      console.log(chalk.yellow("No workspace configured. Run 'molthub init' first."));
      return;
    }
    
    if (configs.length === 1) {
      workspace = configs[0].replace(".json", "");
    } else {
      const { selectedWorkspace } = await import("inquirer").then(m => 
        m.default.prompt([{
          type: "list",
          name: "selectedWorkspace",
          message: "Select workspace:",
          choices: configs.map(f => f.replace(".json", "")),
        }])
      );
      workspace = selectedWorkspace;
    }
  }

  const configPath = path.join(MOLTHUB_DIR, `${workspace}.json`);
  
  if (!(await fs.pathExists(configPath))) {
    console.log(chalk.red(`Workspace '${workspace}' not found. Run 'molthub init' first.`));
    return;
  }

  const config = await fs.readJson(configPath);
  
  console.log(chalk.white(`Workspace: ${chalk.cyan(workspace)}`));
  console.log(chalk.white(`Provider: ${chalk.cyan(config.provider)}`));
  console.log(chalk.white(`Region: ${chalk.cyan(config.region)}`));
  console.log();

  // Check provider status
  const spinner = ora("Checking provider status...").start();
  
  try {
    const provider = CloudProviderFactory.createProvider(config.provider);
    await provider.initialize({
      provider: config.provider,
      region: config.region,
      workspace,
      ...config.resources.metadata,
    });

    const validation = await provider.validate();
    
    if (validation.valid) {
      spinner.succeed("Provider connection healthy");
    } else {
      spinner.warn("Provider connection issues detected");
    }

    if (validation.warnings.length > 0) {
      for (const warning of validation.warnings) {
        console.log(chalk.yellow(`  ⚠ ${warning}`));
      }
    }

  } catch (error) {
    spinner.fail(`Provider check failed: ${(error as Error).message}`);
  }

  console.log();

  // List containers
  console.log(chalk.white("Instances:"));
  try {
    const provider = CloudProviderFactory.createProvider(config.provider);
    await provider.initialize({
      provider: config.provider,
      region: config.region,
      workspace,
      ...config.resources.metadata,
    });

    const containers = await provider.listContainers();
    
    if (containers.length === 0) {
      console.log(chalk.gray("  No instances found"));
    } else {
      for (const container of containers) {
        const statusColor = container.status === "RUNNING" ? chalk.green :
                           container.status === "ERROR" ? chalk.red :
                           container.status === "STOPPED" ? chalk.gray :
                           chalk.yellow;
        
        const healthColor = container.health === "HEALTHY" ? chalk.green :
                           container.health === "UNHEALTHY" ? chalk.red :
                           chalk.gray;
        
        console.log(`  ${chalk.cyan(container.name)} ${statusColor(container.status)} ${healthColor(container.health)}`);
      }
    }
  } catch (error) {
    console.log(chalk.red(`  Failed to list instances: ${(error as Error).message}`));
  }

  console.log();
  console.log(chalk.gray("Use 'molthub doctor' for detailed diagnostics"));
}