const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Calculate the age of a date in days.
 *
 * @param date - The date to calculate age for
 * @returns The number of days since the date
 */
export function calculateAgeDays(date: Date): number {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  return Math.floor(diffMs / MILLISECONDS_PER_DAY);
}

/**
 * Check if a date is older than a specified number of days.
 *
 * @param date - The date to check
 * @param maxAgeDays - Maximum age in days
 * @returns True if the date is older than maxAgeDays
 */
export function isOlderThan(date: Date, maxAgeDays: number): boolean {
  return calculateAgeDays(date) > maxAgeDays;
}

/**
 * Get the date N days ago from now.
 *
 * @param days - Number of days ago
 * @returns The date N days ago
 */
export function daysAgo(days: number): Date {
  const date = new Date();
  date.setTime(date.getTime() - days * MILLISECONDS_PER_DAY);
  return date;
}
