import { AuditEvent, Prisma } from "@prisma/client";
import { PaginationOptions, PaginatedResult, TransactionClient } from "./base";

export interface AuditEventFilters {
  workspaceId?: string;
  actor?: string;
  action?: string | string[];
  resourceType?: string | string[];
  resourceId?: string;
  timestampAfter?: Date;
  timestampBefore?: Date;
}

export interface AuditEventWithRelations extends AuditEvent {
  user?: {
    id: string;
    name: string;
    email: string;
  } | null;}

export interface AuditActionCount {
  action: string;
  _count: number;
}

export interface AuditResourceTypeCount {
  resourceType: string;
  _count: number;
}

export interface IAuditRepository {
  /**
   * Find an audit event by ID
   */
  findById(
    id: string,
    tx?: TransactionClient
  ): Promise<AuditEventWithRelations | null>;

  /**
   * Find multiple audit events with optional filters and pagination
   */
  findMany(
    filters?: AuditEventFilters,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<AuditEvent>>;

  /**
   * Find audit events by workspace
   */
  findByWorkspace(
    workspaceId: string,
    filters?: Omit<AuditEventFilters, "workspaceId">,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<AuditEvent>>;

  /**
   * Find audit events for a specific resource
   */
  findByResource(
    resourceType: string,
    resourceId: string,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<AuditEvent>>;

  /**
   * Find audit events by actor
   */
  findByActor(
    actor: string,
    filters?: Omit<AuditEventFilters, "actor">,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<AuditEvent>>;

  /**
   * Count audit events matching filters
   */
  count(filters?: AuditEventFilters, tx?: TransactionClient): Promise<number>;

  /**
   * Create an audit event
   */
  create(
    data: Prisma.AuditEventCreateInput,
    tx?: TransactionClient
  ): Promise<AuditEvent>;

  /**
   * Create multiple audit events
   */
  createMany(
    data: Prisma.AuditEventCreateManyInput[],
    tx?: TransactionClient
  ): Promise<number>;

  /**
   * Delete audit events older than a date (for retention policies)
   */
  deleteOlderThan(date: Date, tx?: TransactionClient): Promise<number>;

  /**
   * Group audit events by action
   */
  groupByAction(
    filters?: AuditEventFilters,
    tx?: TransactionClient
  ): Promise<AuditActionCount[]>;

  /**
   * Group audit events by resource type
   */
  groupByResourceType(
    filters?: AuditEventFilters,
    tx?: TransactionClient
  ): Promise<AuditResourceTypeCount[]>;
}
