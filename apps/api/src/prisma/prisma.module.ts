import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { TransactionHost } from './transaction.host';

@Global()
@Module({
  providers: [PrismaService, TransactionHost],
  exports: [TransactionHost],
})
export class PrismaModule {}
