/**
 * Test Utilities for Molthub
 * 
 * Provides helper functions for testing, including mock setups,
 * database helpers, and assertion utilities.
 */

import { vi } from 'vitest';

// =============================================================================
// Mock Utilities
// =============================================================================

/**
 * Create a mock function that returns a resolved promise with the given value
 */
export function mockResolvedValue<T>(value: T): () => Promise<T> {
  return vi.fn().mockResolvedValue(value);
}

/**
 * Create a mock function that returns a rejected promise with the given error
 */
export function mockRejectedValue<T>(error: Error): () => Promise<T> {
  return vi.fn().mockRejectedValue(error);
}

/**
 * Create a mock implementation that tracks calls and returns values
 */
export function createMockFn<T, R>(implementation?: (...args: T[]) => R) {
  return vi.fn(implementation);
}

// =============================================================================
// Async Utilities
// =============================================================================

/**
 * Wait for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async operation with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delayMs?: number;
    backoff?: number;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delayMs = 100, backoff = 2 } = options;
  
  let lastError: Error | undefined;
  let delay = delayMs;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxAttempts) {
        await sleep(delay);
        delay *= backoff;
      }
    }
  }
  
  throw lastError;
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Check if a value is a valid date
 */
export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !isNaN(value.getTime());
}

/**
 * Check if a value is a valid UUID
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Check if an object has all the required properties
 */
export function hasProperties<T extends Record<string, unknown>>(
  obj: unknown,
  properties: (keyof T)[]
): obj is T {
  if (typeof obj !== 'object' || obj === null) return false;
  return properties.every(prop => prop in obj);
}

/**
 * Check if a string matches a pattern
 */
export function matchesPattern(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

// =============================================================================
// Object Utilities
// =============================================================================

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Merge two objects deeply
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key] as any;
    }
  }
  
  return result;
}

/**
 * Pick specific properties from an object
 */
export function pick<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific properties from an object
 */
export function omit<T extends Record<string, any>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

// =============================================================================
// Array Utilities
// =============================================================================

/**
 * Check if two arrays have the same elements (order doesn't matter)
 */
export function arraysEqual<T>(a: T[], b: T[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
}

/**
 * Get unique values from an array
 */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/**
 * Group array elements by a key function
 */
export function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Chunk an array into smaller arrays
 */
export function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// =============================================================================
// Validation Utilities
// =============================================================================

/**
 * Validate that a value is within a range
 */
export function inRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Validate that a string is not empty
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate that a value is a positive integer
 */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Validate that a value is a non-negative number
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && value >= 0;
}

// =============================================================================
// Test Setup Utilities
// =============================================================================

/**
 * Setup common test environment
 */
export function setupTestEnv(): void {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5433/molthub_test';
}

/**
 * Cleanup test environment
 */
export function cleanupTestEnv(): void {
  // Cleanup any test-specific environment variables
  delete process.env.TEST_SPECIFIC_VAR;
}

/**
 * Create a test timeout promise
 */
export function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
}

/**
 * Race a promise against a timeout
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([promise, createTimeout(ms)]);
}

// =============================================================================
// Error Testing Utilities
// =============================================================================

/**
 * Expect a function to throw an error matching a pattern
 */
export async function expectToThrow(
  fn: () => Promise<unknown> | unknown,
  pattern: string | RegExp
): Promise<void> {
  try {
    await fn();
    throw new Error('Expected function to throw but it did not');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof pattern === 'string') {
      if (!message.includes(pattern)) {
        throw new Error(`Expected error message to include "${pattern}" but got: ${message}`);
      }
    } else {
      if (!pattern.test(message)) {
        throw new Error(`Expected error message to match ${pattern} but got: ${message}`);
      }
    }
  }
}

/**
 * Expect a function to throw a specific error type
 */
export async function expectToThrowError<T extends Error>(
  fn: () => Promise<unknown> | unknown,
  ErrorClass: new (...args: any[]) => T
): Promise<void> {
  try {
    await fn();
    throw new Error(`Expected function to throw ${ErrorClass.name} but it did not`);
  } catch (error) {
    if (!(error instanceof ErrorClass)) {
      throw new Error(`Expected error to be instance of ${ErrorClass.name} but got: ${error?.constructor?.name}`);
    }
  }
}

// =============================================================================
// Performance Utilities
// =============================================================================

/**
 * Measure execution time of a function
 */
export async function measureTime<T>(fn: () => Promise<T> | T): Promise<{ result: T; durationMs: number }> {
  const start = performance.now();
  const result = await fn();
  const durationMs = performance.now() - start;
  return { result, durationMs };
}

/**
 * Benchmark a function over multiple iterations
 */
export async function benchmark<T>(
  fn: () => Promise<T> | T,
  iterations: number = 100
): Promise<{ avgMs: number; minMs: number; maxMs: number }> {
  const times: number[] = [];
  
  for (let i = 0; i < iterations; i++) {
    const { durationMs } = await measureTime(fn);
    times.push(durationMs);
  }
  
  return {
    avgMs: times.reduce((a, b) => a + b, 0) / times.length,
    minMs: Math.min(...times),
    maxMs: Math.max(...times),
  };
}
