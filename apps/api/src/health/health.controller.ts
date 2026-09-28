import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { TransactionHost } from '../prisma/transaction.host';

@ApiTags('ops')
@Controller('health')
export class HealthController {
  constructor(private readonly host: TransactionHost) {}

  @Public()
  @Get()
  @ApiOkResponse({ description: 'Service and database are reachable.' })
  async check(): Promise<{ status: 'ok'; database: 'up'; uptimeSeconds: number }> {
    await this.host.tx.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'up', uptimeSeconds: Math.round(process.uptime()) };
  }
}
