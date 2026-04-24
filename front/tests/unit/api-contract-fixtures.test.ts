import { describe, expect, it } from "vitest";
import {
  anonymousAuthMeContractFixture,
  archiveSessionDetailContractFixture,
  authMeContractFixture,
  currentSessionContractFixture,
  feedbackDocumentContractFixture,
  hostCurrentSessionContractFixture,
  hostInvitationContractFixture,
  hostMemberContractFixture,
  hostSessionDetailContractFixture,
  hostSessionPublicationContractFixture,
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
    expect(feedbackDocumentContractFixture.participants[0]?.revealingQuote.quote).toBeTruthy();
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
