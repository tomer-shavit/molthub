import {
  STSClient,
  GetCallerIdentityCommand,
  AssumeRoleCommand,
  GetSessionTokenCommand,
  Credentials,
} from "@aws-sdk/client-sts";

export interface STSCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface CallerIdentity {
  accountId: string;
  arn: string;
  userId: string;
}

export interface AssumedRoleCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: Date;
}

export interface AssumeRoleResult {
  credentials: AssumedRoleCredentials;
  assumedRoleUser: {
    assumedRoleId: string;
    arn: string;
  };
  packedPolicySize?: number;
}

export class STSService {
  private client: STSClient;

  constructor(region: string = "us-east-1", credentials?: STSCredentials) {
    this.client = new STSClient({
      region,
      credentials: credentials
        ? {
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken,
          }
        : undefined,
    });
  }

  /**
   * Get the AWS account ID and identity of the caller.
   * This is useful for discovering the account ID when it's not known.
   */
  async getCallerIdentity(): Promise<CallerIdentity> {
    const result = await this.client.send(new GetCallerIdentityCommand({}));

    return {
      accountId: result.Account || "",
      arn: result.Arn || "",
      userId: result.UserId || "",
    };
  }

  /**
   * Get just the account ID.
   */
  async getAccountId(): Promise<string> {
    const identity = await this.getCallerIdentity();
    return identity.accountId;
  }

  /**
   * Assume a role and get temporary credentials.
   */
  async assumeRole(
    roleArn: string,
    roleSessionName: string,
    options?: {
      durationSeconds?: number;
      externalId?: string;
      policy?: string | object;
      policyArns?: string[];
      tags?: { key: string; value: string }[];
      transitiveTagKeys?: string[];
    }
  ): Promise<AssumeRoleResult> {
    let policy: string | undefined;
    if (options?.policy) {
      policy = typeof options.policy === "object"
        ? JSON.stringify(options.policy)
        : options.policy;
    }

    const policyArns = options?.policyArns?.map((arn) => ({ arn }));

    const tags = options?.tags?.map((t) => ({ Key: t.key, Value: t.value }));

    const result = await this.client.send(
      new AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: roleSessionName,
        DurationSeconds: options?.durationSeconds ?? 3600,
        ExternalId: options?.externalId,
        Policy: policy,
        PolicyArns: policyArns,
        Tags: tags,
        TransitiveTagKeys: options?.transitiveTagKeys,
      })
    );

    const creds = result.Credentials;
    if (!creds) {
      throw new Error("Failed to assume role - no credentials returned");
    }

    return {
      credentials: this.mapCredentials(creds),
      assumedRoleUser: {
        assumedRoleId: result.AssumedRoleUser?.AssumedRoleId || "",
        arn: result.AssumedRoleUser?.Arn || "",
      },
      packedPolicySize: result.PackedPolicySize,
    };
  }

  /**
   * Get a session token for MFA-authenticated access.
   */
  async getSessionToken(options?: {
    durationSeconds?: number;
    serialNumber?: string;
    tokenCode?: string;
  }): Promise<AssumedRoleCredentials> {
    const result = await this.client.send(
      new GetSessionTokenCommand({
        DurationSeconds: options?.durationSeconds ?? 43200, // 12 hours default
        SerialNumber: options?.serialNumber,
        TokenCode: options?.tokenCode,
      })
    );

    const creds = result.Credentials;
    if (!creds) {
      throw new Error("Failed to get session token - no credentials returned");
    }

    return this.mapCredentials(creds);
  }

  /**
   * Validate that the current credentials are working.
   * Returns true if credentials are valid, false otherwise.
   */
  async validateCredentials(): Promise<boolean> {
    try {
      await this.getCallerIdentity();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a new STS client with assumed role credentials.
   * Useful for chaining assume role operations.
   */
  async createAssumedRoleClient(
    roleArn: string,
    roleSessionName: string,
    options?: {
      durationSeconds?: number;
      externalId?: string;
      region?: string;
    }
  ): Promise<STSService> {
    const assumeResult = await this.assumeRole(roleArn, roleSessionName, {
      durationSeconds: options?.durationSeconds,
      externalId: options?.externalId,
    });

    return new STSService(options?.region ?? "us-east-1", {
      accessKeyId: assumeResult.credentials.accessKeyId,
      secretAccessKey: assumeResult.credentials.secretAccessKey,
      sessionToken: assumeResult.credentials.sessionToken,
    });
  }

  /**
   * Map AWS SDK Credentials to AssumedRoleCredentials.
   */
  private mapCredentials(creds: Credentials): AssumedRoleCredentials {
    return {
      accessKeyId: creds.AccessKeyId || "",
      secretAccessKey: creds.SecretAccessKey || "",
      sessionToken: creds.SessionToken || "",
      expiration: creds.Expiration || new Date(Date.now() + 3600 * 1000),
    };
  }
}
