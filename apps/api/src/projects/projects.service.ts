import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ENGINE_VERSION } from '@shedit/engine';
import type { ResolvedShedConfig } from '@shedit/shared';
import { Project, type ProjectDocument } from './project.schema';

@Injectable()
export class ProjectsService {
  constructor(@InjectModel(Project.name) private readonly model: Model<ProjectDocument>) {}

  async create(config: ResolvedShedConfig): Promise<ProjectDocument> {
    return this.model.create({
      name: config.name,
      config,
      engineVersion: ENGINE_VERSION,
      shareSlug: makeSlug(config.name),
    });
  }

  async findAll(): Promise<ProjectDocument[]> {
    return this.model.find().sort({ updatedAt: -1 }).limit(100).exec();
  }

  async findOne(id: string): Promise<ProjectDocument> {
    const found = await this.model.findById(id).exec();
    if (!found) throw new NotFoundException(`No project with id ${id}`);
    return found;
  }

  async findBySlug(slug: string): Promise<ProjectDocument> {
    const found = await this.model.findOne({ shareSlug: slug }).exec();
    if (!found) throw new NotFoundException(`No project shared at ${slug}`);
    return found;
  }

  async update(id: string, config: ResolvedShedConfig): Promise<ProjectDocument> {
    const updated = await this.model
      .findByIdAndUpdate(
        id,
        { name: config.name, config, engineVersion: ENGINE_VERSION },
        { new: true },
      )
      .exec();
    if (!updated) throw new NotFoundException(`No project with id ${id}`);
    return updated;
  }

  async remove(id: string): Promise<void> {
    const result = await this.model.findByIdAndDelete(id).exec();
    if (!result) throw new NotFoundException(`No project with id ${id}`);
  }
}

function makeSlug(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'shed';
  // Derived from the name plus a short random suffix so share links are stable
  // per project but not guessable from the name alone.
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base}-${suffix}`;
}
