import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hasPrivateKey,
  getPrivateKey,
  validateEnv,
  getAppId,
  validatePrivateKeyFormat,
  getAppConfig,
  normalizeEnvString,
} from "./env-validation.js";
import { logger } from "./logger.js";

/**
 * Tests for Environment Validation
 *
 * Verifies validation of required environment variables for:
 * - GitHub App authentication (APP_ID, private key, webhook secret)
 * - LLM provider configuration (optional)
 */

describe("normalizeEnvString", () => {
  it("returns undefined for undefined input", () => {
    expect(normalizeEnvString(undefined)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(normalizeEnvString("")).toBeUndefined();
  });

  it("returns undefined for whitespace-only string", () => {
    expect(normalizeEnvString("   ")).toBeUndefined();
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeEnvString("  hello  ")).toBe("hello");
  });

  it("strips surrounding double quotes", () => {
    expect(normalizeEnvString('"12345"')).toBe("12345");
  });

  it("strips surrounding single quotes", () => {
    expect(normalizeEnvString("'12345'")).toBe("12345");
  });

  it("strips quotes then trims inner whitespace", () => {
    expect(normalizeEnvString('"  12345  "')).toBe("12345");
  });

  it("does not strip mismatched quotes", () => {
    expect(normalizeEnvString("\"12345'")).toBe("\"12345'");
  });

  it("returns undefined when only quotes remain after stripping", () => {
    expect(normalizeEnvString('""')).toBeUndefined();
  });

  it("emits a logger.warn when normalization changes the value and name is given", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    normalizeEnvString("  value  ", "MY_VAR");
    expect(warnSpy).toHaveBeenCalledWith(
      "[env] env var MY_VAR was normalized (whitespace/quotes removed)"
    );
    warnSpy.mockRestore();
  });

  it("does not warn when normalization is a no-op", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    normalizeEnvString("clean", "MY_VAR");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does not warn when name is omitted", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    normalizeEnvString("  value  ");
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("env-validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear all relevant env vars
    delete process.env.APP_ID;
    delete process.env.PRIVATE_KEY;
    delete process.env.APP_PRIVATE_KEY;
    delete process.env.WEBHOOK_SECRET;
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.MISTRAL_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("hasPrivateKey", () => {
    it("should return true when PRIVATE_KEY is set", () => {
      process.env.PRIVATE_KEY = "test-key";
      expect(hasPrivateKey()).toBe(true);
    });

    it("should return true when APP_PRIVATE_KEY is set", () => {
      process.env.APP_PRIVATE_KEY = "test-key";
      expect(hasPrivateKey()).toBe(true);
    });

    it("should return true when both are set", () => {
      process.env.PRIVATE_KEY = "key1";
      process.env.APP_PRIVATE_KEY = "key2";
      expect(hasPrivateKey()).toBe(true);
    });

    it("should return false when neither is set", () => {
      expect(hasPrivateKey()).toBe(false);
    });

    it("should return false for empty string values", () => {
      process.env.PRIVATE_KEY = "";
      process.env.APP_PRIVATE_KEY = "";
      expect(hasPrivateKey()).toBe(false);
    });

    it("should return false for whitespace-only values", () => {
      process.env.PRIVATE_KEY = "   ";
      process.env.APP_PRIVATE_KEY = "   ";
      expect(hasPrivateKey()).toBe(false);
    });

    it("should return true for quoted key values", () => {
      process.env.PRIVATE_KEY = '"test-key"';
      expect(hasPrivateKey()).toBe(true);
    });
  });

  describe("getPrivateKey", () => {
    it("should return PRIVATE_KEY when set", () => {
      process.env.PRIVATE_KEY = "primary-key";
      expect(getPrivateKey()).toBe("primary-key");
    });

    it("should return APP_PRIVATE_KEY when PRIVATE_KEY not set", () => {
      process.env.APP_PRIVATE_KEY = "fallback-key";
      expect(getPrivateKey()).toBe("fallback-key");
    });

    it("should prefer PRIVATE_KEY over APP_PRIVATE_KEY", () => {
      process.env.PRIVATE_KEY = "primary";
      process.env.APP_PRIVATE_KEY = "fallback";
      expect(getPrivateKey()).toBe("primary");
    });

    it("should return undefined when neither is set", () => {
      expect(getPrivateKey()).toBeUndefined();
    });

    it("should fall back to APP_PRIVATE_KEY when PRIVATE_KEY is empty string", () => {
      process.env.PRIVATE_KEY = "";
      process.env.APP_PRIVATE_KEY = "fallback-key";
      expect(getPrivateKey()).toBe("fallback-key");
    });

    it("should return undefined when both are empty strings", () => {
      process.env.PRIVATE_KEY = "";
      process.env.APP_PRIVATE_KEY = "";
      expect(getPrivateKey()).toBeUndefined();
    });

    it("should strip surrounding quotes from returned value", () => {
      process.env.PRIVATE_KEY = '"-----BEGIN RSA PRIVATE KEY-----"';
      expect(getPrivateKey()).toBe("-----BEGIN RSA PRIVATE KEY-----");
    });

    it("should trim whitespace from returned value", () => {
      process.env.PRIVATE_KEY = "  my-key  ";
      expect(getPrivateKey()).toBe("my-key");
    });

    it("should return undefined for whitespace-only PRIVATE_KEY and fall back to APP_PRIVATE_KEY", () => {
      process.env.PRIVATE_KEY = "   ";
      process.env.APP_PRIVATE_KEY = "fallback-key";
      expect(getPrivateKey()).toBe("fallback-key");
    });
  });

  describe("validateEnv", () => {
    it("should return valid when all required vars are set", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = "test-key";

      const result = validateEnv();
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("should return missing APP_ID when not set", () => {
      process.env.PRIVATE_KEY = "test-key";

      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("APP_ID");
    });

    it("should return missing private key when neither option is set", () => {
      process.env.APP_ID = "12345";

      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("PRIVATE_KEY or APP_PRIVATE_KEY");
    });

    it("should accept APP_PRIVATE_KEY as alternative", () => {
      process.env.APP_ID = "12345";
      process.env.APP_PRIVATE_KEY = "test-key";

      const result = validateEnv();
      expect(result.valid).toBe(true);
    });

    it("should require WEBHOOK_SECRET when requireWebhookSecret is true", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = "test-key";

      const result = validateEnv(true);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("WEBHOOK_SECRET");
    });

    it("should pass when WEBHOOK_SECRET is set and required", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = "test-key";
      process.env.WEBHOOK_SECRET = "secret";

      const result = validateEnv(true);
      expect(result.valid).toBe(true);
    });

    it("should not require WEBHOOK_SECRET by default", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = "test-key";

      const result = validateEnv();
      expect(result.valid).toBe(true);
    });

    it("should collect all missing vars", () => {
      const result = validateEnv(true);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("APP_ID");
      expect(result.missing).toContain("PRIVATE_KEY or APP_PRIVATE_KEY");
      expect(result.missing).toContain("WEBHOOK_SECRET");
    });

    it("should reject whitespace-only APP_ID as missing", () => {
      process.env.APP_ID = "   ";
      process.env.PRIVATE_KEY = "test-key";
      const result = validateEnv();
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("APP_ID");
    });

    it("should reject whitespace-only WEBHOOK_SECRET when required", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = "test-key";
      process.env.WEBHOOK_SECRET = "   ";
      const result = validateEnv(true);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("WEBHOOK_SECRET");
    });
  });

  describe("getAppId", () => {
    it("should return numeric APP_ID", () => {
      process.env.APP_ID = "12345";
      expect(getAppId()).toBe(12345);
    });

    it("should throw when APP_ID is not set", () => {
      expect(() => getAppId()).toThrow("APP_ID environment variable is not set");
    });

    it("should throw when APP_ID is not a number", () => {
      process.env.APP_ID = "not-a-number";
      expect(() => getAppId()).toThrow("APP_ID must be a positive number, got: not-a-number");
    });

    it("should throw when APP_ID is zero", () => {
      process.env.APP_ID = "0";
      expect(() => getAppId()).toThrow("APP_ID must be a positive number, got: 0");
    });

    it("should throw when APP_ID is negative", () => {
      process.env.APP_ID = "-1";
      expect(() => getAppId()).toThrow("APP_ID must be a positive number, got: -1");
    });

    it("should accept large APP_IDs", () => {
      process.env.APP_ID = "999999999";
      expect(getAppId()).toBe(999999999);
    });

    it("should parse APP_ID wrapped in double quotes", () => {
      process.env.APP_ID = '"12345"';
      expect(getAppId()).toBe(12345);
    });

    it("should parse APP_ID with surrounding whitespace", () => {
      process.env.APP_ID = "  12345  ";
      expect(getAppId()).toBe(12345);
    });

    it("should throw when APP_ID is whitespace-only", () => {
      process.env.APP_ID = "   ";
      expect(() => getAppId()).toThrow("APP_ID environment variable is not set");
    });
  });

  describe("validatePrivateKeyFormat", () => {
    it("should accept valid PEM key format", () => {
      const validKey = "-----BEGIN RSA PRIVATE KEY-----\nkey-content\n-----END RSA PRIVATE KEY-----";
      expect(() => validatePrivateKeyFormat(validKey)).not.toThrow();
    });

    it("should throw for non-PEM content", () => {
      expect(() => validatePrivateKeyFormat("invalid-key")).toThrow(
        "Private key does not appear to be a valid PEM-encoded key"
      );
    });

    it("should throw when missing BEGIN marker", () => {
      expect(() => validatePrivateKeyFormat("content-----END KEY-----")).toThrow(
        "Private key does not appear to be a valid PEM-encoded key"
      );
    });

    it("should throw when missing END marker", () => {
      expect(() => validatePrivateKeyFormat("-----BEGIN KEY-----content")).toThrow(
        "Private key does not appear to be a valid PEM-encoded key"
      );
    });
  });

  describe("getAppConfig", () => {
    const validPemKey = "-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----";

    it("should return config when all required vars are set", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = validPemKey;

      const config = getAppConfig();
      expect(config.appId).toBe(12345);
      expect(config.privateKey).toBe(validPemKey);
      expect(config.webhookSecret).toBeUndefined();
    });

    it("should include webhookSecret when available", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = validPemKey;
      process.env.WEBHOOK_SECRET = "secret123";

      const config = getAppConfig();
      expect(config.webhookSecret).toBe("secret123");
    });

    it("should throw when required vars are missing", () => {
      expect(() => getAppConfig()).toThrow("Missing required environment variables");
    });

    it("should throw when APP_ID is invalid", () => {
      process.env.APP_ID = "not-a-number";
      process.env.PRIVATE_KEY = validPemKey;

      expect(() => getAppConfig()).toThrow("APP_ID must be a positive number");
    });

    it("should throw when private key format is invalid", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = "invalid-key";

      expect(() => getAppConfig()).toThrow("Private key does not appear to be a valid PEM-encoded key");
    });

    it("should require WEBHOOK_SECRET when requireWebhookSecret is true", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = validPemKey;

      expect(() => getAppConfig(true)).toThrow("Missing required environment variables: WEBHOOK_SECRET");
    });

    it("should use APP_PRIVATE_KEY as fallback", () => {
      process.env.APP_ID = "12345";
      process.env.APP_PRIVATE_KEY = validPemKey;

      const config = getAppConfig();
      expect(config.privateKey).toBe(validPemKey);
    });

    it("should use APP_PRIVATE_KEY when PRIVATE_KEY is empty string", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = "";
      process.env.APP_PRIVATE_KEY = validPemKey;

      const config = getAppConfig();
      expect(config.privateKey).toBe(validPemKey);
    });

    it("should normalize quoted APP_ID", () => {
      process.env.APP_ID = '"12345"';
      process.env.PRIVATE_KEY = validPemKey;

      const config = getAppConfig();
      expect(config.appId).toBe(12345);
    });

    it("should normalize quoted WEBHOOK_SECRET", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = validPemKey;
      process.env.WEBHOOK_SECRET = '"my-secret"';

      const config = getAppConfig();
      expect(config.webhookSecret).toBe("my-secret");
    });

    it("should return undefined for whitespace-only WEBHOOK_SECRET", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = validPemKey;
      process.env.WEBHOOK_SECRET = "   ";

      const config = getAppConfig();
      expect(config.webhookSecret).toBeUndefined();
    });

    it("should normalize whitespace-padded PRIVATE_KEY", () => {
      process.env.APP_ID = "12345";
      process.env.PRIVATE_KEY = `  ${validPemKey}  `;

      const config = getAppConfig();
      expect(config.privateKey).toBe(validPemKey);
    });
  });
});
