import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileRecordsSegment } from "./mobile/mobile-records-segment";
import { LongReviewPanel } from "./current-session-panels";

describe("member review visibility helper", () => {
  it("keeps the guest visibility notice beside both long-review save actions", () => {
    render(
      <>
        <LongReviewPanel longReview="" saveStatus="idle" onChange={() => undefined} onSave={() => undefined} />
        <MobileRecordsSegment
          longReview=""
          oneLineReview=""
          longReviewSaveStatus="idle"
          oneLineReviewSaveStatus="idle"
          onLongReviewChange={() => undefined}
          onOneLineReviewChange={() => undefined}
          onSaveLongReview={() => undefined}
          onSaveOneLineReview={() => undefined}
          isViewer={false}
          isSuspended={false}
          canWrite
          canReadFeedback
        />
      </>,
    );

    expect(screen.getAllByText("작성한 글은 게스트에게도 공개돼요.")).toHaveLength(2);
  });
});
