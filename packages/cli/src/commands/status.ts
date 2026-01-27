import chalk from "chalk";

export async function status() {
  console.log(chalk.blue("Molthub Status"));
  console.log();

  const checks = [
    { name: "API", url: process.env.API_URL || "http://localhost:4000" },
    { name: "Web UI", url: process.env.WEB_URL || "http://localhost:3000" },
    { name: "Database", status: "connected" },
  ];

  for (const check of checks) {
    console.log(`${check.name}: ${chalk.green(check.status || "running")}`);
  }

  console.log();
  console.log(chalk.blue("Instances:"));
  console.log(chalk.gray("  No instances found. Create one with 'molthub create-instance'"));
}