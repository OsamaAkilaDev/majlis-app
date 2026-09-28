import { Module } from '@nestjs/common';
import { ClubsModule } from '../clubs/clubs.module';
import { AssignmentsService } from './assignments.service';
import { EventLifecycleService } from './event-lifecycle.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { RegistrationsController } from './registrations.controller';
import { RegistrationsService } from './registrations.service';

@Module({
  imports: [ClubsModule],
  controllers: [EventsController, RegistrationsController],
  providers: [EventsService, EventLifecycleService, AssignmentsService, RegistrationsService],
  exports: [EventLifecycleService],
})
export class EventsModule {}
