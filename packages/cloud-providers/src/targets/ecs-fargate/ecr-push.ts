import {
  ECRClient,
  CreateRepositoryCommand,
  GetAuthorizationTokenCommand,
  DescribeRepositoriesCommand,
} from "@aws-sdk/client-ecr";
import { execFile } from "child_process";

export interface EcrPushOptions {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  repositoryName?: string;
  sourceImage?: string;
  tag?: string;
}

export interface EcrPushResult {
  imageUri: string;
  repositoryUri: string;
}

function execCommand(
  cmd: string,
  args: string[],
  options?: { input?: string },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Command "${cmd} ${args.join(" ")}" failed: ${stderr || error.message}`,
          ),
        );
        return;
      }
      resolve(stdout.trim());
    });

    if (options?.input && child.stdin) {
      child.stdin.write(options.input);
      child.stdin.end();
    }
  });
}

export async function pushImageToEcr(
  options: EcrPushOptions,
): Promise<EcrPushResult> {
  const repositoryName = options.repositoryName ?? "molthub-openclaw";
  const sourceImage = options.sourceImage ?? "openclaw:local";
  const tag = options.tag ?? "latest";

  const ecrClient = new ECRClient({
    region: options.region,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });

  // Step 1: Check if repository exists, create if not
  let repositoryUri: string;

  try {
    const describeResponse = await ecrClient.send(
      new DescribeRepositoriesCommand({
        repositoryNames: [repositoryName],
      }),
    );
    const repo = describeResponse.repositories?.[0];
    if (!repo?.repositoryUri) {
      throw new Error(`ECR repository "${repositoryName}" found but has no URI`);
    }
    repositoryUri = repo.repositoryUri;
  } catch (error: unknown) {
    if (
      error instanceof Error &&
      error.name === "RepositoryNotFoundException"
    ) {
      const createResponse = await ecrClient.send(
        new CreateRepositoryCommand({
          repositoryName,
          imageScanningConfiguration: { scanOnPush: true },
          imageTagMutability: "MUTABLE",
        }),
      );
      if (!createResponse.repository?.repositoryUri) {
        throw new Error(`Failed to create ECR repository "${repositoryName}"`);
      }
      repositoryUri = createResponse.repository.repositoryUri;
    } else {
      throw error;
    }
  }

  // Step 2: Get ECR authorization token
  const authResponse = await ecrClient.send(
    new GetAuthorizationTokenCommand({}),
  );
  const authData = authResponse.authorizationData?.[0];
  if (!authData?.authorizationToken || !authData.proxyEndpoint) {
    throw new Error("Failed to get ECR authorization token");
  }
  const decodedToken = Buffer.from(
    authData.authorizationToken,
    "base64",
  ).toString("utf-8");
  const [, password] = decodedToken.split(":");
  const registryUrl = authData.proxyEndpoint;

  // Step 3: Docker login
  await execCommand(
    "docker",
    ["login", "--username", "AWS", "--password-stdin", registryUrl],
    { input: password },
  );

  // Step 4: Tag the source image
  const fullImageUri = `${repositoryUri}:${tag}`;
  await execCommand("docker", ["tag", sourceImage, fullImageUri]);

  // Step 5: Push to ECR
  await execCommand("docker", ["push", fullImageUri]);

  return {
    imageUri: fullImageUri,
    repositoryUri,
  };
}
