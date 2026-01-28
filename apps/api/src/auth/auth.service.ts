import { Injectable, UnauthorizedException, BadRequestException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import { prisma, UserRole } from "@molthub/database";

export interface AuthUser {
  id: string;
  username: string;
  role: UserRole;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface RegisterCredentials {
  username: string;
  password: string;
  role?: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async validateUser(username: string, password: string): Promise<AuthUser | null> {
    const user = await prisma.authUser.findUnique({
      where: { username },
    });

    if (!user || !user.isActive) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }

  async login(credentials: LoginCredentials): Promise<AuthTokens & { user: AuthUser }> {
    const user = await this.validateUser(credentials.username, credentials.password);
    
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Update last login
    await prisma.authUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken,
      expiresIn: 24 * 60 * 60, // 24 hours in seconds
      user,
    };
  }

  async register(credentials: RegisterCredentials): Promise<AuthUser> {
    // Check if username is taken
    const existing = await prisma.authUser.findUnique({
      where: { username: credentials.username },
    });

    if (existing) {
      throw new BadRequestException("Username already exists");
    }

    // Hash password
    const passwordHash = await bcrypt.hash(credentials.password, 10);

    // Create user
    const user = await prisma.authUser.create({
      data: {
        username: credentials.username,
        passwordHash,
        role: credentials.role || UserRole.OPERATOR,
        isActive: true,
      },
    });

    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }

  async getUserById(id: string): Promise<AuthUser | null> {
    const user = await prisma.authUser.findUnique({
      where: { id, isActive: true },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  }

  async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.authUser.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException("User not found");
    }

    // Verify old password
    const isValid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!isValid) {
      throw new UnauthorizedException("Current password is incorrect");
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.authUser.update({
      where: { id: userId },
      data: { passwordHash: newPasswordHash },
    });
  }
}