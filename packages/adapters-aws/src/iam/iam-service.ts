import {
  IAMClient,
  GetRoleCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  AttachRolePolicyCommand,
  DetachRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  CreateInstanceProfileCommand,
  DeleteInstanceProfileCommand,
  GetInstanceProfileCommand,
  AddRoleToInstanceProfileCommand,
  RemoveRoleFromInstanceProfileCommand,
  ListInstanceProfilesForRoleCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
  GetRolePolicyCommand,
  Role,
  InstanceProfile,
  AttachedPolicy,
} from "@aws-sdk/client-iam";

export interface IAMCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface RoleInfo {
  roleId: string;
  roleName: string;
  arn: string;
  path: string;
  assumeRolePolicyDocument: string;
  description?: string;
  maxSessionDuration: number;
  createDate: Date;
  tags: Record<string, string>;
}

export interface InstanceProfileInfo {
  instanceProfileId: string;
  instanceProfileName: string;
  arn: string;
  path: string;
  roles: { roleId: string; roleName: string; arn: string }[];
  createDate: Date;
}

export interface AttachedPolicyInfo {
  policyName: string;
  policyArn: string;
}

export class IAMService {
  private client: IAMClient;

  constructor(region: string = "us-east-1", credentials?: IAMCredentials) {
    // IAM is a global service but we still need a region for the client
    this.client = new IAMClient({
      region,
      credentials: credentials
        ? {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
          }
        : undefined,
    });
  }

  /**
   * Get a role by name.
   */
  async getRole(roleName: string): Promise<RoleInfo | undefined> {
    try {
      const result = await this.client.send(
        new GetRoleCommand({ RoleName: roleName })
      );

      const role = result.Role;
      if (!role) {
        return undefined;
      }

      return this.mapRoleToInfo(role);
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchEntityException") {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Check if a role exists.
   */
  async roleExists(roleName: string): Promise<boolean> {
    const role = await this.getRole(roleName);
    return role !== undefined;
  }

  /**
   * Create a new IAM role.
   */
  async createRole(
    roleName: string,
    assumeRolePolicyDocument: string | object,
    options?: {
      description?: string;
      path?: string;
      maxSessionDuration?: number;
      tags?: Record<string, string>;
    }
  ): Promise<RoleInfo> {
    const policyDoc =
      typeof assumeRolePolicyDocument === "string"
        ? assumeRolePolicyDocument
        : JSON.stringify(assumeRolePolicyDocument);

    const tags = options?.tags
      ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
      : undefined;

    const result = await this.client.send(
      new CreateRoleCommand({
        RoleName: roleName,
        AssumeRolePolicyDocument: policyDoc,
        Description: options?.description,
        Path: options?.path ?? "/",
        MaxSessionDuration: options?.maxSessionDuration ?? 3600,
        Tags: tags,
      })
    );

    const role = result.Role;
    if (!role) {
      throw new Error(`Failed to create role "${roleName}"`);
    }

    return this.mapRoleToInfo(role);
  }

  /**
   * Delete an IAM role.
   * Note: You must detach all policies and remove from instance profiles first.
   */
  async deleteRole(roleName: string): Promise<void> {
    await this.client.send(new DeleteRoleCommand({ RoleName: roleName }));
  }

  /**
   * Attach a managed policy to a role.
   */
  async attachRolePolicy(roleName: string, policyArn: string): Promise<void> {
    await this.client.send(
      new AttachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: policyArn,
      })
    );
  }

