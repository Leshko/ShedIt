import { Module } from '@nestjs/common';
import { PlansModule } from './plans/plans.module';
import { ExportsModule } from './exports/exports.module';
import { ProjectsModule } from './projects/projects.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [PlansModule, ExportsModule, ProjectsModule.register(process.env.MONGO_URL)],
  controllers: [HealthController],
})
export class AppModule {}
