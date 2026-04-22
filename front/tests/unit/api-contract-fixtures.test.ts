import { describe, expect, it } from "vitest";
import {
  anonymousAuthMeContractFixture,
  archiveSessionDetailContractFixture,
  authMeContractFixture,
  currentSessionContractFixture,
  feedbackDocumentContractFixture,
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
    expect(hostSessionPublicationContractFixture.isPublic).toBe(true);
    expect(feedbackDocumentContractFixture.participants[0]?.revealingQuote.quote).toBeTruthy();
  });
});
