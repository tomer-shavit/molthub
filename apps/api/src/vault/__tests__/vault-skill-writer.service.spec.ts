import * as fs from "fs";
import { VaultSkillWriterService } from "../vault-skill-writer.service";

jest.mock("fs");

describe("VaultSkillWriterService", () => {
  let service: VaultSkillWriterService;
  let mockApiKeyService: { generate: jest.Mock };
  let mockSkillGenerator: { generateSkillFiles: jest.Mock };

  beforeEach(() => {
    jest.resetAllMocks();

    mockApiKeyService = {
      generate: jest.fn().mockResolvedValue({ key: "mh_a2a_generated_key" }),
    };
    mockSkillGenerator = {
      generateSkillFiles: jest.fn().mockReturnValue({
        skillMd: "# SKILL.md content",
        vaultJs: "// vault.js content",
      }),
    };

    service = new VaultSkillWriterService(
      mockApiKeyService as any,
      mockSkillGenerator as any,
    );
  });

  describe("writeVaultSkills", () => {
    it("generates API key with vault label", async () => {
      await service.writeVaultSkills("inst-1", "/var/openclaw/bot", "http://localhost:4000");

      expect(mockApiKeyService.generate).toHaveBeenCalledWith("inst-1", "clawster-vault-auto");
    });

    it("passes generated API key to skill generator", async () => {
      await service.writeVaultSkills("inst-1", "/var/openclaw/bot", "http://api:4000");

      expect(mockSkillGenerator.generateSkillFiles).toHaveBeenCalledWith(
        "inst-1",
        "http://api:4000",
        "mh_a2a_generated_key",
      );
    });

    it("creates skill directory recursively", async () => {
      await service.writeVaultSkills("inst-1", "/var/openclaw/bot", "http://localhost:4000");

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        "/var/openclaw/bot/skills/clawster-vault",
        { recursive: true },
      );
    });

    it("writes SKILL.md to correct path with 644 permissions", async () => {
      await service.writeVaultSkills("inst-1", "/var/openclaw/bot", "http://localhost:4000");

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/var/openclaw/bot/skills/clawster-vault/SKILL.md",
        "# SKILL.md content",
        { encoding: "utf8", mode: 0o644 },
      );
    });

    it("writes vault.js to correct path with 600 permissions", async () => {
      await service.writeVaultSkills("inst-1", "/var/openclaw/bot", "http://localhost:4000");

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        "/var/openclaw/bot/skills/clawster-vault/vault.js",
        "// vault.js content",
        { encoding: "utf8", mode: 0o600 },
      );
    });

    it("returns written: true on success", async () => {
      const result = await service.writeVaultSkills("inst-1", "/var/openclaw/bot", "http://localhost:4000");

      expect(result).toEqual({ written: true });
    });
  });
});
