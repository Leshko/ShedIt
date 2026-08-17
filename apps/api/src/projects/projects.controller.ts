import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common';
import { computePlan } from '@shedit/engine';
import { shedConfigSchema, type ResolvedShedConfig } from '@shedit/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ProjectsService } from './projects.service';
import type { ProjectDocument } from './project.schema';

@Controller('api/projects')
export class ProjectsController {
  constructor(@Inject(ProjectsService) private readonly projects: ProjectsService) {}

  @Get()
  async list() {
    const all = await this.projects.findAll();
    return all.map(summarise);
  }

  @Post()
  @UsePipes(new ZodValidationPipe(shedConfigSchema))
  async create(@Body() config: ResolvedShedConfig) {
    return summarise(await this.projects.create(config));
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const project = await this.projects.findOne(id);
    // The plan is always recomputed from the stored config so an engine
    // improvement reaches saved projects without a migration.
    return { ...summarise(project), config: project.config, plan: computePlan(project.config) };
  }

  @Get('shared/:slug')
  async getShared(@Param('slug') slug: string) {
    const project = await this.projects.findBySlug(slug);
    return { ...summarise(project), config: project.config, plan: computePlan(project.config) };
  }

  @Put(':id')
  @UsePipes(new ZodValidationPipe(shedConfigSchema))
  async update(@Param('id') id: string, @Body() config: ResolvedShedConfig) {
    return summarise(await this.projects.update(id, config));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.projects.remove(id);
    return { deleted: true };
  }
}

function summarise(project: ProjectDocument) {
  return {
    id: String(project._id),
    name: project.name,
    shareSlug: project.shareSlug,
    engineVersion: project.engineVersion,
    updatedAt: (project as unknown as { updatedAt?: Date }).updatedAt,
  };
}
