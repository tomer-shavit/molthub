import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import fs from "fs-extra";
import path from "path";
import os from "os";

const CLAWSTER_DIR = path.join(os.homedir(), ".clawster");
const USERS_FILE = path.join(CLAWSTER_DIR, "users.json");

interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: "admin" | "operator" | "viewer";
  createdAt: string;
  lastLoginAt?: string;
}

interface UsersDb {
  users: User[];
}

export async function createUser(options: {
  username?: string;
  password?: string;
  role?: string;
  workspace?: string;
}) {
  console.log(chalk.blue.bold("👤 Create Clawster User\n"));

  // Get user input
  let { username, password, role } = options;

  if (!username) {
    const result = await inquirer.prompt([{
      type: "input",
      name: "username",
      message: "Username:",
      validate: (input: string) => {
        if (!input) return "Username is required";
        if (!/^[a-z0-9_-]+$/.test(input)) {
          return "Username must be lowercase alphanumeric with hyphens/underscores";
        }
        return true;
      },
    }]);
    username = result.username;
  }

  if (!password) {
    const result = await inquirer.prompt([{
      type: "password",
      name: "password",
      message: "Password:",
      mask: "*",
      validate: (input: string) => {
        if (input.length < 8) return "Password must be at least 8 characters";
        return true;
      },
    }]);
    password = result.password;
  }

  if (!role) {
    const result = await inquirer.prompt([{
      type: "list",
      name: "role",
      message: "Role:",
      choices: [
        { name: "Admin - Full access to all resources", value: "admin" },
        { name: "Operator - Can manage bots, read-only on infrastructure", value: "operator" },
        { name: "Viewer - Read-only access", value: "viewer" },
      ],
      default: "operator",
    }]);
    role = result.role;
  }

  const spinner = ora("Creating user...").start();

  try {
    // Ensure directory exists
    await fs.ensureDir(CLAWSTER_DIR);

    // Load existing users
    let db: UsersDb = { users: [] };
    if (await fs.pathExists(USERS_FILE)) {
      db = await fs.readJson(USERS_FILE);
    }

    // Check for duplicate username
    if (db.users.some(u => u.username === username)) {
      spinner.fail(`User '${username}' already exists`);
      process.exit(1);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password!, 10);

    // Create user
    const user: User = {
      id: generateId(),
      username: username!,
      passwordHash,
      role: role as "admin" | "operator" | "viewer",
      createdAt: new Date().toISOString(),
    };

    db.users.push(user);
    await fs.writeJson(USERS_FILE, db, { spaces: 2 });

    spinner.succeed(`User '${username}' created successfully`);
    console.log();
    console.log(chalk.gray("User ID: ") + user.id);
    console.log(chalk.gray("Role: ") + user.role);
    console.log();
    console.log(chalk.yellow("Note: For production, store users in the database instead of local file."));

  } catch (error) {
    spinner.fail("Failed to create user");
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

export async function login(options: {
  username?: string;
  password?: string;
}) {
  console.log(chalk.blue.bold("🔐 Clawster Login\n"));

  let { username, password } = options;

  if (!username) {
    const result = await inquirer.prompt([{
      type: "input",
      name: "username",
      message: "Username:",
    }]);
    username = result.username;
  }

  if (!password) {
    const result = await inquirer.prompt([{
      type: "password",
      name: "password",
      message: "Password:",
      mask: "*",
    }]);
    password = result.password;
  }

  const spinner = ora("Authenticating...").start();

  try {
    // Load users
    if (!(await fs.pathExists(USERS_FILE))) {
      spinner.fail("No users found. Run 'clawster auth:create-user' first.");
      process.exit(1);
    }

    const db: UsersDb = await fs.readJson(USERS_FILE);
    const user = db.users.find(u => u.username === username);

    if (!user) {
      spinner.fail("Invalid username or password");
      process.exit(1);
    }

    // Verify password
    const valid = await bcrypt.compare(password!, user.passwordHash);
    if (!valid) {
      spinner.fail("Invalid username or password");
      process.exit(1);
    }

    // Generate JWT
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      spinner.fail("JWT_SECRET environment variable is required. Set it before logging in.");
      process.exit(1);
    }
    const token = jwt.sign(
      {
        sub: user.id,
        username: user.username,
        role: user.role
      },
      jwtSecret,
      { expiresIn: "24h" }
    );

    // Update last login
    user.lastLoginAt = new Date().toISOString();
    await fs.writeJson(USERS_FILE, db, { spaces: 2 });

    spinner.succeed("Login successful");
    console.log();
    console.log(chalk.green("JWT Token:"));
    console.log(chalk.gray(token));
    console.log();
    console.log(chalk.gray("Use this token in the Authorization header:"));
    console.log(chalk.cyan(`Authorization: Bearer ${token}`));

    // Save token to file for CLI use
    const tokenFile = path.join(CLAWSTER_DIR, "token");
    await fs.writeFile(tokenFile, token, "utf-8");
    console.log();
    console.log(chalk.gray(`Token saved to: ${tokenFile}`));

  } catch (error) {
    spinner.fail("Login failed");
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

export async function listUsers() {
  console.log(chalk.blue.bold("👥 Clawster Users\n"));

  try {
    if (!(await fs.pathExists(USERS_FILE))) {
      console.log(chalk.yellow("No users found. Run 'clawster auth:create-user' to create one."));
      return;
    }

    const db: UsersDb = await fs.readJson(USERS_FILE);

    if (db.users.length === 0) {
      console.log(chalk.yellow("No users found."));
      return;
    }

    console.log(chalk.white("Users:"));
    console.log();

    for (const user of db.users) {
      console.log(chalk.cyan(`  ${user.username}`));
      console.log(chalk.gray(`    ID: ${user.id}`));
      console.log(chalk.gray(`    Role: ${user.role}`));
      console.log(chalk.gray(`    Created: ${new Date(user.createdAt).toLocaleDateString()}`));
      if (user.lastLoginAt) {
        console.log(chalk.gray(`    Last Login: ${new Date(user.lastLoginAt).toLocaleDateString()}`));
      }
      console.log();
    }

  } catch (error) {
    console.error(chalk.red("Failed to list users:"), (error as Error).message);
    process.exit(1);
  }
}

export async function deleteUser(options: { username?: string }) {
  let { username } = options;

  if (!username) {
    // Load users for selection
    if (!(await fs.pathExists(USERS_FILE))) {
      console.log(chalk.yellow("No users found."));
      return;
    }

    const db: UsersDb = await fs.readJson(USERS_FILE);

    if (db.users.length === 0) {
      console.log(chalk.yellow("No users to delete."));
      return;
    }

    const result = await inquirer.prompt([{
      type: "list",
      name: "username",
      message: "Select user to delete:",
      choices: db.users.map(u => ({ name: `${u.username} (${u.role})`, value: u.username })),
    }]);
    username = result.username;
  }

  const { confirm } = await inquirer.prompt([{
    type: "confirm",
    name: "confirm",
    message: chalk.red(`Are you sure you want to delete user '${username}'?`),
    default: false,
  }]);

  if (!confirm) {
    console.log(chalk.yellow("Cancelled."));
    return;
  }

  const spinner = ora("Deleting user...").start();

  try {
    const db: UsersDb = await fs.readJson(USERS_FILE);
    const initialLength = db.users.length;
    db.users = db.users.filter(u => u.username !== username);

    if (db.users.length === initialLength) {
      spinner.fail(`User '${username}' not found`);
      process.exit(1);
    }

    await fs.writeJson(USERS_FILE, db, { spaces: 2 });
    spinner.succeed(`User '${username}' deleted`);

  } catch (error) {
    spinner.fail("Failed to delete user");
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }
}

function generateId(): string {
  return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
