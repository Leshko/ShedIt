import { Body, Controller, Post, UsePipes } from '@nestjs/common';
import { computePlan } from '@shedit/engine';
import { shedConfigSchema, type PlanResult, type ResolvedShedConfig } from '@shedit/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';

@Controller('api/plans')
export class PlansController {
  /**
   * Stateless: config in, full plan out. This is what the configurator calls on
   * every edit, so it stays free of any database work.
   */
  @Post('compute')
  @UsePipes(new ZodValidationPipe(shedConfigSchema))
  compute(@Body() config: ResolvedShedConfig): PlanResult {
    return computePlan(config);
  }
}
