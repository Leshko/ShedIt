import { All, Controller, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Stands in for the real projects controller when no database is configured,
 * so callers get an explanation instead of a 404 that looks like a bug.
 */
@Controller('api/projects')
export class PersistenceDisabledController {
  @All()
  root(): never {
    return this.disabled();
  }

  @All('*splat')
  nested(): never {
    return this.disabled();
  }

  private disabled(): never {
    throw new HttpException(
      {
        error: 'PERSISTENCE_DISABLED',
        message:
          'Saving projects needs MongoDB. Start one with `docker compose up -d mongo` and set ' +
          'MONGO_URL, then restart the API. Planning, drawings and exports work without it.',
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
