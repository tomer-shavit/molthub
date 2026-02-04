import {
  ECRClient,
  GetAuthorizationTokenCommand,
  CreateRepositoryCommand,
  DescribeRepositoriesCommand,
  DeleteRepositoryCommand,
  DescribeImagesCommand,
  BatchDeleteImageCommand,
  Repository,
  ImageDetail,
  ImageIdentifier,
} from "@aws-sdk/client-ecr";

export interface ECRCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export interface ECRAuthToken {
  token: string;
  proxyEndpoint: string;
  expiresAt: Date;
  username: string;
  password: string;
}

export interface ECRRepositoryInfo {
  repositoryArn: string;
  repositoryName: string;
  repositoryUri: string;
  registryId: string;
  createdAt: Date;
}

export interface ECRImageInfo {
  registryId: string;
  repositoryName: string;
  imageDigest: string;
  imageTags: string[];
  imageSizeBytes: number;
  pushedAt: Date;
}

export class ECRService {
  private client: ECRClient;

  constructor(region: string = "us-east-1", credentials?: ECRCredentials) {
    this.client = new ECRClient({
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
   * Get an authorization token for ECR.
   * The token is valid for 12 hours and can be used to authenticate
   * with Docker for push/pull operations.
   */
  async getAuthorizationToken(): Promise<ECRAuthToken> {
    const result = await this.client.send(new GetAuthorizationTokenCommand({}));

    const authData = result.authorizationData?.[0];
    if (!authData || !authData.authorizationToken || !authData.proxyEndpoint) {
      throw new Error("Failed to get ECR authorization token");
    }

    // Decode the base64 token (format: username:password)
    const decoded = Buffer.from(authData.authorizationToken, "base64").toString("utf-8");
    const [username, password] = decoded.split(":");

    return {
      token: authData.authorizationToken,
      proxyEndpoint: authData.proxyEndpoint,
      expiresAt: authData.expiresAt || new Date(Date.now() + 12 * 60 * 60 * 1000),
      username,
      password,
    };
  }

  /**
   * Create a new ECR repository.
   */
  async createRepository(
    repositoryName: string,
    options?: {
      imageScanningEnabled?: boolean;
      imageTagMutability?: "MUTABLE" | "IMMUTABLE";
      encryptionType?: "AES256" | "KMS";
      kmsKey?: string;
      tags?: Record<string, string>;
    }
  ): Promise<ECRRepositoryInfo> {
    const tags = options?.tags
      ? Object.entries(options.tags).map(([Key, Value]) => ({ Key, Value }))
      : undefined;

    const result = await this.client.send(
      new CreateRepositoryCommand({
        repositoryName,
        imageScanningConfiguration: {
          scanOnPush: options?.imageScanningEnabled ?? true,
        },
        imageTagMutability: options?.imageTagMutability ?? "MUTABLE",
        encryptionConfiguration: options?.encryptionType
          ? {
              encryptionType: options.encryptionType,
              kmsKey: options.kmsKey,
            }
          : undefined,
        tags,
      })
    );

    const repo = result.repository;
    if (!repo) {
      throw new Error(`Failed to create repository "${repositoryName}"`);
    }

    return this.mapRepositoryToInfo(repo);
  }

  /**
   * Describe ECR repositories.
   */
  async describeRepositories(
    repositoryNames?: string[]
  ): Promise<ECRRepositoryInfo[]> {
    const repos: ECRRepositoryInfo[] = [];
    let nextToken: string | undefined;

    do {
      const result = await this.client.send(
        new DescribeRepositoriesCommand({
          repositoryNames: repositoryNames?.length ? repositoryNames : undefined,
          nextToken,
        })
      );

      for (const repo of result.repositories ?? []) {
        repos.push(this.mapRepositoryToInfo(repo));
      }

      nextToken = result.nextToken;
    } while (nextToken);

    return repos;
  }

  /**
   * Get a specific repository by name.
   */
  async getRepository(repositoryName: string): Promise<ECRRepositoryInfo | undefined> {
    try {
      const repos = await this.describeRepositories([repositoryName]);
      return repos.length > 0 ? repos[0] : undefined;
    } catch (error) {
      if (
        error instanceof Error &&
        error.name === "RepositoryNotFoundException"
      ) {
        return undefined;
      }
      throw error;
    }
  }

  /**
   * Check if a repository exists.
   */
  async repositoryExists(repositoryName: string): Promise<boolean> {
    const repo = await this.getRepository(repositoryName);
    return repo !== undefined;
  }

  /**
   * Delete an ECR repository.
   */
  async deleteRepository(
    repositoryName: string,
    force: boolean = false
  ): Promise<void> {
    await this.client.send(
      new DeleteRepositoryCommand({
        repositoryName,
        force,
      })
    );
  }

  /**
   * Describe images in a repository.
   */
  async describeImages(
    repositoryName: string,
    options?: {
      imageIds?: { imageDigest?: string; imageTag?: string }[];
      maxResults?: number;
    }
  ): Promise<ECRImageInfo[]> {
    const images: ECRImageInfo[] = [];
    let nextToken: string | undefined;

    const imageIds = options?.imageIds?.map((id) => ({
      imageDigest: id.imageDigest,
      imageTag: id.imageTag,
    }));

    do {
      const result = await this.client.send(
        new DescribeImagesCommand({
          repositoryName,
          imageIds: imageIds?.length ? imageIds : undefined,
          maxResults: options?.maxResults,
          nextToken,
        })
      );

      for (const image of result.imageDetails ?? []) {
        images.push(this.mapImageToInfo(image));
      }

      nextToken = result.nextToken;
    } while (nextToken && (!options?.maxResults || images.length < options.maxResults));

    return images;
  }

  /**
   * Delete images from a repository.
   */
  async deleteImages(
    repositoryName: string,
    imageIds: { imageDigest?: string; imageTag?: string }[]
  ): Promise<{ deleted: string[]; failed: string[] }> {
    const ids: ImageIdentifier[] = imageIds.map((id) => ({
      imageDigest: id.imageDigest,
      imageTag: id.imageTag,
    }));

    const result = await this.client.send(
      new BatchDeleteImageCommand({
        repositoryName,
        imageIds: ids,
      })
    );

    return {
      deleted: (result.imageIds ?? []).map(
        (id) => id.imageDigest || id.imageTag || ""
      ),
      failed: (result.failures ?? []).map(
        (f) => `${f.imageId?.imageDigest || f.imageId?.imageTag}: ${f.failureReason}`
      ),
    };
  }

  /**
   * Ensure a repository exists, creating it if necessary.
   */
  async ensureRepository(
    repositoryName: string,
    options?: {
      imageScanningEnabled?: boolean;
      imageTagMutability?: "MUTABLE" | "IMMUTABLE";
      tags?: Record<string, string>;
    }
  ): Promise<ECRRepositoryInfo> {
    const existing = await this.getRepository(repositoryName);
    if (existing) {
      return existing;
    }
    return this.createRepository(repositoryName, options);
  }

  /**
   * Get the full image URI for a repository and tag.
   */
  getImageUri(repositoryUri: string, tag: string = "latest"): string {
    return `${repositoryUri}:${tag}`;
  }

  /**
   * Map AWS SDK Repository to ECRRepositoryInfo.
   */
  private mapRepositoryToInfo(repo: Repository): ECRRepositoryInfo {
    return {
      repositoryArn: repo.repositoryArn || "",
      repositoryName: repo.repositoryName || "",
      repositoryUri: repo.repositoryUri || "",
      registryId: repo.registryId || "",
      createdAt: repo.createdAt || new Date(),
    };
  }

  /**
   * Map AWS SDK ImageDetail to ECRImageInfo.
   */
  private mapImageToInfo(image: ImageDetail): ECRImageInfo {
    return {
      registryId: image.registryId || "",
      repositoryName: image.repositoryName || "",
      imageDigest: image.imageDigest || "",
      imageTags: image.imageTags || [],
      imageSizeBytes: image.imageSizeInBytes || 0,
      pushedAt: image.imagePushedAt || new Date(),
    };
  }
}
