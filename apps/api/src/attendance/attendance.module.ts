import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { EventsModule } from '../events/events.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

/** Neither EventsModule nor CertificatesModule imports attendance back, so there is no cycle. */
@Module({
  imports: [EventsModule, CertificatesModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
})
export class AttendanceModule {}
