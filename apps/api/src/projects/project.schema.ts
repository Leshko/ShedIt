import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import type { ResolvedShedConfig } from '@shedit/shared';

export type ProjectDocument = HydratedDocument<Project>;

/**
 * Every `@Prop` declares its type explicitly rather than relying on emitted
 * decorator metadata, so the schema builds under any transpiler.
 */
@Schema({ timestamps: true, collection: 'projects' })
export class Project {
  @Prop({ required: true, trim: true, type: String })
  name: string;

  /** The input document. The plan is always recomputed, never trusted from storage. */
  @Prop({ required: true, type: Object })
  config: ResolvedShedConfig;

  /** Stamped so a change to the engine's maths is a visible migration, not silent drift. */
  @Prop({ required: true, type: String })
  engineVersion: string;

  @Prop({ required: true, unique: true, index: true, type: String })
  shareSlug: string;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
