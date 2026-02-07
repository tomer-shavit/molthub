import { Controller, Get, Param } from "@nestjs/common";
import { MiddlewareRegistryService } from "./middleware-registry.service";

@Controller("middlewares")
export class MiddlewareRegistryController {
  constructor(private readonly registryService: MiddlewareRegistryService) {}

  @Get()
  findAll() {
    return this.registryService.findAll();
  }

  @Get(":id")
  findById(@Param("id") id: string) {
    return this.registryService.findById(decodeURIComponent(id));
  }
}
