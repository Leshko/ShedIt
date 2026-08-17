import { Module, type DynamicModule } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';
import { Project, ProjectSchema } from './project.schema';
import { PersistenceDisabledController } from './persistence-disabled.controller';

/**
 * Persistence is optional. With MONGO_URL unset the API still serves every
 * compute and export route and the project endpoints answer 503 with a clear
 * reason, so the planner is fully usable without a database.
 */
@Module({})
export class ProjectsModule {
  static register(mongoUrl: string | undefined): DynamicModule {
    if (!mongoUrl) {
      return {
        module: ProjectsModule,
        controllers: [PersistenceDisabledController],
      };
    }

    return {
      module: ProjectsModule,
      imports: [
        MongooseModule.forRoot(mongoUrl, { serverSelectionTimeoutMS: 5000 }),
        MongooseModule.forFeature([{ name: Project.name, schema: ProjectSchema }]),
      ],
      controllers: [ProjectsController],
      providers: [ProjectsService],
    };
  }
}
