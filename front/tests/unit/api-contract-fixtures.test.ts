import { describe, expect, it } from "vitest";
import {
  anonymousAuthMeContractFixture,
  archiveSessionPageContractFixture,
  archiveSessionDetailContractFixture,
  authMeContractFixture,
  currentSessionContractFixture,
  feedbackDocumentListPageContractFixture,
  feedbackDocumentContractFixture,
  hostCurrentSessionContractFixture,
  hostInvitationContractFixture,
  hostMemberContractFixture,
  hostNotificationDeliveryListContractFixture,
  hostNotificationEventListContractFixture,
  hostSessionDetailContractFixture,
  hostSessionPublicationContractFixture,
  myArchiveQuestionPageContractFixture,
  myArchiveReviewPageContractFixture,
  noteFeedPageContractFixture,
  noteSessionPageContractFixture,
} from "./api-contract-fixtures";

describe("API contract fixtures", () => {
  it("keeps the five high-value frontend contracts represented", () => {
    expect(authMeContractFixture.approvalState).toBe("ACTIVE");
    expect(anonymousAuthMeContractFixture.approvalState).toBe("ANONYMOUS");
    expect(currentSessionContractFixture.currentSession?.board.questions).toHaveLength(1);
    expect(currentSessionContractFixture.currentSession?.attendees[0]?.participationStatus).toBe("ACTIVE");
    expect(hostInvitationContractFixture.applyToCurrentSession).toBe(true);
    expect(hostMemberContractFixture.currentSessionParticipationStatus).toBe("ACTIVE");
    expect(archiveSessionDetailContractFixture.feedbackDocument.readable).toBe(true);
    expect(hostSessionDetailContractFixture.feedbackDocument.uploaded).toBe(true);
    expect(hostSessionDetailContractFixture.publication).toEqual(hostSessionPublicationContractFixture);
    expect(hostSessionPublicationContractFixture.visibility).toBe("PUBLIC");
    expect(hostSessionPublicationContractFixture).not.toHaveProperty("isPublic");
    expect(hostNotificationEventListContractFixture.items[0]?.status).toBe("PENDING");
    expect(hostNotificationDeliveryListContractFixture.items[0]?.channel).toBe("EMAIL");
    expect(feedbackDocumentContractFixture.participants[0]?.revealingQuote.quote).toBeTruthy();
  });

  it("represents paged archive, note, and feedback list contracts", () => {
    expect(archiveSessionPageContractFixture.items[0]?.sessionId).toBe("session-1");
    expect(archiveSessionPageContractFixture.nextCursor).toBe("session-older");
    expect(myArchiveQuestionPageContractFixture.nextCursor).toBeNull();
    expect(myArchiveReviewPageContractFixture.items[0]?.kind).toBe("LONG_REVIEW");
    expect(noteSessionPageContractFixture.items[0]?.totalCount).toBe(3);
    expect(noteFeedPageContractFixture.items[0]?.kind).toBe("QUESTION");
    expect(feedbackDocumentListPageContractFixture.items[0]?.fileName).toBe("251126 1차.md");
  });

  it("represents notification event and delivery ledgers separately", () => {
    const event = hostNotificationEventListContractFixture.items[0];
    const delivery = hostNotificationDeliveryListContractFixture.items[0];
    const skippedDelivery = hostNotificationDeliveryListContractFixture.items[1];

    expect(event).toMatchObject({
      eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
      status: "PENDING",
    });
    expect(event).not.toHaveProperty("recipientEmail");
    expect(delivery).toMatchObject({
      eventId: event?.id,
      channel: "EMAIL",
      status: "FAILED",
      recipientEmail: "m***@example.com",
    });
    expect(skippedDelivery).toMatchObject({
      channel: "IN_APP",
      status: "SKIPPED",
      recipientEmail: null,
    });
  });

  it("represents the reading progress and shared review contract migration", () => {
    const currentSession = currentSessionContractFixture.currentSession;

    expect(currentSession?.myCheckin).toHaveProperty("readingProgress", 72);
    expect(currentSession?.myCheckin).not.toHaveProperty("note");
    expect(currentSession?.board.longReviews).toHaveLength(1);
    expect(currentSession?.board).not.toHaveProperty("oneLineReviews");
    expect(currentSession?.board).not.toHaveProperty("highlights");
    expect(currentSession?.board).not.toHaveProperty("checkins");
    expect(hostCurrentSessionContractFixture.currentSession?.myCheckin).not.toHaveProperty("note");
    expect(hostCurrentSessionContractFixture.currentSession?.board.longReviews).toHaveLength(1);
    expect(hostCurrentSessionContractFixture.currentSession?.board).not.toHaveProperty("oneLineReviews");
    expect(hostCurrentSessionContractFixture.currentSession?.board).not.toHaveProperty("highlights");
    expect(hostCurrentSessionContractFixture.currentSession?.board).not.toHaveProperty("checkins");

    expect(archiveSessionDetailContractFixture.clubOneLiners).toHaveLength(1);
    expect(archiveSessionDetailContractFixture).not.toHaveProperty(["club", "Checkins"].join(""));
    expect(archiveSessionDetailContractFixture.myCheckin).toHaveProperty("readingProgress", 100);
    expect(archiveSessionDetailContractFixture.myCheckin).not.toHaveProperty("authorName");
    expect(archiveSessionDetailContractFixture.myCheckin).not.toHaveProperty("authorShortName");
    expect(archiveSessionDetailContractFixture.myCheckin).not.toHaveProperty("note");
  });
});