  /**
   * Detach a managed policy from a role.
   */
  async detachRolePolicy(roleName: string, policyArn: string): Promise<void> {
    await this.client.send(
      new DetachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: policyArn,
      })
    );
  }

  /**
   * List managed policies attached to a role.
   */
  async listAttachedRolePolicies(roleName: string): Promise<AttachedPolicyInfo[]> {
    const policies: AttachedPolicyInfo[] = [];
    let marker: string | undefined;

    do {
      const result = await this.client.send(
        new ListAttachedRolePoliciesCommand({
          RoleName: roleName,
          Marker: marker,
        })
      );

      for (const policy of result.AttachedPolicies ?? []) {
        policies.push(this.mapAttachedPolicyToInfo(policy));
      }

      marker = result.Marker;
    } while (marker);

    return policies;
  }

  /**
   * Put an inline policy on a role.
   */
  async putRolePolicy(
    roleName: string,
    policyName: string,
    policyDocument: string | object
  ): Promise<void> {
    const policyDoc =
      typeof policyDocument === "string"
        ? policyDocument
        : JSON.stringify(policyDocument);

    await this.client.send(
      new PutRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName,
        PolicyDocument: policyDoc,
      })
    );
  }

  /**
   * Get an inline policy from a role.
   */
  async getRolePolicy(
    roleName: string,
    policyName: string
  ): Promise<string | undefined> {
    try {
      const result = await this.client.send(
        new GetRolePolicyCommand({
          RoleName: roleName,
          PolicyName: policyName,
        })
      );

      return result.PolicyDocument
        ? decodeURIComponent(result.PolicyDocument)
        : undefined;
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchEntityException") {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Delete an inline policy from a role.
   */
  async deleteRolePolicy(roleName: string, policyName: string): Promise<void> {
    await this.client.send(
      new DeleteRolePolicyCommand({
        RoleName: roleName,
        PolicyName: policyName,
      })
    );
  }

  /**
   * Get an instance profile by name.
   */
  async getInstanceProfile(
    instanceProfileName: string
  ): Promise<InstanceProfileInfo | undefined> {
    try {
      const result = await this.client.send(
        new GetInstanceProfileCommand({
          InstanceProfileName: instanceProfileName,
        })
      );

      const profile = result.InstanceProfile;
      if (!profile) {
        return undefined;
      }

      return this.mapInstanceProfileToInfo(profile);
    } catch (error) {
      if (error instanceof Error && error.name === "NoSuchEntityException") {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Check if an instance profile exists.
   */
  async instanceProfileExists(instanceProfileName: string): Promise<boolean> {
    const profile = await this.getInstanceProfile(instanceProfileName);
    return profile !== undefined;
  }

  /**
   * Create an instance profile.
   */
  async createInstanceProfile(
    instanceProfileName: string,
    options?: {
      path?: string;
      tags?: Record<string, string>;
    }
  ): Promise<InstanceProfileInfo> {
    const tags = options?.tags
      ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
      : undefined;

    const result = await this.client.send(
      new CreateInstanceProfileCommand({
        InstanceProfileName: instanceProfileName,
        Path: options?.path ?? "/",
        Tags: tags,
      })
    );

    const profile = result.InstanceProfile;
    if (!profile) {
      throw new Error(`Failed to create instance profile "${instanceProfileName}"`);
    }

    return this.mapInstanceProfileToInfo(profile);
  }

  /**
   * Delete an instance profile.
   * Note: You must remove all roles from the instance profile first.
   */
  async deleteInstanceProfile(instanceProfileName: string): Promise<void> {
    await this.client.send(
      new DeleteInstanceProfileCommand({
        InstanceProfileName: instanceProfileName,
      })
    );
  }

  /**
   * Add a role to an instance profile.
   */
  async addRoleToInstanceProfile(
    instanceProfileName: string,
    roleName: string
  ): Promise<void> {
    await this.client.send(
      new AddRoleToInstanceProfileCommand({
        InstanceProfileName: instanceProfileName,
        RoleName: roleName,
      })
    );
  }

  /**
   * Remove a role from an instance profile.
   */
  async removeRoleFromInstanceProfile(
    instanceProfileName: string,
    roleName: string
  ): Promise<void> {
    await this.client.send(
      new RemoveRoleFromInstanceProfileCommand({
        InstanceProfileName: instanceProfileName,
        RoleName: roleName,
      })
    );
  }

  /**
   * List instance profiles for a role.
   */
  async listInstanceProfilesForRole(
    roleName: string
  ): Promise<InstanceProfileInfo[]> {
    const profiles: InstanceProfileInfo[] = [];
    let marker: string | undefined;

    do {
      const result = await this.client.send(
        new ListInstanceProfilesForRoleCommand({
          RoleName: roleName,
          Marker: marker,
        })
      );

      for (const profile of result.InstanceProfiles ?? []) {
        profiles.push(this.mapInstanceProfileToInfo(profile));
      }

      marker = result.Marker;
    } while (marker);

    return profiles;
  }

  /**
   * Ensure a role exists with the given assume role policy.
   * Creates the role if it doesn't exist.
   */
  async ensureRole(
    roleName: string,
    assumeRolePolicyDocument: string | object,
    options?: {
      description?: string;
      path?: string;
      maxSessionDuration?: number;
      tags?: Record<string, string>;
    }
  ): Promise<RoleInfo> {
    const existing = await this.getRole(roleName);
    if (existing) {
      return existing;
    }
    return this.createRole(roleName, assumeRolePolicyDocument, options);
  }

  /**
   * Ensure an instance profile exists with the given role attached.
   */
  async ensureInstanceProfileWithRole(
    instanceProfileName: string,
    roleName: string,
    options?: { path?: string; tags?: Record<string, string> }
  ): Promise<InstanceProfileInfo> {
    let profile = await this.getInstanceProfile(instanceProfileName);

    if (!profile) {
      profile = await this.createInstanceProfile(instanceProfileName, options);
      // Wait a bit for the instance profile to propagate
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    // Check if the role is already attached
    const hasRole = profile.roles.some((r) => r.roleName === roleName);
    if (!hasRole) {
      await this.addRoleToInstanceProfile(instanceProfileName, roleName);
      // Refresh the profile
      profile = await this.getInstanceProfile(instanceProfileName);
      if (!profile) {
        throw new Error(`Instance profile "${instanceProfileName}" not found after adding role`);
      }
    }

    return profile;
  }

  /**
   * Map AWS SDK Role to RoleInfo.
   */
  private mapRoleToInfo(role: Role): RoleInfo {
    const tags: Record<string, string> = {};
    for (const tag of role.Tags ?? []) {
      if (tag.Key && tag.Value) {
        tags[tag.Key] = tag.Value;
      }
    }

    return {
      roleId: role.RoleId || "",
      roleName: role.RoleName || "",
      arn: role.Arn || "",
      path: role.Path || "/",
      assumeRolePolicyDocument: role.AssumeRolePolicyDocument
        ? decodeURIComponent(role.AssumeRolePolicyDocument)
        : "",
      description: role.Description,
      maxSessionDuration: role.MaxSessionDuration || 3600,
      createDate: role.CreateDate || new Date(),
      tags,
    };
  }

  /**
   * Map AWS SDK InstanceProfile to InstanceProfileInfo.
   */
  private mapInstanceProfileToInfo(profile: InstanceProfile): InstanceProfileInfo {
    return {
      instanceProfileId: profile.InstanceProfileId || "",
      instanceProfileName: profile.InstanceProfileName || "",
      arn: profile.Arn || "",
      path: profile.Path || "/",
      roles: (profile.Roles ?? []).map((r) => ({
        roleId: r.RoleId || "",
        roleName: r.RoleName || "",
        arn: r.Arn || "",
      })),
      createDate: profile.CreateDate || new Date(),
    };
  }

  /**
   * Map AWS SDK AttachedPolicy to AttachedPolicyInfo.
   */
  private mapAttachedPolicyToInfo(policy: AttachedPolicy): AttachedPolicyInfo {
    return {
      policyName: policy.PolicyName || "",
      policyArn: policy.PolicyArn || "",
    };
  }
}
