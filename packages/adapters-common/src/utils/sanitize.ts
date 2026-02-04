/**
 * Sanitize a name for use in cloud resources.
 * Handles naming constraints across AWS, Azure, and GCP.
 *
 * @param name - Raw name to sanitize
 * @param maxLength - Maximum length (default: 63 for most cloud resources)
 * @returns Sanitized name safe for cloud resources
 */
export function sanitizeName(name: string, maxLength = 63): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .substring(0, maxLength);

  if (!sanitized) {
    throw new Error(`Invalid name: "${name}" produces empty sanitized value`);
  }

  return sanitized;
}

/**
 * Sanitize a name for Azure Key Vault secrets.
 * Key Vault has specific requirements: alphanumeric and hyphens only, max 127 chars.
 *
 * @param name - Raw name to sanitize
 * @returns Sanitized name safe for Key Vault
 */
export function sanitizeKeyVaultName(name: string): string {
  return sanitizeName(name, 127);
}

/**
 * Sanitize a name for Azure Container Instances.
 * ACI requires max 63 chars.
 *
 * @param name - Raw name to sanitize
 * @returns Sanitized name safe for ACI
 */
export function sanitizeAciName(name: string): string {
  return sanitizeName(name, 63);
}

/**
 * Sanitize a name for AWS resources.
 * Most AWS resources allow 63-256 chars depending on service.
 *
 * @param name - Raw name to sanitize
 * @param maxLength - Maximum length (default: 255)
 * @returns Sanitized name safe for AWS
 */
export function sanitizeAwsName(name: string, maxLength = 255): string {
  return sanitizeName(name, maxLength);
}
