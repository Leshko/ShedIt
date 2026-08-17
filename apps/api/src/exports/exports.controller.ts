import { Body, Controller, Header, Inject, Post, Res, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { computePlan, toCsv } from '@shedit/engine';
import { shedConfigSchema, type ResolvedShedConfig } from '@shedit/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PdfService } from './pdf.service';

@Controller('api/exports')
export class ExportsController {
  // Injected by explicit token rather than reflected parameter type, so DI
  // does not depend on the transpiler emitting decorator metadata.
  constructor(@Inject(PdfService) private readonly pdf: PdfService) {}

  @Post('pdf')
  @UsePipes(new ZodValidationPipe(shedConfigSchema))
  async exportPdf(@Body() config: ResolvedShedConfig, @Res() res: Response): Promise<void> {
    const plan = computePlan(config);
    const buffer = await this.pdf.render(config, plan);
    res
      .status(200)
      .set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${slug(config.name)}-plans.pdf"`,
        'Content-Length': String(buffer.length),
      })
      .end(buffer);
  }

  @Post('csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @UsePipes(new ZodValidationPipe(shedConfigSchema))
  exportCsv(@Body() config: ResolvedShedConfig, @Res() res: Response): void {
    const csv = toCsv(computePlan(config));
    res
      .status(200)
      .set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug(config.name)}-cutlist.csv"`,
      })
      .end(csv);
  }

  @Post('json')
  @UsePipes(new ZodValidationPipe(shedConfigSchema))
  exportJson(@Body() config: ResolvedShedConfig, @Res() res: Response): void {
    const plan = computePlan(config);
    // Round-trippable: the config comes back in exactly the shape it went out.
    const body = JSON.stringify({ engineVersion: plan.engineVersion, config, plan }, null, 2);
    res
      .status(200)
      .set({
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${slug(config.name)}.json"`,
      })
      .end(body);
  }
}

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'shed'
  );
}
