import { Injectable, BadRequestException } from "@nestjs/common";
import {
  OpenClawConfigSchema,
  OpenClawManifestSchema,
  type OpenClawFullConfig,
  type OpenClawManifest,
} from "@clawster/core";
import type { BuiltinTemplate, RequiredInput } from "./builtin-templates";

// =============================================================================
// Public result type
// =============================================================================

export interface GeneratedConfigResult {
  /** Fully validated openclaw.json config. */
  config: OpenClawFullConfig;
  /** v2 manifest wrapping the config. */
  manifest: OpenClawManifest;
  /** Map of env-var name -> description (secrets the user must provision). */
  secretRefs: Record<string, string>;
}

// =============================================================================
// Deep merge helper
// =============================================================================

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * Deep-merge `source` into `target`, returning a new object.
 * Arrays are replaced, not concatenated.
 */
function deepMerge<T extends Record<string, unknown>>(
  target: T,
  source: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const srcVal = source[key];
    const tgtVal = result[key];

    if (isPlainObject(srcVal) && isPlainObject(tgtVal)) {
      result[key] = deepMerge(
        tgtVal as Record<string, unknown>,
        srcVal as Record<string, unknown>,
      );
    } else {
      result[key] = srcVal;
    }
  }

  return result as T;
}

// =============================================================================
// Config Generator Service
// =============================================================================

@Injectable()
export class ConfigGenerator {
  /**
   * Generate a complete openclaw config from a template and user-supplied inputs.
   *
   * 1. Start with the template's `defaultConfig`.
   * 2. Deep-merge `userInputs.configOverrides` on top.
   * 3. Inject secret env-var references for every required secret input.
   * 4. Validate the final config against OpenClawConfigSchema.
   * 5. Wrap into an OpenClawManifest.
   * 6. Collect secretRefs so the caller knows which env vars to provision.
   */
  generateConfig(
    template: BuiltinTemplate,
    userInputs: ConfigGeneratorInput,
  ): GeneratedConfigResult {
    // --- 1. Validate required inputs ---
    this.validateRequiredInputs(template, userInputs);

    // --- 2. Build raw config via deep merge ---
    const baseConfig = structuredClone(
      template.defaultConfig,
    ) as Record<string, unknown>;

    const overrides = (userInputs.configOverrides ?? {}) as Record<
      string,
      unknown
    >;

    const merged = deepMerge(baseConfig, overrides);

    // --- 3. Inject secret env-var references ---
    const secretRefs = this.injectSecretRefs(template, merged);

    // --- 4. Ensure channels block exists (schema requires it) ---
    if (!merged.channels) {
      merged.channels = {};
    }

    // --- 5. Validate against Zod schema ---
    const parseResult = OpenClawConfigSchema.safeParse(merged);
    if (!parseResult.success) {
      const issues = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new BadRequestException(
        `Generated config failed validation: ${issues}`,
      );
    }

    const config = parseResult.data;

    // --- 6. Build manifest ---
    const instanceName =
      userInputs.instanceName ??
      template.id.replace(/^builtin-/, "").replace(/\s+/g, "-");

    const manifestRaw = {
      apiVersion: "clawster/v2" as const,
      kind: "OpenClawInstance" as const,
      metadata: {
        name: instanceName,
        workspace: userInputs.workspace ?? "default",
        environment: userInputs.environment ?? "dev",
        labels: userInputs.labels ?? {},
        deploymentTarget: userInputs.deploymentTarget ?? "local",
      },
      spec: {
        openclawConfig: config,
        clawsterSettings: {
          templateId: template.id,
          autoRestart: true,
          healthCheckIntervalSec: 30,
        },
      },
    };

    const manifestResult = OpenClawManifestSchema.safeParse(manifestRaw);
    if (!manifestResult.success) {
      const issues = manifestResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new BadRequestException(
        `Generated manifest failed validation: ${issues}`,
      );
    }

    return {
      config,
      manifest: manifestResult.data,
      secretRefs,
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Ensure every required (non-optional) input that is a secret has either
   * been supplied or already has a `${ENV_VAR}` reference in the default config.
   * Non-secret required inputs must be provided in `userInputs.values`.
   */
  private validateRequiredInputs(
    template: BuiltinTemplate,
    userInputs: ConfigGeneratorInput,
  ): void {
    const values = userInputs.values ?? {};

    for (const input of template.requiredInputs) {
      if (input.secret) {
        // Secret inputs: we do not require the actual value - we inject ${ENV_VAR}.
        // But the user must acknowledge by providing `true` or the env var name.
        // We accept the input being absent because the template already has the ref.
        continue;
      }

      if (values[input.key] === undefined || values[input.key] === "") {
        throw new BadRequestException(
          `Required input "${input.label}" (${input.key}) must be provided.`,
        );
      }
    }
  }

  /**
   * For every secret-type required input on the template, ensure the
   * config path contains a `${ENV_VAR}` reference (never a plaintext value).
   * Returns a map of env-var name -> human-readable description.
   */
  private injectSecretRefs(
    template: BuiltinTemplate,
    merged: Record<string, unknown>,
  ): Record<string, string> {
    const refs: Record<string, string> = {};

    for (const input of template.requiredInputs) {
      if (!input.secret) continue;

      const envRef = `\${${input.envVar}}`;
      this.setNestedValue(merged, input.configPath, envRef);
      refs[input.envVar] = input.label;
    }

    return refs;
  }

  /**
   * Set a value at a dot-separated path inside a nested object,
   * creating intermediate objects as needed.
   */
  private setNestedValue(
    obj: Record<string, unknown>,
    path: string,
    value: unknown,
  ): void {
    const parts = path.split(".");
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!isPlainObject(current[key])) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
  }
}

// =============================================================================
// Input types
// =============================================================================

export interface ConfigGeneratorInput {
  /** Key-value pairs matching RequiredInput.key -> user-provided value. */
  values?: Record<string, string>;
  /** Arbitrary config overrides deep-merged onto the template defaults. */
  configOverrides?: Partial<OpenClawFullConfig>;
  /** Instance name for the manifest (lowercase alphanumeric + hyphens). */
  instanceName?: string;
  /** Workspace slug for the manifest. */
  workspace?: string;
  /** Target environment. */
  environment?: "dev" | "staging" | "prod" | "local";
  /** Deployment target. */
  deploymentTarget?: "local" | "docker" | "ecs-ec2" | "gce" | "azure-vm";
  /** Extra labels for the manifest metadata. */
  labels?: Record<string, string>;
}
