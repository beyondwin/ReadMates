import { describe, expect, it } from "vitest";
import {
  NEW_MEETING_FIELD_LIMITS,
  applyNewMeetingSuggestions,
  buildNewMeetingRequest,
  classifyNewMeetingServerFailure,
  emptyNewMeetingDraft,
  newMeetingSuggestionsFromDefaults,
  projectCreatedMeeting,
  validateNewMeetingDraft,
  type NewMeetingDraft,
} from "./new-host-meeting-model";

const validDraft: NewMeetingDraft = {
  title: "여덟 번째 모임",
  bookTitle: "물고기는 존재하지 않는다",
  author: "룰루 밀러",
  meetingDate: "2026-09-12",
  meetingTime: "20:00",
  locationLabel: "온라인",
  meetingUrl: "https://meet.example.com/room",
  meetingPasscode: "읽기-8",
};

describe("new meeting draft", () => {
  it.each([
    ["title", 255],
    ["bookTitle", 255],
    ["author", 255],
  ] as const)("counts %s limits by Unicode code point", (field, limit) => {
    expect(validateNewMeetingDraft({ ...validDraft, [field]: "📚".repeat(limit) })[field]).toBeUndefined();
    expect(validateNewMeetingDraft({ ...validDraft, [field]: "📚".repeat(limit + 1) })[field]).toContain(String(limit));
    expect(NEW_MEETING_FIELD_LIMITS[field]).toBe(limit);
  });

  it.each([
    ["locationLabel", "장소"],
    ["meetingPasscode", "Passcode"],
  ] as const)("matches the server astral boundary for %s", (field, label) => {
    expect(validateNewMeetingDraft({ ...validDraft, [field]: "📚".repeat(255) })[field]).toBeUndefined();
    expect(validateNewMeetingDraft({ ...validDraft, [field]: "📚".repeat(256) })[field]).toBe(`${label}은 255자까지 입력할 수 있습니다.`);
  });

  it("counts URL and combining characters by Unicode code point", () => {
    const prefix = "https://example.com/";
    const maxUrl = `${prefix}${"a".repeat(1000 - Array.from(prefix).length)}`;
    const combiningOver = "e\u0301".repeat(128);

    expect(validateNewMeetingDraft({ ...validDraft, meetingUrl: maxUrl }).meetingUrl).toBeUndefined();
    expect(validateNewMeetingDraft({ ...validDraft, meetingUrl: `${maxUrl}a` }).meetingUrl).toContain("1000");
    expect(Array.from(combiningOver)).toHaveLength(256);
    expect(validateNewMeetingDraft({ ...validDraft, title: combiningOver }).title).toContain("255");
  });

  it("keeps dirty and deliberately cleared fields while filling only untouched suggestions", () => {
    const draft = { ...emptyNewMeetingDraft(), meetingDate: "", meetingTime: "19:00", locationLabel: "" };
    const suggestions = newMeetingSuggestionsFromDefaults({
      automatic: {
        startTime: "20:00",
        endTime: "22:00",
        locationLabel: "온라인",
        accessScope: "HOST_ONLY",
        suggestedDate: "2026-09-12",
        questionDeadlineOffsetDays: 1,
      },
      previousOnlineMeeting: { meetingUrl: "https://meet.example.com/old", meetingPasscode: "old-secret" },
      hints: ["최근 4개 모임에서 가장 자주 사용한 시간입니다."],
    });

    expect(applyNewMeetingSuggestions(draft, suggestions, new Set(["meetingTime", "locationLabel"]))).toEqual({
      ...draft,
      meetingDate: "2026-09-12",
      meetingTime: "19:00",
      locationLabel: "",
      meetingUrl: "",
      meetingPasscode: "",
    });
    expect(suggestions.meetingUrl?.sensitive).toBe(true);
    expect(suggestions.meetingPasscode?.sensitive).toBe(true);
  });

  it.each([
    ["loading", "기본 일정을 확인하고 있습니다."],
    ["error", "기본 일정을 불러오지 못했습니다."],
    ["no-history", "지난 모임이 없어 직접 입력합니다."],
  ] as const)("keeps manual creation available for the %s default state", (kind, copy) => {
    const suggestions = newMeetingSuggestionsFromDefaults(null, kind);

    expect(suggestions.status).toBe(kind);
    expect(suggestions.message).toBe(copy);
    expect(suggestions.blocking).toBe(false);
  });

  it("requires explicit opt-in before adopting the prior URL and passcode", () => {
    const suggestions = newMeetingSuggestionsFromDefaults({
      automatic: {
        startTime: "20:00",
        endTime: "22:00",
        locationLabel: "온라인",
        accessScope: "HOST_ONLY",
        suggestedDate: null,
        questionDeadlineOffsetDays: 1,
      },
      previousOnlineMeeting: { meetingUrl: "https://meet.example.com/old", meetingPasscode: "old-secret" },
      hints: [],
    });

    expect(applyNewMeetingSuggestions(emptyNewMeetingDraft(), suggestions, new Set())).toMatchObject({
      meetingUrl: "",
      meetingPasscode: "",
    });
  });

  it("forces the first save to the host-only draft boundary", () => {
    expect(buildNewMeetingRequest(validDraft)).toMatchObject({
      title: validDraft.title,
      bookTitle: validDraft.bookTitle,
      bookAuthor: validDraft.author,
      date: validDraft.meetingDate,
      startTime: validDraft.meetingTime,
      meetingUrl: validDraft.meetingUrl,
      meetingPasscode: validDraft.meetingPasscode,
      accessScope: "HOST_ONLY",
    });
    expect(projectCreatedMeeting({ sessionId: "meeting-8", sessionNumber: 8, state: "DRAFT", accessScope: "HOST_ONLY" }))
      .toEqual({
        sessionId: "meeting-8",
        sessionNumber: 8,
        state: "DRAFT",
        accessScope: "HOST_ONLY",
        siteVisibility: "HIDDEN",
        notificationDecision: "NOT_SENT",
      });
  });

  it("maps a server 400 field without mutating the submitted draft", () => {
    const before = structuredClone(validDraft);
    expect(classifyNewMeetingServerFailure(400, {
      code: "INVALID_REQUEST",
      message: "bookTitle must not be blank",
      field: "bookTitle",
    })).toEqual({
      field: "bookTitle",
      message: "책 제목을 확인해 주세요.",
    });
    expect(validDraft).toEqual(before);
  });

  it("does not infer or default an unknown server 400 field", () => {
    expect(classifyNewMeetingServerFailure(400, {
      code: "INVALID_REQUEST",
      message: "meeting payload is invalid",
    })).toEqual({
      field: null,
      message: "모임 정보를 확인해 주세요.",
    });
    expect(classifyNewMeetingServerFailure(400, {
      code: "INVALID_REQUEST",
      field: "startTime",
    })).toEqual({
      field: null,
      message: "모임 정보를 확인해 주세요.",
    });
  });
});
