import { Module } from '@nestjs/common';
import { EventsModule } from '../events/events.module';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

/** EventsModule imports nothing back, so there is no cycle. */
@Module({
  imports: [EventsModule],
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
