import { Controller, Get } from '@nestjs/common';
import { ENGINE_VERSION } from '@shedit/engine';

@Controller('api/health')
export class HealthController {
  @Get()
  health() {
    return {
      status: 'ok',
      engineVersion: ENGINE_VERSION,
      persistence: process.env.MONGO_URL ? 'on' : 'off',
    };
  }
}
