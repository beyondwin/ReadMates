import { describe, expect, it } from "vitest";
import { feedbackDocumentQuery, feedbackKeys } from "./feedback-queries";

describe("feedback query helpers", () => {
  it("scopes feedback document by session and club", () => {
    expect(feedbackDocumentQuery("session-1", { clubSlug: "bookclub" }).queryKey).toEqual([
      "feedback",
      "scope",
      "bookclub",
      "document",
      "session-1",
    ]);
  });

  it("has a root that can be invalidated after AI commit", () => {
    expect(feedbackKeys.scope({ clubSlug: "bookclub" })).toEqual(["feedback", "scope", "bookclub"]);
  });
});
