import {
  BotTeamMember,
  A2aApiKey,
  Prisma,
} from "@prisma/client";
import { PaginationOptions, PaginatedResult, TransactionClient } from "./base";

// ============================================
// BOT TEAM MEMBER TYPES
// ============================================

export interface BotTeamMemberFilters {
  workspaceId?: string;
  ownerBotId?: string;
  memberBotId?: string;
  enabled?: boolean;
}

export interface BotTeamMemberWithRelations extends BotTeamMember {
  ownerBot?: {
    id: string;
    name: string;
  } | null;
  memberBot?: {
    id: string;
    name: string;
  } | null;
}

// ============================================
// A2A API KEY TYPES
// ============================================

export interface A2aApiKeyFilters {
  botInstanceId?: string;
  isActive?: boolean;
  isExpired?: boolean;
}

export interface A2aApiKeyWithRelations extends A2aApiKey {
  botInstance?: {
    id: string;
    name: string;
    fleetId: string;
  } | null;
}

export interface CreateA2aApiKeyResult {
  key: A2aApiKey;
  plainTextKey: string; // Only returned once at creation time
}

export interface IRoutingRepository {
  // ============================================
  // BOT TEAM MEMBER METHODS
  // ============================================

  /**
   * Find a team member by ID
   */
  findTeamMemberById(
    id: string,
    tx?: TransactionClient
  ): Promise<BotTeamMemberWithRelations | null>;

  /**
   * Find multiple team members with optional filters and pagination
   */
  findManyTeamMembers(
    filters?: BotTeamMemberFilters,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<BotTeamMember>>;

  /**
   * Find team members for an owner bot (team lead)
   */
  findTeamMembersByOwner(
    ownerBotId: string,
    tx?: TransactionClient
  ): Promise<BotTeamMemberWithRelations[]>;

  /**
   * Find teams that a bot is a member of
   */
  findTeamsByMember(
    memberBotId: string,
    tx?: TransactionClient
  ): Promise<BotTeamMemberWithRelations[]>;

  /**
   * Create a team member
   */
  createTeamMember(
    data: Prisma.BotTeamMemberCreateInput,
    tx?: TransactionClient
  ): Promise<BotTeamMember>;

  /**
   * Update a team member
   */
  updateTeamMember(
    id: string,
    data: Prisma.BotTeamMemberUpdateInput,
    tx?: TransactionClient
  ): Promise<BotTeamMember>;

  /**
   * Delete a team member
   */
  deleteTeamMember(id: string, tx?: TransactionClient): Promise<void>;

  /**
   * Add a member to a team (alias for createTeamMember with simplified parameters)
   */
  addMember(
    ownerBotId: string,
    memberBotId: string,
    role: string,
    description: string,
    tx?: TransactionClient
  ): Promise<BotTeamMember>;

  /**
   * Remove a member from a team
   */
  removeMember(
    ownerBotId: string,
    memberBotId: string,
    tx?: TransactionClient
  ): Promise<void>;

  /**
   * Check if a bot is a member of another bot's team
   */
  isTeamMember(
    ownerBotId: string,
    memberBotId: string,
    tx?: TransactionClient
  ): Promise<boolean>;

  // ============================================
  // A2A API KEY METHODS
  // ============================================

  /**
   * Find an API key by ID
   */
  findApiKeyById(id: string, tx?: TransactionClient): Promise<A2aApiKey | null>;

  /**
   * Find an API key by its hash
   */
  findApiKeyByHash(keyHash: string, tx?: TransactionClient): Promise<A2aApiKey | null>;

  /**
   * Find API keys for a bot instance
   */
  findApiKeysByBotInstance(
    botInstanceId: string,
    filters?: Omit<A2aApiKeyFilters, "botInstanceId">,
    tx?: TransactionClient
  ): Promise<A2aApiKey[]>;

  /**
   * Create an API key
   */
  createApiKey(
    data: Prisma.A2aApiKeyCreateInput,
    tx?: TransactionClient
  ): Promise<A2aApiKey>;

  /**
   * Update an API key (e.g., record last used)
   */
  updateApiKey(
    id: string,
    data: Prisma.A2aApiKeyUpdateInput,
    tx?: TransactionClient
  ): Promise<A2aApiKey>;

  /**
   * Delete an API key
   */
  deleteApiKey(id: string, tx?: TransactionClient): Promise<void>;

  /**
   * Deactivate an API key
   */
  deactivateApiKey(id: string, tx?: TransactionClient): Promise<A2aApiKey>;

  /**
   * Record API key usage
   */
  recordApiKeyUsage(id: string, tx?: TransactionClient): Promise<A2aApiKey>;

  /**
   * Delete expired API keys
   */
  deleteExpiredApiKeys(tx?: TransactionClient): Promise<number>;

  /**
   * Revoke an API key (set isActive to false)
   */
  revokeApiKey(id: string, tx?: TransactionClient): Promise<A2aApiKey>;

  /**
   * Verify an API key - returns the key if valid, null otherwise
   * Checks: exists, isActive, not expired
   */
  verifyApiKey(
    plainTextKey: string,
    tx?: TransactionClient
  ): Promise<A2aApiKeyWithRelations | null>;
}
