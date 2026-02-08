import {
  buildAzureFilesMountSection,
  buildSysboxDebSection,
  buildCaddySection,
  buildKeyVaultFetchSection,
  buildOpenClawContainerSection,
  buildAzureCaddyCloudInit,
  buildGceCaddyStartupScript,
  buildAwsCaddyUserData,
} from "./startup-script-builder";
import type { AzureFilesConfig, AzureKeyVaultConfig, AzureCloudInitOptions } from "./startup-script-builder";
import { DEFAULT_OPENCLAW_CLOUD_IMAGE } from "../constants/defaults";

describe("Azure Caddy Cloud-Init Builders", () => {
  describe("buildAzureFilesMountSection", () => {
    const defaultConfig: AzureFilesConfig = {
      storageAccountName: "mystorageacct",
      shareName: "clawster-data",
      mountPath: "/mnt/openclaw",
      managedIdentityClientId: "mi-client-id-123",
    };

    it("should include MI token fetch with correct client ID", () => {
      const result = buildAzureFilesMountSection(defaultConfig);
      expect(result).toContain("mi-client-id-123");
      expect(result).toContain("169.254.169.254");
      expect(result).toContain("access_token");
    });

    it("should include ARM listKeys POST with empty body", () => {
      const result = buildAzureFilesMountSection(defaultConfig);
      expect(result).toContain("-X POST -d \"\"");
      expect(result).toContain("listKeys");
      expect(result).toContain("mystorageacct");
    });

    it("should mount Azure Files via CIFS", () => {
      const result = buildAzureFilesMountSection(defaultConfig);
      expect(result).toContain("mount -t cifs");
      expect(result).toContain("mystorageacct.file.core.windows.net/clawster-data");
      expect(result).toContain("/mnt/openclaw");
    });

    it("should create SMB credentials file", () => {
      const result = buildAzureFilesMountSection(defaultConfig);
      expect(result).toContain("/etc/smbcredentials/mystorageacct.cred");
      expect(result).toContain("chmod 600");
    });

    it("should add entry to fstab for persistence", () => {
      const result = buildAzureFilesMountSection(defaultConfig);
      expect(result).toContain("/etc/fstab");
    });

    it("should create .openclaw directory on mount path", () => {
      const result = buildAzureFilesMountSection(defaultConfig);
      expect(result).toContain("mkdir -p /mnt/openclaw/.openclaw");
    });

    it("should retry MI token fetch 5 times", () => {
      const result = buildAzureFilesMountSection(defaultConfig);
      expect(result).toContain("for ATTEMPT in 1 2 3 4 5");
    });
  });

  describe("buildSysboxDebSection", () => {
    it("should use default version 0.6.4", () => {
      const result = buildSysboxDebSection();
      expect(result).toContain("v0.6.4");
      expect(result).toContain("sysbox-ce_0.6.4.linux_");
    });

    it("should accept custom version", () => {
      const result = buildSysboxDebSection("0.7.0");
      expect(result).toContain("v0.7.0");
      expect(result).toContain("sysbox-ce_0.7.0.linux_");
    });

    it("should handle v-prefixed version", () => {
      const result = buildSysboxDebSection("v0.6.4");
      expect(result).toContain("v0.6.4");
      // Should not produce vv0.6.4
      expect(result).not.toContain("vv0.6.4");
    });

    it("should download from nestybox releases", () => {
      const result = buildSysboxDebSection();
      expect(result).toContain("github.com/nestybox/sysbox/releases");
    });

    it("should detect architecture dynamically", () => {
      const result = buildSysboxDebSection();
      expect(result).toContain("dpkg --print-architecture");
    });

    it("should check for existing sysbox before installing", () => {
      const result = buildSysboxDebSection();
      expect(result).toContain("docker info");
      expect(result).toContain("sysbox-runc");
    });

    it("should restart docker after install", () => {
      const result = buildSysboxDebSection();
      expect(result).toContain("systemctl restart docker");
    });
  });

  describe("buildCaddySection", () => {
    it("should use :80 when no domain provided", () => {
      const result = buildCaddySection(18789);
      expect(result).toContain(":80");
      expect(result).toContain("reverse_proxy 127.0.0.1:18789");
    });

    it("should use domain for auto-HTTPS when provided", () => {
      const result = buildCaddySection(18789, "bot.example.com");
      expect(result).toContain("bot.example.com");
      expect(result).toContain("reverse_proxy 127.0.0.1:18789");
      expect(result).not.toContain(":80");
    });

    it("should install caddy via official apt repo", () => {
      const result = buildCaddySection(18789);
      expect(result).toContain("cloudsmith.io/public/caddy/stable");
      expect(result).toContain("apt-get install -y caddy");
    });

    it("should enable and restart caddy", () => {
      const result = buildCaddySection(18789);
      expect(result).toContain("systemctl enable caddy");
      expect(result).toContain("systemctl restart caddy");
    });

    it("should use correct gateway port", () => {
      const result = buildCaddySection(12345);
      expect(result).toContain("reverse_proxy 127.0.0.1:12345");
    });
  });

  describe("buildKeyVaultFetchSection", () => {
    const defaultKv: AzureKeyVaultConfig = {
      vaultName: "my-keyvault",
      secretName: "clawster-test-bot-config",
      managedIdentityClientId: "mi-client-id-123",
    };

    it("should fetch token from IMDS with vault.azure.net resource", () => {
      const result = buildKeyVaultFetchSection(defaultKv, "/mnt/openclaw/.openclaw/openclaw.json");
      expect(result).toContain("resource=https://vault.azure.net");
      expect(result).toContain("mi-client-id-123");
    });

    it("should call Key Vault REST API", () => {
      const result = buildKeyVaultFetchSection(defaultKv, "/mnt/openclaw/.openclaw/openclaw.json");
      expect(result).toContain("my-keyvault.vault.azure.net");
      expect(result).toContain("clawster-test-bot-config");
      expect(result).toContain("api-version=7.4");
    });

    it("should write config to specified path", () => {
      const result = buildKeyVaultFetchSection(defaultKv, "/mnt/openclaw/.openclaw/openclaw.json");
      expect(result).toContain("> /mnt/openclaw/.openclaw/openclaw.json");
    });

    it("should extract gateway token from config", () => {
      const result = buildKeyVaultFetchSection(defaultKv, "/mnt/openclaw/.openclaw/openclaw.json");
      expect(result).toContain("GATEWAY_TOKEN");
      expect(result).toContain(".gateway.auth.token");
    });

    it("should retry 5 times for KV token", () => {
      const result = buildKeyVaultFetchSection(defaultKv, "/mnt/openclaw/.openclaw/openclaw.json");
      expect(result).toContain("for ATTEMPT in 1 2 3 4 5");
    });
  });

  describe("buildOpenClawContainerSection", () => {
    it("should bind to 127.0.0.1 only (not 0.0.0.0)", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw");
      expect(result).toContain("-p 127.0.0.1:18789:18789");
    });

    it("should mount docker socket for sandbox support", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw");
      expect(result).toContain("-v /var/run/docker.sock:/var/run/docker.sock");
    });

    it("should mount config at /root/.openclaw (spike-proven)", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw");
      expect(result).toContain("-v /mnt/openclaw/.openclaw:/root/.openclaw");
    });

    it("should use GHCR image by default", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw");
      expect(result).toContain(DEFAULT_OPENCLAW_CLOUD_IMAGE);
      expect(result).not.toContain("npx");
    });

    it("should accept custom imageUri", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw", undefined, "custom-registry.io/openclaw:v2");
      expect(result).toContain("custom-registry.io/openclaw:v2");
      expect(result).not.toContain(DEFAULT_OPENCLAW_CLOUD_IMAGE);
    });

    it("should use openclaw command directly (pre-installed in image)", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw");
      expect(result).toContain("openclaw gateway --port 18789 --verbose");
      expect(result).not.toContain("npx");
    });

    it("should use --restart=always", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw");
      expect(result).toContain("--restart=always");
    });

    it("should detect sysbox runtime", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw");
      expect(result).toContain("sysbox-runc");
      expect(result).toContain("DOCKER_RUNTIME");
    });

    it("should include additional env vars when provided", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw", {
        OPENAI_API_KEY: "sk-test",
        CUSTOM_VAR: "value",
      });
      expect(result).toContain('OPENAI_API_KEY="sk-test"');
      expect(result).toContain('CUSTOM_VAR="value"');
    });

    it("should use GATEWAY_TOKEN from KV fetch", () => {
      const result = buildOpenClawContainerSection(18789, "/mnt/openclaw");
      expect(result).toContain("GATEWAY_TOKEN");
    });
  });

  describe("buildAzureCaddyCloudInit", () => {
    const defaultOptions: AzureCloudInitOptions = {
      gatewayPort: 18789,
      azureFiles: {
        storageAccountName: "mystorageacct",
        shareName: "clawster-data",
        mountPath: "/mnt/openclaw",
        managedIdentityClientId: "mi-client-id",
      },
      keyVault: {
        vaultName: "my-keyvault",
        secretName: "clawster-test-config",
        managedIdentityClientId: "mi-client-id",
      },
    };

    it("should produce valid cloud-config YAML", () => {
      const result = buildAzureCaddyCloudInit(defaultOptions);
      expect(result).toMatch(/^#cloud-config\n/);
      expect(result).toContain("package_update: true");
      expect(result).toContain("packages:");
      expect(result).toContain("runcmd:");
    });

    it("should include all required packages", () => {
      const result = buildAzureCaddyCloudInit(defaultOptions);
      expect(result).toContain("docker.io");
      expect(result).toContain("jq");
      expect(result).toContain("curl");
      expect(result).toContain("cifs-utils");
    });

    it("should include all sections in correct order", () => {
      const result = buildAzureCaddyCloudInit(defaultOptions);

      const dockerIdx = result.indexOf("systemctl enable docker");
      const azureFilesIdx = result.indexOf("Mount Azure Files");
      const sysboxIdx = result.indexOf("Install Sysbox");
      const caddyIdx = result.indexOf("Install Caddy");
      const kvIdx = result.indexOf("Fetch config from Key Vault");
      const containerIdx = result.indexOf("Start OpenClaw container");

      // All sections should be present
      expect(dockerIdx).toBeGreaterThan(-1);
      expect(azureFilesIdx).toBeGreaterThan(-1);
      expect(sysboxIdx).toBeGreaterThan(-1);
      expect(caddyIdx).toBeGreaterThan(-1);
      expect(kvIdx).toBeGreaterThan(-1);
      expect(containerIdx).toBeGreaterThan(-1);

      // Verify order: Docker → Azure Files → Sysbox → Caddy → KV → Container
      expect(dockerIdx).toBeLessThan(azureFilesIdx);
      expect(azureFilesIdx).toBeLessThan(sysboxIdx);
      expect(sysboxIdx).toBeLessThan(caddyIdx);
      expect(caddyIdx).toBeLessThan(kvIdx);
      expect(kvIdx).toBeLessThan(containerIdx);
    });

    it("should use custom domain when provided", () => {
      const result = buildAzureCaddyCloudInit({
        ...defaultOptions,
        caddyDomain: "bot.example.com",
      });
      expect(result).toContain("bot.example.com");
    });

    it("should pass additional env vars to container", () => {
      const result = buildAzureCaddyCloudInit({
        ...defaultOptions,
        additionalEnv: { OPENAI_API_KEY: "sk-test" },
      });
      expect(result).toContain('OPENAI_API_KEY="sk-test"');
    });

    it("should end with final_message", () => {
      const result = buildAzureCaddyCloudInit(defaultOptions);
      expect(result).toContain("final_message:");
    });

    it("should use GHCR image by default in container section", () => {
      const result = buildAzureCaddyCloudInit(defaultOptions);
      expect(result).toContain(DEFAULT_OPENCLAW_CLOUD_IMAGE);
      expect(result).not.toContain("npx -y openclaw");
    });

    it("should accept custom imageUri", () => {
      const result = buildAzureCaddyCloudInit({
        ...defaultOptions,
        imageUri: "my-registry.io/openclaw:v3",
      });
      expect(result).toContain("my-registry.io/openclaw:v3");
      expect(result).not.toContain(DEFAULT_OPENCLAW_CLOUD_IMAGE);
    });
  });
});

