import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Request,
  Inject,
  BadRequestException,
} from "@nestjs/common";
import {
  WORKSPACE_REPOSITORY,
  IWorkspaceRepository,
} from "@clawster/database";
import { CredentialVaultService } from "./credential-vault.service";
import { SaveCredentialDto, ListSavedCredentialsQueryDto } from "./credential-vault.dto";

@Controller("credential-vault")
export class CredentialVaultController {
  constructor(
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaceRepo: IWorkspaceRepository,
    private readonly vaultService: CredentialVaultService,
  ) {}

  private getUserId(req: any): string {
    return req.user?.sub || req.user?.id || "anonymous";
  }

  private async resolveWorkspaceId(): Promise<string> {
    const result = await this.workspaceRepo.findManyWorkspaces({}, { page: 1, limit: 1 });
    const workspace = result.data[0];
    if (!workspace) {
      throw new BadRequestException("No workspace found. Complete onboarding first.");
    }
    return workspace.id;
  }

  @Post()
  async save(@Body() dto: SaveCredentialDto, @Request() req: any) {
    const userId = this.getUserId(req);
    const workspaceId = await this.resolveWorkspaceId();
    dto.workspaceId = workspaceId;
    return this.vaultService.save(dto, userId);
  }

  @Get()
  async list(@Query() query: ListSavedCredentialsQueryDto) {
    const workspaceId = await this.resolveWorkspaceId();
    query.workspaceId = workspaceId;
    return this.vaultService.listSaved(query);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string) {
    const workspaceId = await this.resolveWorkspaceId();
    await this.vaultService.delete(id, workspaceId);
  }
}
