import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { A2aApiKeyService } from "./a2a-api-key.service";

@Injectable()
export class A2aApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeyService: A2aApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Extract bearer token from Authorization header
    const authHeader = request.headers["authorization"];
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException(
        "Missing Authorization header. Use: Authorization: Bearer <api-key>",
      );
    }

    const key = authHeader.slice(7); // Remove "Bearer " prefix
    if (!key) {
      throw new UnauthorizedException("Empty API key");
    }

    // Extract botInstanceId from route params
    const botInstanceId = request.params?.botInstanceId;
    if (!botInstanceId) {
      throw new UnauthorizedException("Missing bot instance ID");
    }

    const isValid = await this.apiKeyService.validate(botInstanceId, key);
    if (!isValid) {
      throw new UnauthorizedException("Invalid or expired API key");
    }

    return true;
  }
}
