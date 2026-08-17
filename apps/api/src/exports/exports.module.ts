import { Module } from '@nestjs/common';
import { ExportsController } from './exports.controller';
import { PdfService } from './pdf.service';

@Module({
  controllers: [ExportsController],
  providers: [PdfService],
  exports: [PdfService],
})
export class ExportsModule {}
