import chalk from "chalk";

export async function doctor() {
  console.log(chalk.blue("Molthub Doctor"));
  console.log(chalk.gray("Diagnosing common issues..."));
  console.log();

  const checks = [
    {
      name: "AWS credentials",
      check: () => process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
      fix: "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables",
    },
    {
      name: "Database connection",
      check: () => process.env.DATABASE_URL,
      fix: "Set DATABASE_URL environment variable",
    },
    {
      name: "ECS cluster configured",
      check: () => process.env.ECS_CLUSTER_ARN,
      fix: "Set ECS_CLUSTER_ARN environment variable or run 'molthub bootstrap'",
    },
    {
      name: "Private subnets configured",
      check: () => process.env.PRIVATE_SUBNET_IDS,
      fix: "Set PRIVATE_SUBNET_IDS environment variable (comma-separated)",
    },
  ];

  let issues = 0;

  for (const check of checks) {
    const passed = check.check();
    if (passed) {
      console.log(chalk.green(`✓ ${check.name}`));
    } else {
      console.log(chalk.red(`✗ ${check.name}`));
      console.log(chalk.gray(`  Fix: ${check.fix}`));
      issues++;
    }
  }

  console.log();
  if (issues === 0) {
    console.log(chalk.green("All checks passed!"));
  } else {
    console.log(chalk.yellow(`${issues} issue(s) found. See above for fixes.`));
  }
}