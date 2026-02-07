import { VaultSkillGeneratorService } from "../vault-skill-generator.service";

describe("VaultSkillGeneratorService", () => {
  let service: VaultSkillGeneratorService;

  beforeEach(() => {
    service = new VaultSkillGeneratorService();
  });

  describe("generateSkillFiles", () => {
    it("returns skillMd and vaultJs", () => {
      const result = service.generateSkillFiles("inst-1", "http://localhost:4000", "mh_a2a_abc123");

      expect(result).toHaveProperty("skillMd");
      expect(result).toHaveProperty("vaultJs");
    });

    it("generates SKILL.md with correct YAML frontmatter", () => {
      const { skillMd } = service.generateSkillFiles("inst-1", "http://localhost:4000", "key-1");

      expect(skillMd).toContain("---");
      expect(skillMd).toContain("name: clawster-vault");
      expect(skillMd).toContain("description:");
    });

    it("generates SKILL.md with secret detection patterns", () => {
      const { skillMd } = service.generateSkillFiles("inst-1", "http://localhost:4000", "key-1");

      expect(skillMd).toContain("sk-*");
      expect(skillMd).toContain("AKIA*");
      expect(skillMd).toContain("ghp_*");
      expect(skillMd).toContain("xoxb-*");
    });

    it("generates SKILL.md with vault.js usage instructions", () => {
      const { skillMd } = service.generateSkillFiles("inst-1", "http://localhost:4000", "key-1");

      expect(skillMd).toContain("vault.js store");
      expect(skillMd).toContain("vault.js get");
      expect(skillMd).toContain("vault.js delete");
      expect(skillMd).toContain("SCREAMING_SNAKE_CASE");
    });

    it("generates vault.js with baked-in API URL", () => {
      const { vaultJs } = service.generateSkillFiles("inst-1", "http://api.example.com:4000", "key-1");

      expect(vaultJs).toContain("http://api.example.com:4000");
    });

    it("generates vault.js with baked-in API key", () => {
      const { vaultJs } = service.generateSkillFiles("inst-1", "http://localhost:4000", "mh_a2a_secret123");

      expect(vaultJs).toContain("mh_a2a_secret123");
    });

    it("generates vault.js with baked-in instance ID", () => {
      const { vaultJs } = service.generateSkillFiles("my-instance-id", "http://localhost:4000", "key-1");

      expect(vaultJs).toContain("my-instance-id");
    });

    it("generates vault.js with store/get/delete commands", () => {
      const { vaultJs } = service.generateSkillFiles("inst-1", "http://localhost:4000", "key-1");

      expect(vaultJs).toContain('case "store"');
      expect(vaultJs).toContain('case "get"');
      expect(vaultJs).toContain('case "delete"');
    });

    it("generates vault.js with proper Authorization header", () => {
      const { vaultJs } = service.generateSkillFiles("inst-1", "http://localhost:4000", "key-1");

      expect(vaultJs).toContain('"Authorization": "Bearer " + apiKey');
    });

    it("escapes special characters in baked-in values", () => {
      const { vaultJs } = service.generateSkillFiles(
        'inst-with"quotes',
        "http://localhost:4000",
        'key-with"quotes',
      );

      expect(vaultJs).toContain('inst-with\\"quotes');
      expect(vaultJs).toContain('key-with\\"quotes');
    });

    it("generates vault.js with environment variable overrides", () => {
      const { vaultJs } = service.generateSkillFiles("inst-1", "http://localhost:4000", "key-1");

      expect(vaultJs).toContain("CLAWSTER_API_URL");
      expect(vaultJs).toContain("CLAWSTER_API_KEY");
      expect(vaultJs).toContain("CLAWSTER_INSTANCE_ID");
    });
  });
});
