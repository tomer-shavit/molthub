/**
 * AES-256-GCM encryption/decryption for state data at rest.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128-bit auth tag

/**
 * Encrypt a buffer using AES-256-GCM.
 *
 * Output format: [IV (12 bytes)] [Auth Tag (16 bytes)] [Ciphertext]
 *
 * @param data - Plaintext buffer
 * @param keyHex - 32-byte key as 64-char hex string
 * @returns Encrypted buffer with IV and auth tag prepended
 */
export function encryptBuffer(data: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be exactly 32 bytes (64 hex chars)");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // [IV][AuthTag][Ciphertext]
  return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Decrypt a buffer encrypted with {@link encryptBuffer}.
 *
 * @param data - Encrypted buffer (IV + AuthTag + Ciphertext)
 * @param keyHex - 32-byte key as 64-char hex string
 * @returns Decrypted plaintext buffer
 */
export function decryptBuffer(data: Buffer, keyHex: string): Buffer {
  const key = Buffer.from(keyHex, "hex");
  if (key.length !== 32) {
    throw new Error("Encryption key must be exactly 32 bytes (64 hex chars)");
  }

  const minLength = IV_LENGTH + AUTH_TAG_LENGTH + 1;
  if (data.length < minLength) {
    throw new Error("Encrypted data is too short to be valid");
  }

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
