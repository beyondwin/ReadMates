import type {
  AttendanceStatus,
  CreateInvitationRequest,
  CurrentSessionPolicy,
  CurrentSessionPolicyResult,
  FeedbackDocumentStatus,
  InvitationStatus,
  MemberRole,
  MembershipStatus,
  RsvpStatus,
  SessionParticipationStatus,
  SessionState,
} from "@/shared/api/readmates";

export type HostInvitationListItem = {
  invitationId: string;
  email: string;
  name: string;
  role: MemberRole;
  status: InvitationStatus;
  effectiveStatus: InvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
  applyToCurrentSession: boolean;
  canRevoke: boolean;
  canReissue: boolean;
};

export type HostInvitationResponse = HostInvitationListItem & {
  acceptUrl: string | null;
};

export type CreateHostInvitationRequest = CreateInvitationRequest & {
  applyToCurrentSession?: boolean;
};

export type ViewerMember = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  shortName: string;
  profileImageUrl: string | null;
  status: MembershipStatus;
  createdAt: string;
};

export type HostMemberListItem = {
  membershipId: string;
  userId: string;
  email: string;
  displayName: string;
  shortName: string;
  profileImageUrl: string | null;
  role: MemberRole;
  status: MembershipStatus;
  joinedAt: string | null;
  createdAt: string;
  currentSessionParticipationStatus: SessionParticipationStatus | null;
  canSuspend: boolean;
  canRestore: boolean;
  canDeactivate: boolean;
  canAddToCurrentSession: boolean;
  canRemoveFromCurrentSession: boolean;
};

export type MemberLifecycleRequest = {
  currentSessionPolicy: CurrentSessionPolicy;
};

export type MemberLifecycleResponse = {
  member: HostMemberListItem;
  currentSessionPolicyResult: CurrentSessionPolicyResult;
};

export type HostDashboardResponse = {
  rsvpPending: number;
  checkinMissing: number;
  publishPending: number;
  feedbackPending: number;
  currentSessionMissingMemberCount?: number;
  currentSessionMissingMembers?: Array<{
    membershipId: string;
    displayName: string;
    email: string;
  }>;
};

export type HostSessionPublication = {
  publicSummary: string;
  isPublic: boolean;
};

export type HostSessionPublicationRequest = {
  publicSummary: string;
  isPublic: boolean;
};

export type HostSessionDetailResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string | null;
  bookImageUrl: string | null;
  locationLabel: string;
  meetingUrl: string | null;
  meetingPasscode: string | null;
  date: string;
  startTime: string;
  endTime: string;
  questionDeadlineAt: string;
  publication: HostSessionPublication | null;
  state: SessionState;
  attendees: Array<{
    membershipId: string;
    displayName: string;
    shortName: string;
    rsvpStatus: RsvpStatus;
    attendanceStatus: AttendanceStatus;
    participationStatus?: SessionParticipationStatus;
  }>;
  feedbackDocument: FeedbackDocumentStatus;
};

export type HostSessionDeletionCounts = {
  participants: number;
  rsvpResponses: number;
  questions: number;
  checkins: number;
  oneLineReviews: number;
  longReviews: number;
  highlights: number;
  publications: number;
  feedbackReports: number;
  feedbackDocuments: number;
};

export type HostSessionDeletionPreviewResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  state: SessionState;
  canDelete: boolean;
  counts: HostSessionDeletionCounts;
};

export type HostSessionDeletionResponse = {
  sessionId: string;
  sessionNumber: number;
  deleted: true;
  counts: HostSessionDeletionCounts;
};

export type HostSessionRequest = {
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink?: string | null;
  bookImageUrl?: string | null;
  locationLabel?: string | null;
  meetingUrl?: string | null;
  meetingPasscode?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  questionDeadlineAt?: string | null;
};

export type CreatedSessionResponse = {
  sessionId: string;
  sessionNumber: number;
  title: string;
  bookTitle: string;
  bookAuthor: string;
  bookLink: string | null;
  bookImageUrl: string | null;
  locationLabel: string;
  meetingUrl: string | null;
  meetingPasscode: string | null;
  date: string;
  startTime: string;
  endTime: string;
  questionDeadlineAt: string;
  state: SessionState;
};

export type HostAttendanceUpdate = {
  membershipId: string;
  attendanceStatus: AttendanceStatus;
};
