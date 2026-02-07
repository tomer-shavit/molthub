import { Injectable, Logger } from "@nestjs/common";

/**
 * VaultSkillGeneratorService — generates SKILL.md + vault.js files
 * that teach an OpenClaw bot to detect and store secrets in the vault.
 *
 * Single Responsibility: Generate skill file content.
 */
@Injectable()
export class VaultSkillGeneratorService {
  private readonly logger = new Logger(VaultSkillGeneratorService.name);

  /**
   * Generate the two files that make up the vault skill:
   *  - SKILL.md  — instructs the LLM to detect and vault secrets
   *  - vault.js  — Node.js script that calls the Clawster vault API
   */
  generateSkillFiles(
    instanceId: string,
    apiUrl: string,
    apiKey: string,
  ): { skillMd: string; vaultJs: string } {
    this.logger.log(`Generating vault skill for instance ${instanceId}`);

    const skillMd = this.buildSkillMd();
    const vaultJs = this.buildVaultJs(instanceId, apiUrl, apiKey);

    return { skillMd, vaultJs };
  }

  private buildSkillMd(): string {
    return `---
name: clawster-vault
description: "Detect sensitive data (API keys, tokens, passwords) and store them securely in the vault instead of hardcoding. Read this skill whenever you receive credentials or secrets."
---

# Secret Vault Management

You have access to a secure vault for storing sensitive data. **NEVER hardcode secrets in files.**

## When to Use the Vault

Store ANY of the following in the vault immediately when you receive them:

- **API keys**: Strings matching patterns like \`sk-*\`, \`AKIA*\`, \`ghp_*\`, \`xoxb-*\`, \`rk-*\`, \`pk_*\`
- **Tokens**: Bearer tokens, OAuth tokens, refresh tokens, JWT tokens
- **Passwords**: Database passwords, service passwords, any credential
- **Private keys**: SSH keys, PEM files, any cryptographic key material
- **Connection strings**: Database URLs, Redis URLs, any URL containing credentials
- **Webhook secrets**: Signing secrets, webhook URLs with tokens

## How to Store a Secret

Run this exact command using exec:

\`\`\`bash
node /home/node/.openclaw/skills/clawster-vault/vault.js store "KEY_NAME" "secret_value"
\`\`\`

Use SCREAMING_SNAKE_CASE for key names. Examples:
\`\`\`bash
node /home/node/.openclaw/skills/clawster-vault/vault.js store "OPENAI_API_KEY" "sk-proj-abc123..."
node /home/node/.openclaw/skills/clawster-vault/vault.js store "DATABASE_PASSWORD" "my-db-pass"
node /home/node/.openclaw/skills/clawster-vault/vault.js store "GITHUB_TOKEN" "ghp_xxxxxxxxxxxx"
\`\`\`

## How to Retrieve a Secret

\`\`\`bash
node /home/node/.openclaw/skills/clawster-vault/vault.js get "KEY_NAME"
\`\`\`

## How to Delete a Secret

\`\`\`bash
node /home/node/.openclaw/skills/clawster-vault/vault.js delete "KEY_NAME"
\`\`\`

## Rules

1. **ALWAYS store secrets immediately** when you detect them in a user's message. Do NOT write them to any file first.
2. **NEVER hardcode secrets** in configuration files, environment files, scripts, or source code on the machine.
3. When you need to use a stored secret (e.g., in a config file), retrieve it from the vault and use the value in memory only.
4. Use descriptive SCREAMING_SNAKE_CASE key names (e.g., \`STRIPE_SECRET_KEY\`, not \`key1\`).
5. After storing a secret, confirm to the user what was stored (by key name, NOT the actual value).
6. If a user asks you to put a secret in a file, store it in the vault instead and explain why.
`;
  }

  private escapeJsString(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }

