/**
 * Prompt injection detection patterns.
 *
 * These patterns detect common techniques used to hijack AI assistants
 * through emails, web pages, documents, and messages.
 */

export interface InjectionPattern {
  id: string;
  name: string;
  pattern: RegExp;
  severity: "low" | "medium" | "high";
  description: string;
}

export const INJECTION_PATTERNS: InjectionPattern[] = [
  // System prompt override attempts
  {
    id: "system-override-ignore",
    name: "Ignore Previous Instructions",
    pattern: /ignore\s+(all\s+)?previous\s+instructions/i,
    severity: "high",
    description: "Attempts to override the system prompt by asking to ignore prior instructions",
  },
  {
    id: "system-override-role",
    name: "Role Injection",
    pattern: /you\s+are\s+now\s+(in|an?)\s+/i,
    severity: "high",
    description: "Attempts to redefine the AI's role or mode",
  },
  {
    id: "system-override-mode",
    name: "Mode Override",
    pattern: /(?:enter|switch\s+to|activate)\s+(?:admin|debug|developer|root|maintenance|override)\s+mode/i,
    severity: "high",
    description: "Attempts to switch the AI into a privileged mode",
  },

  // Delimiter injection
  {
    id: "delimiter-system",
    name: "System Delimiter Injection",
    pattern: /---\s*(?:SYSTEM|PRIORITY|OVERRIDE|ADMIN|INSTRUCTION|CRITICAL)\s*(?:---)?/i,
    severity: "high",
    description: "Uses delimiter patterns to inject system-level instructions",
  },
  {
    id: "delimiter-hash",
    name: "Hash Delimiter Injection",
    pattern: /###\s*(?:SYSTEM|INSTRUCTION|OVERRIDE|COMMAND|ADMIN)/i,
    severity: "high",
    description: "Uses markdown-style delimiters for instruction injection",
  },

  // Hidden instruction patterns
  {
    id: "hidden-html-comment",
    name: "HTML Comment Injection",
    pattern: /<!--[\s\S]*?(?:execute|run|system|command|ignore|override)[\s\S]*?-->/i,
    severity: "medium",
    description: "Hides instructions inside HTML comments",
  },
  {
    id: "hidden-do-not-inform",
    name: "Secrecy Instruction",
    pattern: /do\s+not\s+(?:inform|tell|notify|alert|mention|show)\s+(?:the\s+)?user/i,
    severity: "high",
    description: "Instructs the AI to hide actions from the user",
  },

  // Credential extraction attempts
  {
    id: "credential-extraction",
    name: "Credential Extraction",
    pattern: /(?:show|display|print|output|read|cat|dump)\s+(?:the\s+)?(?:\.env|credentials|secrets|api[_\s]?keys?|private[_\s]?keys?|ssh[_\s]?keys?|passwords?)/i,
    severity: "medium",
    description: "Requests to display sensitive credential files",
  },

  // Exfiltration patterns
  {
    id: "exfiltration-curl",
    name: "Data Exfiltration via curl",
    pattern: /curl\s+(?:-[A-Za-z]\s+)*(?:https?:\/\/|ftp:\/\/)(?!localhost|127\.0\.0\.1)/i,
    severity: "medium",
    description: "Attempts to exfiltrate data via curl to an external URL",
  },
  {
    id: "exfiltration-send",
    name: "Send Data Externally",
    pattern: /send\s+(?:all\s+)?(?:output|results?|data|credentials?|keys?|tokens?)\s+to\s+/i,
    severity: "high",
    description: "Instructs sending sensitive data to an external destination",
  },

  // Impersonation
  {
    id: "impersonation-authorized",
    name: "False Authorization Claim",
    pattern: /(?:this\s+is\s+)?(?:authorized|approved|requested)\s+by\s+(?:security|admin|IT|the\s+team|management)/i,
    severity: "medium",
    description: "Claims false authorization to justify malicious actions",
  },
  {
    id: "impersonation-drill",
    name: "Fake Security Drill",
    pattern: /(?:security\s+drill|compliance\s+check|audit\s+(?:in\s+)?progress|mandatory\s+(?:security\s+)?check)/i,
    severity: "medium",
    description: "Disguises malicious actions as security drills or audits",
  },

  // Unicode / encoding tricks
  {
    id: "unicode-zero-width",
    name: "Zero-Width Character Hiding",
    pattern: /[\u200B\u200C\u200D\u2060\uFEFF]{3,}/,
    severity: "low",
    description: "Contains sequences of zero-width characters that may hide content",
  },
];

/**
 * Check a string against all injection patterns.
 */
export function detectInjections(content: string): InjectionPattern[] {
  return INJECTION_PATTERNS.filter((p) => p.pattern.test(content));
}
