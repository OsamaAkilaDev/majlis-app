import type {
  AddMemberBody,
  Appointment,
  AppointmentList,
  AppointLeadBody,
  ClubDetail,
  ClubListQuery,
  ClubList,
  CreateClubBody,
  CreateDepartmentBody,
  DecideMembershipBody,
  Department,
  DepartmentList,
  EndAppointmentBody,
  ImageKind,
  InvitationList,
  InviteTeamMemberBody,
  Member,
  MemberListQuery,
  MemberList,
  MyClubList,
  NewClubUpload,
  PatchClubBody,
  PatchClubStatusBody,
  PatchDepartmentBody,
  PatchUserBody,
  PatchUserStatusBody,
  RemoveMemberBody,
  SignedUpload,
  UserList,
  UserListQuery,
  UserProfile,
  UserSearchResult,
} from '@majlis/contracts';
import { apiFetch, json, qs } from './api';

// -- Uploads and club creation/editing --------------------------------------

export const mintClubLogoUpload = (): Promise<NewClubUpload> =>
  apiFetch('/uploads/club-logo', { method: 'POST' });

export const mintClubEditUpload = (clubId: string, kind: ImageKind): Promise<SignedUpload> =>
  apiFetch(`/clubs/${clubId}/${kind === 'club-logo' ? 'logo-upload-url' : 'banner-upload-url'}`, {
    method: 'POST',
  });

export const createClub = (body: CreateClubBody): Promise<ClubDetail> => apiFetch('/clubs', json(body));

export const updateClub = (clubId: string, body: PatchClubBody): Promise<ClubDetail> =>
  apiFetch(`/clubs/${clubId}`, { ...json(body), method: 'PATCH' });

export const updateClubStatus = (clubId: string, body: PatchClubStatusBody): Promise<ClubDetail> =>
  apiFetch(`/clubs/${clubId}/status`, { ...json(body), method: 'PATCH' });

export const listClubs = (query: ClubListQuery): Promise<ClubList> =>
  apiFetch(
    `/clubs${qs({
      status: query.status,
      joinable: query.joinable,
    })}`,
  );

export const getClub = (clubId: string): Promise<ClubDetail> => apiFetch(`/clubs/${clubId}`);

export const getClubBySlug = (slug: string): Promise<ClubDetail> =>
  apiFetch(`/clubs/by-slug/${encodeURIComponent(slug)}`);

// -- Team ---------------------------------------------------------------

export const appointLead = (clubId: string, body: AppointLeadBody): Promise<Appointment> =>
  apiFetch(`/clubs/${clubId}/lead`, json(body));

export const listTeam = (clubId: string): Promise<AppointmentList> =>
  apiFetch(`/clubs/${clubId}/team`);

export const inviteTeamMember = (clubId: string, body: InviteTeamMemberBody): Promise<Appointment> =>
  apiFetch(`/clubs/${clubId}/team`, json(body));

export const endAppointment = (
  clubId: string,
  appointmentId: string,
  body: EndAppointmentBody,
): Promise<void> => apiFetch(`/clubs/${clubId}/team/${appointmentId}`, { ...json(body), method: 'DELETE' });

export const myInvitations = (): Promise<InvitationList> => apiFetch('/me/invitations');

export const acceptInvitation = (appointmentId: string): Promise<Appointment> =>
  apiFetch(`/appointments/${appointmentId}/accept`, { method: 'POST' });

export const declineInvitation = (appointmentId: string): Promise<Appointment> =>
  apiFetch(`/appointments/${appointmentId}/decline`, { method: 'POST' });

// -- Membership -----------------------------------------------------------

export const listMembers = (clubId: string, query: MemberListQuery): Promise<MemberList> =>
  apiFetch(`/clubs/${clubId}/members${qs({ status: query.status })}`);

export const addMember = (clubId: string, body: AddMemberBody): Promise<Member> =>
  apiFetch(`/clubs/${clubId}/members`, json(body));

export const requestMembership = (clubId: string): Promise<Member> =>
  apiFetch(`/clubs/${clubId}/membership-requests`, { method: 'POST' });

export const decideMembership = (
  clubId: string,
  requestId: string,
  body: DecideMembershipBody,
): Promise<Member> => apiFetch(`/clubs/${clubId}/membership-requests/${requestId}`, { ...json(body), method: 'PATCH' });

export const leaveClub = (clubId: string): Promise<void> =>
  apiFetch(`/clubs/${clubId}/membership`, { method: 'DELETE' });

export const removeMember = (
  clubId: string,
  userId: string,
  body: RemoveMemberBody = {},
): Promise<void> =>
  apiFetch(`/clubs/${clubId}/members/${userId}`, { ...json(body), method: 'DELETE' });

export const myClubs = (): Promise<MyClubList> => apiFetch('/me/clubs');

// -- Departments ------------------------------------------------------------

export const listDepartments = (): Promise<DepartmentList> => apiFetch('/departments');

export const createDepartment = (body: CreateDepartmentBody): Promise<Department> =>
  apiFetch('/departments', json(body));

export const updateDepartment = (id: string, body: PatchDepartmentBody): Promise<Department> =>
  apiFetch(`/departments/${id}`, { ...json(body), method: 'PATCH' });

export const removeDepartment = (id: string): Promise<void> =>
  apiFetch(`/departments/${id}`, { method: 'DELETE' });

// -- Users (search, for Lead appointment and team invitations) --------------

export const listUsers = (query: UserListQuery): Promise<UserList> =>
  apiFetch(`/users${qs({ q: query.q })}`);

export const updateUser = (userId: string, body: PatchUserBody): Promise<UserProfile> =>
  apiFetch(`/users/${userId}`, { ...json(body), method: 'PATCH' });

export const updateUserStatus = (
  userId: string,
  body: PatchUserStatusBody,
): Promise<UserProfile> => apiFetch(`/users/${userId}/status`, { ...json(body), method: 'PATCH' });

/** Club-scoped, since `GET /users` is Admin only. Returns name and email only. */
export const searchClubUsers = (clubId: string, q: string): Promise<UserSearchResult> =>
  apiFetch(`/clubs/${clubId}/user-search${qs({ q })}`);
