import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { ConfigService } from "@nestjs/config";
import { AuthService } from "./auth.service";

interface JwtPayload {
  sub: string;
  username: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>("JWT_SECRET") || "change-me-in-production",
    });
  }

  async validate(payload: JwtPayload): Promise<{ userId: string; username: string; role: string }> {
    const user = await this.authService.getUserById(payload.sub);
    
    if (!user) {
      throw new UnauthorizedException();
    }

    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}