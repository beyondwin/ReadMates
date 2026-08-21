import { describe, expect, it } from "vitest";
import {
  draftsByDate,
  memberVisibilityLabel,
  upcomingBookCreateFormValues,
} from "./upcoming-book-list-model";

describe("draftsByDate", () => {
  it("orders drafts by date ascending", () => {
    expect(draftsByDate([
      { sessionId: "b", state: "DRAFT", date: "2026-07-09", bookTitle: "B", accessScope: "HOST_ONLY" },
      { sessionId: "a", state: "DRAFT", date: "2026-06-11", bookTitle: "A", accessScope: "GUEST_READABLE" },
      { sessionId: "open", state: "OPEN", date: "2026-04-15", bookTitle: "Now", accessScope: "GUEST_READABLE" },
    ]).map((item) => item.sessionId)).toEqual(["a", "b"]);
  });
});

describe("memberVisibilityLabel", () => {
  it("uses member-facing visibility copy", () => {
    expect(memberVisibilityLabel("GUEST_READABLE")).toBe("게스트와 멤버에게 보이기");
    expect(memberVisibilityLabel("HOST_ONLY")).toBe("호스트만 보기");
  });
});

describe("upcomingBookCreateFormValues", () => {
  it("keeps builtin 20:00, 22:00, and 온라인 when schedule fields are still empty", () => {
    const values = upcomingBookCreateFormValues({
      bookTitle: "다음 책",
      bookAuthor: "다음 저자",
      date: "2026-08-13",
      startTime: "",
      endTime: "",
      locationLabel: "",
      meetingUrl: "",
      meetingPasscode: "",
      accessScope: "HOST_ONLY",
      questionDeadlineOffsetDays: 1,
    });

    expect(values).toMatchObject({
      title: "다음 책",
      bookTitle: "다음 책",
      bookAuthor: "다음 저자",
      date: "2026-08-13",
      startTime: "20:00",
      endTime: "22:00",
      locationLabel: "온라인",
    });
  });
});
