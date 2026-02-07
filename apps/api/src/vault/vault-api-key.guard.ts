import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { A2aApiKeyService } from "../a2a/a2a-api-key.service";

/**
 * Guard that validates A2A API keys for vault endpoints.
 * Reuses the same A2aApiKeyService as delegation.
 */
@Injectable()
export class VaultApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: A2aApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    const authHeader = request.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException(
        "Missing Authorization header. Use: Authorization: Bearer <api-key>",
      );
    }

    const key = authHeader.slice(7);
    if (!key) {
      throw new UnauthorizedException("Empty API key");
    }

    const instanceId = request.params?.instanceId;
    if (!instanceId) {
      throw new UnauthorizedException("Missing instance ID");
    }

    const isValid = await this.apiKeyService.validate(instanceId, key);
    if (!isValid) {
      throw new UnauthorizedException("Invalid or expired API key");
    }

    return true;
  }
}
