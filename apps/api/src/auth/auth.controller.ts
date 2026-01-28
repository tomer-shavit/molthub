import { Controller, Post, Body, Get, UseGuards, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { AuthService, LoginCredentials, RegisterCredentials } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";

class LoginDto {
  username!: string;
  password!: string;
}

class RegisterDto {
  username!: string;
  password!: string;
  role?: "ADMIN" | "OPERATOR" | "VIEWER";
}

class AuthResponse {
  accessToken!: string;
  expiresIn!: number;
  user!: {
    id: string;
    username: string;
    role: string;
  };
}

@ApiTags("Auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post("login")
  @ApiOperation({ summary: "Login with username and password" })
  @ApiResponse({ status: 200, description: "Login successful", type: AuthResponse })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(@Body() credentials: LoginDto): Promise<AuthResponse> {
    return this.authService.login(credentials);
  }

  @Post("register")
  @ApiOperation({ summary: "Register a new user" })
  @ApiResponse({ status: 201, description: "User created", type: AuthResponse })
  @ApiResponse({ status: 400, description: "Username already exists" })
  async register(@Body() credentials: RegisterDto): Promise<AuthResponse> {
    const result = await this.authService.register(credentials);
    // Auto-login after registration
    return this.authService.login({
      username: credentials.username,
      password: credentials.password,
    });
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user info" })
  @ApiResponse({ status: 200, description: "Current user info" })
  getProfile(@Request() req: { user: { userId: string; username: string; role: string } }) {
    return req.user;
  }
}