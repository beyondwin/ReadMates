import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MobileRecordsSegment } from "./mobile/mobile-records-segment";
import { LongReviewPanel } from "./current-session-panels";
import { ScheduleSeenRecoveryNotice } from "./current-session-page";

describe("member review visibility helper", () => {
  it("keeps schedule acknowledgement recovery inline and keyboard accessible", () => {
    render(<ScheduleSeenRecoveryNotice isRetrying={false} onRetry={() => undefined} />);

    expect(screen.getByRole("status")).toHaveTextContent("일정은 계속 확인하고 준비할 수 있습니다.");
    expect(screen.getByRole("button", { name: "일정 확인 다시 기록" })).toBeEnabled();
  });

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
