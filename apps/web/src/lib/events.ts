import type {
  AssignResponsibilityBody,
  Assignment,
  AssignmentList,
  CancelEventBody,
  CreateEventBody,
  EventDetail,
  EventListQuery,
  EventList,
  MyRegistrationListQuery,
  MyRegistrationList,
  NewEventUpload,
  PatchEventBody,
  PublishEventBody,
  RegisterBody,
  Registration,
  RegistrationListQuery,
  RegistrationList,
  RemoveAssignmentBody,
  SignedUpload,
} from '@majlis/contracts';
import { apiFetch, json, qs } from './api';

// -- Uploads and event creation --------------------------------------------

/** Club-scoped: an unscoped route resolves no club role for a Lead. */
export const mintEventPosterUpload = (clubId: string): Promise<NewEventUpload> =>
  apiFetch(`/clubs/${clubId}/uploads/event-poster`, { method: 'POST' });

export const mintEventPosterEditUpload = (eventId: string): Promise<SignedUpload> =>
  apiFetch(`/events/${eventId}/poster-upload-url`, { method: 'POST' });

export const createEvent = (clubId: string, body: CreateEventBody): Promise<EventDetail> =>
  apiFetch(`/clubs/${clubId}/events`, json(body));

// -- Events -----------------------------------------------------------------

export const listEvents = (query: EventListQuery): Promise<EventList> =>
  apiFetch(
    `/events${qs({
      clubId: query.clubId,
      status: query.status,
      upcoming: query.upcoming,
      fromMyClubs: query.fromMyClubs,
      direction: query.direction,
    })}`,
  );

export const getEvent = (eventId: string): Promise<EventDetail> => apiFetch(`/events/${eventId}`);

export const updateEvent = (eventId: string, body: PatchEventBody): Promise<EventDetail> =>
  apiFetch(`/events/${eventId}`, { ...json(body), method: 'PATCH' });

export const publishEvent = (eventId: string, body: PublishEventBody = {}): Promise<EventDetail> =>
  apiFetch(`/events/${eventId}/publish`, json(body));

export const cancelEvent = (eventId: string, body: CancelEventBody): Promise<EventDetail> =>
  apiFetch(`/events/${eventId}/cancel`, json(body));

// -- Assignments ------------------------------------------------------------

export const listAssignments = (eventId: string): Promise<AssignmentList> =>
  apiFetch(`/events/${eventId}/assignments`);

export const assignResponsibility = (
  eventId: string,
  body: AssignResponsibilityBody,
): Promise<Assignment> => apiFetch(`/events/${eventId}/assignments`, json(body));

/** Nested under the event: a permission scoped to one event cannot authorize a bare row id. */
export const removeAssignment = (
  eventId: string,
  assignmentId: string,
  body: RemoveAssignmentBody = {},
): Promise<void> =>
  apiFetch(`/events/${eventId}/assignments/${assignmentId}`, { ...json(body), method: 'DELETE' });

// -- Registrations ----------------------------------------------------------

/** An ordinary student sends `{}`; `userId` plus a reason is the Admin override. */
export const register = (eventId: string, body: RegisterBody = {}): Promise<Registration> =>
  apiFetch(`/events/${eventId}/registrations`, json(body));

export const cancelRegistration = (eventId: string): Promise<void> =>
  apiFetch(`/events/${eventId}/registrations/me`, { method: 'DELETE' });

export const listRoster = (eventId: string, query: RegistrationListQuery = {}): Promise<RegistrationList> =>
  apiFetch(`/events/${eventId}/registrations${qs({ status: query.status })}`);

export const myRegistrations = (query: MyRegistrationListQuery): Promise<MyRegistrationList> =>
  apiFetch(`/me/registrations${qs({ past: query.past })}`);
