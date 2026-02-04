/**
 * Represents a secret that is overdue for rotation.
 */
export interface StaleSecret {
  name: string;
  lastRotated: Date;
  ageDays: number;
}

/**
 * Represents a secret value with metadata.
 */
export interface SecretValue {
  name: string;
  value: string;
  /** AWS ARN */
  arn?: string;
  /** Azure secret ID */
  id?: string;
}
