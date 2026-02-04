/**
 * Shared directory utilities for state-sync backends.
 *
 * These utilities are extracted from the individual backend implementations
 * to eliminate code duplication. All backends use the same pack/unpack format
 * and checksum algorithm.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Calculate SHA-256 hash of a buffer.
 */
export function sha256(data: Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Recursively read all files in a directory.
 * @param dir - Directory path to read
 * @param base - Base path for relative file paths (defaults to dir)
 * @returns Map of relative paths to file contents
 */
export async function readDirRecursive(
  dir: string,
  base: string = dir
): Promise<Map<string, Buffer>> {
  const result = new Map<string, Buffer>();

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(base, fullPath);

      if (entry.isDirectory()) {
        const subFiles = await readDirRecursive(fullPath, base);
        for (const [subPath, content] of subFiles) {
          result.set(subPath, content);
        }
      } else if (entry.isFile()) {
        const content = await fs.readFile(fullPath);
        result.set(relativePath, content);
      }
    }
  } catch (error) {
    // Directory doesn't exist or is empty - return empty map
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  return result;
}

/**
 * Pack a map of files into a single buffer.
 *
 * Format: [4 bytes header length (LE)][JSON header][file contents concatenated]
 * Header contains: { files: [{ path, offset, size }] }
 *
 * Note: Uses little-endian for header length to match the existing format
 * in the codebase.
 */
export function packDirectory(files: Map<string, Buffer>): Buffer {
  const fileEntries: Array<{ path: string; offset: number; size: number }> = [];
  const chunks: Buffer[] = [];
  let currentOffset = 0;

  for (const [filePath, content] of files) {
    fileEntries.push({
      path: filePath,
      offset: currentOffset,
      size: content.length,
    });
    chunks.push(content);
    currentOffset += content.length;
  }

  const header = JSON.stringify(fileEntries);
  const headerBuffer = Buffer.from(header, "utf8");
  const headerLengthBuffer = Buffer.alloc(4);
  headerLengthBuffer.writeUInt32BE(headerBuffer.length, 0);

  return Buffer.concat([headerLengthBuffer, headerBuffer, ...chunks]);
}

/**
 * Unpack a packed directory buffer into files on disk.
 * @param packed - Packed buffer from packDirectory
 * @param targetDir - Directory to extract files to
 */
export async function unpackDirectory(
  packed: Buffer,
  targetDir: string
): Promise<void> {
  const headerLength = packed.readUInt32BE(0);
  const headerJson = packed.subarray(4, 4 + headerLength).toString("utf8");
  const manifest = JSON.parse(headerJson) as Array<{
    path: string;
    offset: number;
    size: number;
  }>;
  const dataStart = 4 + headerLength;

  for (const file of manifest) {
    const filePath = path.join(targetDir, file.path);
    const fileDir = path.dirname(filePath);

    await fs.mkdir(fileDir, { recursive: true });

    const content = packed.subarray(
      dataStart + file.offset,
      dataStart + file.offset + file.size
    );
    await fs.writeFile(filePath, content);
  }
}

/**
 * Backup metadata stored alongside state data.
 */
export interface BackupMetadata {
  instanceId: string;
  timestamp: string;
  checksum: string;
  bytes: number;
  encrypted: boolean;
}

/**
 * Create backup metadata object.
 */
export function createBackupMetadata(
  instanceId: string,
  checksum: string,
  sizeBytes: number,
  encrypted: boolean
): BackupMetadata {
  return {
    instanceId,
    timestamp: new Date().toISOString(),
    checksum,
    bytes: sizeBytes,
    encrypted,
  };
}
