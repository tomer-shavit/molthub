import { Injectable, Logger } from "@nestjs/common";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BotRef {
  id: string;
  name: string;
}

interface TeamMemberRef {
  memberBot: BotRef;
  role: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class DelegationSkillGeneratorService {
  private readonly logger = new Logger(DelegationSkillGeneratorService.name);

  /**
   * Generate the two files that make up a bot's delegation skill:
   *  - SKILL.md  — describes the team and how to delegate
   *  - delegate.js — Node.js script that calls the Clawster delegation API
   */
  generateSkillFiles(
    bot: BotRef,
    teamMembers: TeamMemberRef[],
    apiUrl: string,
    apiKey?: string,
  ): { skillMd: string; delegateJs: string } {
    this.logger.log(
      `Generating delegation skill for bot ${bot.name} (${bot.id}) with ${teamMembers.length} team member(s)`,
    );

    const skillMd = this.buildSkillMd(teamMembers);
    const delegateJs = this.buildDelegateJs(bot, apiUrl, apiKey);

    return { skillMd, delegateJs };
  }

  // ---- SKILL.md -------------------------------------------------------------

  private buildSkillMd(teamMembers: TeamMemberRef[]): string {
    // Build "name (role)" pairs for the description, e.g. "bot-a (Comedian), bot-b (Songwriter)"
    const teamSummary = teamMembers
      .map((m) => `${m.memberBot.name} (${m.role})`)
      .join(", ");

    // Build detailed team member entries for the body
    const teamSection = teamMembers
      .map(
        (m) =>
          `- **${m.memberBot.name}** — ${m.role}: ${m.description}`,
      )
      .join("\n");

    // Build example commands (up to 2)
    const examples = teamMembers
      .slice(0, 2)
      .map(
        (m) =>
          `node /home/node/.openclaw/skills/clawster-delegation/delegate.js "${m.memberBot.name}" "Your task description here"`,
      )
      .join("\n");

    return `---
name: clawster-delegation
description: "Delegate tasks to your team: ${teamSummary}. Read this skill when a user's request matches any team member's specialty."
---

# Team Delegation

You have a team of specialist bots. **Do NOT handle their specialties yourself — delegate to them.**

## Your Team

${teamSection}

## How to Delegate

Run this exact command using exec:

\`\`\`bash
node /home/node/.openclaw/skills/clawster-delegation/delegate.js "<bot-name>" "<task description>"
\`\`\`

For example:
\`\`\`bash
${examples}
\`\`\`

The command prints the team member's response to stdout. Include their response in your reply to the user.

## Rules

1. When a user's request matches a team member's specialty, delegate to them immediately.
2. Use the exact bot name from the list above as the first argument.
3. Write a clear task description as the second argument — include all relevant context from the user's message.
4. After receiving the response, incorporate it naturally into your answer.
5. You may delegate to multiple team members for different parts of a request.
6. Do NOT use \`openclaw\` CLI commands for delegation — they do not support this. Only use the delegate.js script above.
`;
  }

  // ---- delegate.js ----------------------------------------------------------

  /**
   * Escape a string for safe embedding inside a JavaScript double-quoted
   * string literal.  Handles backslashes, double quotes, newlines, and
   * other common special characters.
   */
  private escapeJsString(value: string): string {
    return value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t");
  }

  private buildDelegateJs(bot: BotRef, apiUrl: string, apiKey?: string): string {
    const escapedApiUrl = this.escapeJsString(apiUrl);
    const escapedApiKey = this.escapeJsString(apiKey || "");
    const escapedBotId = this.escapeJsString(bot.id);

    return `#!/usr/bin/env node
"use strict";

// ---------------------------------------------------------------------------
// delegate.js — Clawster delegation skill
//
// Usage:  node delegate.js "<Target Bot Name>" "<Message>"
//
// Environment variables (override baked-in defaults):
//   CLAWSTER_API_URL  — Base URL of the Clawster API (e.g. http://localhost:4000)
//   CLAWSTER_API_KEY  — Bearer token for authentication
//   CLAWSTER_BOT_ID   — The ID of the bot executing this script (source bot)
// ---------------------------------------------------------------------------

const http = require("http");
const https = require("https");

// ---- helpers ---------------------------------------------------------------

function fatal(msg) {
  process.stderr.write("delegation error: " + msg + "\\n");
  process.exit(1);
}

// ---- validate inputs -------------------------------------------------------

const apiUrl = process.env.CLAWSTER_API_URL || "${escapedApiUrl}";
const apiKey = process.env.CLAWSTER_API_KEY || "${escapedApiKey}";
const botId = process.env.CLAWSTER_BOT_ID || "${escapedBotId}";

if (!apiUrl) fatal("CLAWSTER_API_URL is not set and no default was baked in");
if (!apiKey) fatal("CLAWSTER_API_KEY is not set and no default was baked in");
if (!botId) fatal("CLAWSTER_BOT_ID is not set and no default was baked in");

const targetBotName = process.argv[2];
const message = process.argv[3];

if (!targetBotName) fatal("Missing first argument: target bot name");
if (!message) fatal("Missing second argument: message");

// ---- build request ---------------------------------------------------------

const body = JSON.stringify({
  sourceBotId: botId,
  targetBotName: targetBotName,
  message: message,
});

const url = new URL("/bot-teams/delegate", apiUrl);
const transport = url.protocol === "https:" ? https : http;

const options = {
  hostname: url.hostname,
  port: url.port || (url.protocol === "https:" ? 443 : 80),
  path: url.pathname,
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    Authorization: "Bearer " + apiKey,
  },
};

// ---- send request ----------------------------------------------------------

const req = transport.request(options, function (res) {
  var chunks = [];

  res.on("data", function (chunk) {
    chunks.push(chunk);
  });

  res.on("end", function () {
    var responseBody = Buffer.concat(chunks).toString();

    if (res.statusCode >= 200 && res.statusCode < 300) {
      process.stdout.write(responseBody);
    } else {
      process.stderr.write(
        "delegation failed (HTTP " + res.statusCode + "): " + responseBody + "\\n",
      );
      process.exit(1);
    }
  });
});

req.on("error", function (err) {
  fatal("request failed: " + err.message);
});

req.write(body);
req.end();
`;
  }
}
