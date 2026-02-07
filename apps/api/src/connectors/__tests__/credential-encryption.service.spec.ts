/**
 * Unit Tests - CredentialEncryptionService
 */
import { CredentialEncryptionService } from "../credential-encryption.service";

describe("CredentialEncryptionService", () => {
  const TEST_KEY = "a".repeat(64);
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.CREDENTIAL_ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    }
  });

  it("encrypt and decrypt round-trip with encryption key", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
    const service = new CredentialEncryptionService();

    const original = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI", region: "us-east-1" };
    const encrypted = service.encrypt(original);
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toEqual(original);
  });

  it("encrypt and decrypt round-trip without encryption key", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const service = new CredentialEncryptionService();

    const original = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secretAccessKey: "wJalrXUtnFEMI", region: "us-east-1" };
    const encrypted = service.encrypt(original);
    const decrypted = service.decrypt(encrypted);

    expect(decrypted).toEqual(original);
  });

  it("encrypted output differs from plain base64", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
    const service = new CredentialEncryptionService();

    const original = { secret: "my-secret-value" };
    const encrypted = service.encrypt(original);
    const plainBase64 = Buffer.from(JSON.stringify(original)).toString("base64");

    expect(encrypted).not.toEqual(plainBase64);
  });

  it("masks aws-account credentials correctly", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const service = new CredentialEncryptionService();

    const config = {
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
    };

    const masked = service.mask("aws-account", config);

    expect(masked.region).toBe("us-east-1");
    expect(masked.secretAccessKey).toBe("••••••••");
    expect(typeof masked.accessKeyId).toBe("string");
    expect((masked.accessKeyId as string)).toContain("••••");
    expect((masked.accessKeyId as string)).not.toBe(config.accessKeyId);
  });

  it("masks api-key credentials correctly", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const service = new CredentialEncryptionService();

    const config = {
      provider: "anthropic",
      apiKey: "sk-ant-api03-longkeyvalue1234567890",
    };

    const masked = service.mask("api-key", config);

    expect(masked.provider).toBe("anthropic");
    expect(typeof masked.apiKey).toBe("string");
    expect((masked.apiKey as string)).toContain("••••");
    expect((masked.apiKey as string)).not.toBe(config.apiKey);
  });

  it("masks azure-account credentials correctly", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const service = new CredentialEncryptionService();

    const config = {
      subscriptionId: "12345678-1234-1234-1234-123456789abc",
      resourceGroup: "my-rg",
      region: "eastus",
      tenantId: "abcdef00-1234-5678-abcd-ef0123456789",
      clientId: "client-id-long-value-here",
      clientSecret: "super-secret-value",
    };

    const masked = service.mask("azure-account", config);

    expect(masked.resourceGroup).toBe("my-rg");
    expect(masked.region).toBe("eastus");
    expect(masked.clientSecret).toBe("••••••••");
    expect(typeof masked.subscriptionId).toBe("string");
    expect((masked.subscriptionId as string)).toContain("••••");
    expect((masked.subscriptionId as string)).not.toBe(config.subscriptionId);
    expect(typeof masked.tenantId).toBe("string");
    expect((masked.tenantId as string)).toContain("••••");
    expect(typeof masked.clientId).toBe("string");
    expect((masked.clientId as string)).toContain("••••");
  });

  it("masks gce-account credentials correctly", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const service = new CredentialEncryptionService();

    const config = {
      projectId: "my-gce-project",
      zone: "us-central1-a",
      keyFilePath: "/path/to/service-account-key.json",
    };

    const masked = service.mask("gce-account", config);

    expect(masked.projectId).toBe("my-gce-project");
    expect(masked.zone).toBe("us-central1-a");
    expect(typeof masked.keyFilePath).toBe("string");
    expect((masked.keyFilePath as string)).toContain("••••");
    expect((masked.keyFilePath as string)).not.toBe(config.keyFilePath);
  });

  it("maskString returns dots for short strings", () => {
    delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    const service = new CredentialEncryptionService();

    // Use mask with a default-type to exercise maskString with showFirst=2, showLast=2
    // A string of length <= 4 (showFirst + showLast) should become "••••"
    const config = { key: "ab" };
    const masked = service.mask("unknown-type", config);

    expect(masked.key).toBe("••••");
  });
});