describe("GCE Caddy Startup Script", () => {
  const defaultOptions = {
    gatewayPort: 18789,
    secretName: "clawster-test-secret",
  };

  it("should pull GHCR image instead of building", () => {
    const result = buildGceCaddyStartupScript(defaultOptions);
    expect(result).toContain("docker pull");
    expect(result).toContain(DEFAULT_OPENCLAW_CLOUD_IMAGE);
    expect(result).not.toContain("docker build");
    expect(result).not.toContain("npm install -g openclaw");
  });

  it("should use openclaw command directly (not npx)", () => {
    const result = buildGceCaddyStartupScript(defaultOptions);
    expect(result).toContain("openclaw gateway --port 18789 --verbose");
    expect(result).not.toContain("npx");
  });

  it("should accept custom imageUri", () => {
    const result = buildGceCaddyStartupScript({
      ...defaultOptions,
      imageUri: "custom-registry.io/openclaw:v2",
    });
    expect(result).toContain("custom-registry.io/openclaw:v2");
    expect(result).not.toContain(DEFAULT_OPENCLAW_CLOUD_IMAGE);
  });

  it("should include idempotency guard", () => {
    const result = buildGceCaddyStartupScript(defaultOptions);
    expect(result).toContain("MARKER=");
    expect(result).toContain("Already initialized");
  });

  it("should install sysbox, caddy, and fetch config", () => {
    const result = buildGceCaddyStartupScript(defaultOptions);
    expect(result).toContain("Install Sysbox");
    expect(result).toContain("Install Caddy");
    expect(result).toContain("secretmanager.googleapis.com");
  });

  it("should pass additional env vars", () => {
    const result = buildGceCaddyStartupScript({
      ...defaultOptions,
      additionalEnv: { MY_VAR: "hello" },
    });
    expect(result).toContain('MY_VAR="hello"');
  });
});

