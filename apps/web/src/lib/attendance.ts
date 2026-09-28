import type {
  AttendanceList,
  CheckInResult,
  CorrectAttendanceBody,
  ManualCheckInBody,
} from '@majlis/contracts';
import { apiFetch, json } from './api';

export const manualCheckIn = (eventId: string, body: ManualCheckInBody): Promise<CheckInResult> =>
  apiFetch(`/events/${eventId}/check-in/manual`, json(body));

export const listAttendance = (eventId: string): Promise<AttendanceList> =>
  apiFetch(`/events/${eventId}/attendance`);

export const correctAttendance = (
  eventId: string,
  registrationId: string,
  body: CorrectAttendanceBody,
): Promise<void> =>
  apiFetch(`/events/${eventId}/attendance/${registrationId}`, { ...json(body), method: 'PATCH' });
