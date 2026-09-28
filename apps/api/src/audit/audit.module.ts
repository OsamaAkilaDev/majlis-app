import { Global, Module } from '@nestjs/common';
import { AuditController } from './audit.controller';
import { AuditReadService } from './audit-read.service';
import { AuditService } from './audit.service';

// AuditReadService is deliberately not exported; only the writer is.
@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, AuditReadService],
  exports: [AuditService],
})
export class AuditModule {}
