import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

interface HealthStatus {
  status: 'ok';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Health check.',
  })
  @ApiOkResponse({ description: 'API process started and is responding.' })
  check(): HealthStatus {
    return { status: 'ok' };
  }
}
