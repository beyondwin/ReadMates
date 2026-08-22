import { describe, expect, it } from "vitest";
import type { SessionState } from "./readmates-types";
import {
  formatMeetingLifecycle,
  formatMeetingOrdinal,
  formatMeetingProjection,
  formatPublicationAction,
  MEETING_APPLY_LABEL,
  MEETING_ATTENDANCE_LABEL,
  MEETING_NOUN,
  MEETING_RESPONSE_LABEL,
  type AccessScope,
  type MeetingAudience,
  type SiteVisibility,
} from "./meeting-language";

const loginSessionFixture = "로그인 세션 만료";

describe("canonical meeting language", () => {
  it("uses 모임 as the user-facing noun", () => {
    expect(MEETING_NOUN).toBe("모임");
  });

  it("formats folio and sentence ordinals without padding", () => {
    expect(formatMeetingOrdinal(7, "folio")).toBe("No.7");
    expect(formatMeetingOrdinal(7, "sentence")).toBe("7번째 모임");
    expect(formatMeetingOrdinal(1, "folio")).toBe("No.1");
    expect(formatMeetingOrdinal(12, "sentence")).toBe("12번째 모임");
  });

  it("labels host and member/guest lifecycle independently of public placement", () => {
    expect(formatMeetingLifecycle("DRAFT", "host")).toBe("모임 작성 중");
    expect(formatMeetingLifecycle("OPEN", "host")).toBe("멤버와 준비 중");
    expect(formatMeetingLifecycle("CLOSED", "host")).toBe("기록 정리 중");
    expect(formatMeetingLifecycle("PUBLISHED", "host")).toBe("게스트·멤버 노트 게시 완료");

    expect(formatMeetingLifecycle("DRAFT", "member")).toBe("예정 모임");
    expect(formatMeetingLifecycle("OPEN", "member")).toBe("이번 모임");
    expect(formatMeetingLifecycle("CLOSED", "member")).toBe("지난 모임 기록");
    expect(formatMeetingLifecycle("PUBLISHED", "member")).toBe("지난 모임 기록");

    expect(formatMeetingLifecycle("DRAFT", "guest")).toBe("예정 모임");
    expect(formatMeetingLifecycle("OPEN", "guest")).toBe("이번 모임");
    expect(formatMeetingLifecycle("CLOSED", "guest")).toBe("지난 모임 기록");
    expect(formatMeetingLifecycle("PUBLISHED", "guest")).toBe("지난 모임 기록");

    expect(formatMeetingLifecycle("PUBLISHED", "public")).toBe("공개 기록");
  });

  it("keeps 참석 응답, 실제 출석, and 기록에 반영 as canonical action nouns", () => {
    expect(MEETING_RESPONSE_LABEL).toBe("참석 응답");
    expect(MEETING_ATTENDANCE_LABEL).toBe("실제 출석");
    expect(MEETING_APPLY_LABEL).toBe("기록에 반영");
  });

  it("names publication actions by audience and destination", () => {
    expect(formatPublicationAction("publishMemberNotes")).toBe("게스트·멤버 노트에 기록 게시");
    expect(formatPublicationAction("removeMemberNotes")).toBe("게스트·멤버 노트에서 기록 내리기");
    expect(formatPublicationAction("publishPublicRecord")).toBe("공개 기록에 게시");
    expect(formatPublicationAction("removePublicRecord")).toBe("공개 기록에서 내리기");
  });

  it("does not collapse public visibility into lifecycle or access scope", () => {
    const publishedHidden = {
      state: "PUBLISHED" as SessionState,
      accessScope: "GUEST_READABLE" as AccessScope,
      siteVisibility: "HIDDEN" as SiteVisibility,
    };
    const publishedPublic = {
      ...publishedHidden,
      siteVisibility: "PUBLIC_RECORD" as SiteVisibility,
    };
    const closedPublic = {
      state: "CLOSED" as SessionState,
      accessScope: "GUEST_READABLE" as AccessScope,
      siteVisibility: "PUBLIC_RECORD" as SiteVisibility,
    };
    const draftPublic = {
      state: "DRAFT" as SessionState,
      accessScope: "HOST_ONLY" as AccessScope,
      siteVisibility: "PUBLIC_RECORD" as SiteVisibility,
    };

    expect(formatMeetingProjection(publishedHidden, "publicRecord")).toBe("공개 기록에 게시 안 함");
    expect(formatMeetingProjection(publishedPublic, "publicRecord")).toBe("공개 기록에 게시");
    expect(formatMeetingProjection(closedPublic, "publicRecord")).toBe("notes·공개 사이트에는 게시 안 됨");
    expect(formatMeetingProjection(draftPublic, "publicRecord")).toBe("게시 불가");
    expect(formatMeetingProjection(publishedPublic, "publicRecord")).not.toBe(
      formatMeetingProjection(publishedHidden, "publicRecord"),
    );
    expect(formatMeetingProjection(closedPublic, "publicRecord")).not.toBe(
      formatMeetingProjection(publishedPublic, "publicRecord"),
    );
  });

  it("projects host and member/guest surfaces from independent axes", () => {
    const hostOnlyDraft = {
      state: "DRAFT" as SessionState,
      accessScope: "HOST_ONLY" as AccessScope,
      siteVisibility: "HIDDEN" as SiteVisibility,
    };
    const guestDraft = {
      ...hostOnlyDraft,
      accessScope: "GUEST_READABLE" as AccessScope,
    };
    const guestOpen = {
      state: "OPEN" as SessionState,
      accessScope: "GUEST_READABLE" as AccessScope,
      siteVisibility: "HIDDEN" as SiteVisibility,
    };
    const guestClosed = {
      state: "CLOSED" as SessionState,
      accessScope: "GUEST_READABLE" as AccessScope,
      siteVisibility: "HIDDEN" as SiteVisibility,
    };
    const guestPublished = {
      state: "PUBLISHED" as SessionState,
      accessScope: "GUEST_READABLE" as AccessScope,
      siteVisibility: "PUBLIC_RECORD" as SiteVisibility,
    };

    expect(formatMeetingProjection(hostOnlyDraft, "host")).toBe("편집");
    expect(formatMeetingProjection(guestPublished, "host")).toBe("편집·수정");
    expect(formatMeetingProjection(hostOnlyDraft, "memberGuest")).toBe("호스트만 보기");
    expect(formatMeetingProjection(guestDraft, "memberGuest")).toBe("예정 화면 후보");
    expect(formatMeetingProjection(guestOpen, "memberGuest")).toBe("준비 화면");
    expect(formatMeetingProjection(guestClosed, "memberGuest")).toBe("archive의 모임·현재 기록");
    expect(formatMeetingProjection(guestPublished, "memberGuest")).toBe("notes/archive");
    expect(formatMeetingProjection(guestDraft, "memberGuest")).not.toBe(
      formatMeetingProjection(hostOnlyDraft, "memberGuest"),
    );
  });

  it("keeps 세션 only in technical login-session fixtures", () => {
    expect(loginSessionFixture).toBe("로그인 세션 만료");
    expect(loginSessionFixture).toContain("세션");

    const productCopy = [
      MEETING_NOUN,
      formatMeetingOrdinal(7, "folio"),
      formatMeetingOrdinal(7, "sentence"),
      MEETING_RESPONSE_LABEL,
      MEETING_ATTENDANCE_LABEL,
      MEETING_APPLY_LABEL,
      ...(["host", "member", "guest", "public"] as const).flatMap((audience: MeetingAudience) =>
        (["DRAFT", "OPEN", "CLOSED", "PUBLISHED"] as const).map((state) => formatMeetingLifecycle(state, audience)),
      ),
      formatPublicationAction("publishMemberNotes"),
      formatPublicationAction("removeMemberNotes"),
      formatPublicationAction("publishPublicRecord"),
      formatPublicationAction("removePublicRecord"),
    ];

    for (const text of productCopy) {
      expect(text).not.toMatch(/세션|회차|RSVP|기록 공개|공개 완료|공개 취소/);
    }
  });
});