describe("AWS Caddy User Data Script", () => {
  const defaultOptions = {
    gatewayPort: 18789,
    secretName: "clawster-test-secret",
    region: "us-east-1",
  };

  it("should pull GHCR image instead of building", () => {
    const result = buildAwsCaddyUserData(defaultOptions);
    expect(result).toContain("docker pull");
    expect(result).toContain(DEFAULT_OPENCLAW_CLOUD_IMAGE);
    expect(result).not.toContain("docker build");
    expect(result).not.toContain("npm install -g openclaw");
  });

  it("should use openclaw command directly (not npx)", () => {
    const result = buildAwsCaddyUserData(defaultOptions);
    expect(result).toContain("openclaw gateway --port 18789 --verbose");
    expect(result).not.toContain("npx");
  });

  it("should accept custom imageUri", () => {
    const result = buildAwsCaddyUserData({
      ...defaultOptions,
      imageUri: "custom-registry.io/openclaw:v2",
    });
    expect(result).toContain("custom-registry.io/openclaw:v2");
    expect(result).not.toContain(DEFAULT_OPENCLAW_CLOUD_IMAGE);
  });

  it("should include SigV4 helper and idempotency guard", () => {
    const result = buildAwsCaddyUserData(defaultOptions);
    expect(result).toContain("fetch_secret_value");
    expect(result).toContain("MARKER=");
  });

  it("should install sysbox, caddy, and fetch config", () => {
    const result = buildAwsCaddyUserData(defaultOptions);
    expect(result).toContain("Install Sysbox");
    expect(result).toContain("Install Caddy");
    expect(result).toContain("secretsmanager");
  });

  it("should pass additional env vars", () => {
    const result = buildAwsCaddyUserData({
      ...defaultOptions,
      additionalEnv: { MY_VAR: "hello" },
    });
    expect(result).toContain('MY_VAR="hello"');
  });
});
