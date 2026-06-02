export type {
  AttendanceStatus,
  CurrentSessionMemberRole,
  CurrentSessionResponse,
  RsvpStatus,
  SessionParticipationStatus,
} from "@/shared/model/current-session-contracts";
export { CurrentSessionResponseSchema } from "@/shared/model/current-session-contracts";

export type UpdateRsvpRequest = {
  status: RsvpStatus;
};

export type UpdateRsvpResponse = {
  status: RsvpStatus;
};

export type CheckinRequest = {
  readingProgress: number;
};

export type CheckinResponse = CheckinRequest;

export type CreateQuestionRequest = {
  priority: number;
  text: string;
  draftThought?: string | null;
};

export type QuestionResponse = {
  priority: number;
  text: string;
  draftThought: string | null;
};
