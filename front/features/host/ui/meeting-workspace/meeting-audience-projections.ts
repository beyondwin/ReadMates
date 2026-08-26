import type { MeetingAudienceProjection } from "./meeting-focus-facts";

export function buildMeetingAudienceProjections(input: {
  visibility: string;
  lifecycle: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
}): readonly MeetingAudienceProjection[] {
  const guestMember = input.visibility === "HOST_ONLY"
    ? "호스트만 확인"
    : input.lifecycle === "PUBLISHED"
      ? "게스트·멤버 노트에서 읽음"
      : "허용된 아카이브에서 읽음";
  const publicPlacement = input.visibility === "PUBLIC" && input.lifecycle === "PUBLISHED"
    ? "공개 기록에 게시"
    : "공개 기록에 게시 안 됨";
  return [
    { audience: "호스트", result: "운영 기록과 초안 계속 편집" },
    { audience: "게스트·멤버", result: guestMember },
    { audience: "공개 기록", result: publicPlacement },
  ];
}
