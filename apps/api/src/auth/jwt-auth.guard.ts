import { Injectable, ExecutionContext } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  canActivate(context: ExecutionContext) {
    // AUTH DISABLED: Allow all requests and inject a mock user
    const request = context.switchToHttp().getRequest();
    if (!request.user) {
      request.user = {
        userId: "00000000-0000-0000-0000-000000000000",
        username: "dev",
        role: "OWNER",
      };
    }
    return true;
  }
}