  private buildVaultJs(instanceId: string, apiUrl: string, apiKey: string): string {
    const escapedApiUrl = this.escapeJsString(apiUrl);
    const escapedApiKey = this.escapeJsString(apiKey);
    const escapedInstanceId = this.escapeJsString(instanceId);

    return `#!/usr/bin/env node
"use strict";

// ---------------------------------------------------------------------------
// vault.js — Clawster vault skill
//
// Usage:
//   node vault.js store <KEY_NAME> <value>
//   node vault.js get   <KEY_NAME>
//   node vault.js delete <KEY_NAME>
//
// Environment variables (override baked-in defaults):
//   CLAWSTER_API_URL      — Base URL of the Clawster API
//   CLAWSTER_API_KEY      — Bearer token for authentication
//   CLAWSTER_INSTANCE_ID  — The bot instance ID
// ---------------------------------------------------------------------------

var http = require("http");
var https = require("https");

function fatal(msg) {
  process.stderr.write("vault error: " + msg + "\\n");
  process.exit(1);
}

var apiUrl = process.env.CLAWSTER_API_URL || "${escapedApiUrl}";
var apiKey = process.env.CLAWSTER_API_KEY || "${escapedApiKey}";
var instanceId = process.env.CLAWSTER_INSTANCE_ID || "${escapedInstanceId}";

if (!apiUrl) fatal("CLAWSTER_API_URL is not set");
if (!apiKey) fatal("CLAWSTER_API_KEY is not set");
if (!instanceId) fatal("CLAWSTER_INSTANCE_ID is not set");

var command = process.argv[2];
var keyName = process.argv[3];
var secretValue = process.argv[4];

if (!command) fatal("Missing command. Usage: vault.js <store|get|delete> <key> [value]");
if (!keyName) fatal("Missing key name");

function makeRequest(method, urlPath, body, callback) {
  var url = new URL(urlPath, apiUrl);
  var transport = url.protocol === "https:" ? https : http;
  var bodyStr = body ? JSON.stringify(body) : null;

  var options = {
    hostname: url.hostname,
    port: url.port || (url.protocol === "https:" ? 443 : 80),
    path: url.pathname,
    method: method,
    headers: {
      "Authorization": "Bearer " + apiKey,
    },
  };

  if (bodyStr) {
    options.headers["Content-Type"] = "application/json";
    options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
  }

  var req = transport.request(options, function (res) {
    var chunks = [];
    res.on("data", function (chunk) { chunks.push(chunk); });
    res.on("end", function () {
      var responseBody = Buffer.concat(chunks).toString();
      if (res.statusCode >= 200 && res.statusCode < 300) {
        callback(null, responseBody);
      } else {
        callback("HTTP " + res.statusCode + ": " + responseBody);
      }
    });
  });

  req.on("error", function (err) { callback(err.message); });
  if (bodyStr) req.write(bodyStr);
  req.end();
}

var basePath = "/vault/" + encodeURIComponent(instanceId) + "/secrets";

switch (command) {
  case "store":
    if (!secretValue) fatal("Missing value. Usage: vault.js store <key> <value>");
    makeRequest("POST", basePath, { key: keyName, value: secretValue }, function (err, res) {
      if (err) fatal("store failed: " + err);
      process.stdout.write("Stored secret: " + keyName + "\\n");
    });
    break;

  case "get":
    makeRequest("GET", basePath + "/" + encodeURIComponent(keyName), null, function (err, res) {
      if (err) fatal("get failed: " + err);
      try {
        var parsed = JSON.parse(res);
        process.stdout.write(parsed.value);
      } catch (e) {
        process.stdout.write(res);
      }
    });
    break;

  case "delete":
    makeRequest("DELETE", basePath + "/" + encodeURIComponent(keyName), null, function (err, res) {
      if (err) fatal("delete failed: " + err);
      process.stdout.write("Deleted secret: " + keyName + "\\n");
    });
    break;

  default:
    fatal("Unknown command: " + command + ". Use store, get, or delete.");
}
`;
  }
}
