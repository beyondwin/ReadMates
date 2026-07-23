import type { CSSProperties } from "react";
import type { DraftSaveState } from "@/features/host/hooks/use-session-record-draft-controller";
import type { MobileEditorSection } from "./mobile-editor-tabs";
import { Panel } from "./session-editor-panel";

export type { DraftSaveState } from "@/features/host/hooks/use-session-record-draft-controller";

export type SessionRecordDraftEntry = {
  membershipId: string;
  authorDisplayName: string;
  text: string;
};

export type SessionRecordDraftSnapshot = {
  schema: "readmates-session-record:v1";
  visibility: "HOST_ONLY" | "MEMBER" | "PUBLIC";
  publicationSummary: string;
  highlights: SessionRecordDraftEntry[];
  oneLineReviews: SessionRecordDraftEntry[];
  feedbackDocument: {
    fileName: string;
    title: string;
    markdown: string;
  };
};

type ValidationSection = "summary" | "highlights" | "reviews" | "feedback";

const validationSectionLabels: Record<ValidationSection, string> = {
  summary: "공개 요약",
  highlights: "하이라이트",
  reviews: "한줄평",
  feedback: "피드백 문서",
};

function validationSections(issues: string[]) {
  const sections = new Set<ValidationSection>();
  for (const issue of issues) {
    const normalized = issue.toUpperCase();
    if (normalized.includes("SUMMARY")) sections.add("summary");
    if (normalized.includes("HIGHLIGHT")) sections.add("highlights");
    if (normalized.includes("REVIEW")) sections.add("reviews");
    if (normalized.includes("FEEDBACK")) sections.add("feedback");
  }
  return [...sections];
}

function saveStateMessage(state: DraftSaveState) {
  return {
    idle: "공개 기록을 수정하면 자동으로 초안에 저장합니다.",
    dirty: "저장 대기 중인 변경이 있습니다.",
    saving: "공개 기록 초안을 저장하고 있습니다.",
    saved: "초안 저장됨 · 검토 후 반영",
    error: "저장되지 않은 변경이 있습니다. 이 화면을 떠나기 전에 다시 시도해 주세요.",
    stale: "다른 호스트가 먼저 수정했습니다.",
  }[state];
}

export function SessionRecordDraftPanel({
  activeMobileSection,
  liveSnapshot,
  snapshot,
  saveState,
  validationIssues,
  draftLiveBaseStale,
  onSnapshotChange,
  onReloadDraft,
  onCopyInput,
  onReviewDraft,
}: {
  activeMobileSection: MobileEditorSection;
  liveSnapshot: SessionRecordDraftSnapshot;
  snapshot: SessionRecordDraftSnapshot;
  saveState: DraftSaveState;
  validationIssues: string[];
  draftLiveBaseStale: boolean;
  onSnapshotChange: (snapshot: SessionRecordDraftSnapshot) => void;
  onReloadDraft: () => void | Promise<void>;
  onCopyInput: () => void | Promise<void>;
  onReviewDraft?: () => void;
}) {
  const invalidSections = validationSections(validationIssues);
  const updateEntry = (
    key: "highlights" | "oneLineReviews",
    index: number,
    text: string,
  ) => {
    onSnapshotChange({
      ...snapshot,
      [key]: snapshot[key].map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, text } : entry
      ),
    });
  };

  return (
    <Panel
      eyebrow="공개 기록"
      title="공개 기록 초안"
      mobileSection="records"
      panelId="host-editor-panel-records"
      activeMobileSection={activeMobileSection}
    >
      <div className="stack" style={{ "--stack": "18px", minWidth: 0 } as CSSProperties}>
        <div
          role={saveState === "error" || saveState === "stale" || draftLiveBaseStale ? "alert" : "status"}
          className="surface-quiet small"
          data-navigation-blocked={saveState === "error" || saveState === "stale" || saveState === "dirty"}
          style={{ padding: 14 }}
        >
          {draftLiveBaseStale ? "live revision이 변경되어 초안을 다시 확인해야 합니다. " : null}
          {saveStateMessage(saveState)}
          {saveState === "stale" ? (
            <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button className="btn btn-quiet btn-sm" type="button" onClick={() => void onReloadDraft()}>
                최신 초안 불러오기
              </button>
              <button className="btn btn-ghost btn-sm" type="button" onClick={() => void onCopyInput()}>
                내 입력 복사
              </button>
            </div>
          ) : null}
        </div>

        {invalidSections.length > 0 ? (
          <nav aria-label="초안 검증 오류" className="surface-quiet" style={{ padding: 14 }}>
            <div className="tiny" style={{ marginBottom: 8 }}>확인이 필요한 섹션</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {invalidSections.map((section) => (
                <a
                  key={section}
                  className="btn btn-quiet btn-sm"
                  href={`#session-record-${section}`}
                >
                  {validationSectionLabels[section]} 오류
                </a>
              ))}
            </div>
          </nav>
        ) : null}

        <section
          role="region"
          aria-label="현재 적용된 공개 기록"
          className="surface-quiet"
          style={{ padding: 14 }}
        >
          <div className="eyebrow">현재 live revision</div>
          <p className="small" style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>
            {liveSnapshot.publicationSummary || "적용된 공개 요약이 없습니다."}
          </p>
        </section>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="field-label">공개 범위</legend>
          <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
            {[
              ["HOST_ONLY", "호스트 전용"],
              ["MEMBER", "멤버 공개"],
              ["PUBLIC", "외부 공개"],
            ].map(([value, label]) => (
              <label className="small" key={value}>
                <input
                  type="radio"
                  name="session-record-draft-visibility"
                  checked={snapshot.visibility === value}
                  onChange={() => onSnapshotChange({
                    ...snapshot,
                    visibility: value as SessionRecordDraftSnapshot["visibility"],
                  })}
                />{" "}
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label id="session-record-summary" className="stack" style={{ "--stack": "6px" } as CSSProperties}>
          <span className="field-label">공개 요약</span>
          <textarea
            className="input"
            aria-label="공개 요약"
            rows={6}
            value={snapshot.publicationSummary}
            onChange={(event) => onSnapshotChange({
              ...snapshot,
              publicationSummary: event.target.value,
            })}
          />
        </label>

        <section id="session-record-highlights" className="stack" style={{ "--stack": "8px" } as CSSProperties}>
          <h3 className="h4" style={{ margin: 0 }}>하이라이트</h3>
          {snapshot.highlights.length === 0 ? (
            <p className="small" style={{ margin: 0 }}>저장된 하이라이트가 없습니다.</p>
          ) : snapshot.highlights.map((entry, index) => (
            <label key={`${entry.membershipId}-${index}`} className="stack" style={{ "--stack": "5px" } as CSSProperties}>
              <span className="tiny">{entry.authorDisplayName}</span>
              <textarea
                className="input"
                aria-label={`하이라이트 ${index + 1} · ${entry.authorDisplayName}`}
                rows={3}
                value={entry.text}
                onChange={(event) => updateEntry("highlights", index, event.target.value)}
              />
            </label>
          ))}
        </section>

        <section id="session-record-reviews" className="stack" style={{ "--stack": "8px" } as CSSProperties}>
          <h3 className="h4" style={{ margin: 0 }}>한줄평</h3>
          {snapshot.oneLineReviews.length === 0 ? (
            <p className="small" style={{ margin: 0 }}>저장된 한줄평이 없습니다.</p>
          ) : snapshot.oneLineReviews.map((entry, index) => (
            <label key={`${entry.membershipId}-${index}`} className="stack" style={{ "--stack": "5px" } as CSSProperties}>
              <span className="tiny">{entry.authorDisplayName}</span>
              <input
                className="input"
                aria-label={`한줄평 ${index + 1} · ${entry.authorDisplayName}`}
                value={entry.text}
                onChange={(event) => updateEntry("oneLineReviews", index, event.target.value)}
              />
            </label>
          ))}
        </section>

        <section id="session-record-feedback" className="stack" style={{ "--stack": "8px" } as CSSProperties}>
          <h3 className="h4" style={{ margin: 0 }}>피드백 문서</h3>
          <label className="stack" style={{ "--stack": "5px" } as CSSProperties}>
            <span className="tiny">파일 이름</span>
            <input
              className="input"
              value={snapshot.feedbackDocument.fileName}
              onChange={(event) => onSnapshotChange({
                ...snapshot,
                feedbackDocument: { ...snapshot.feedbackDocument, fileName: event.target.value },
              })}
            />
          </label>
          <label className="stack" style={{ "--stack": "5px" } as CSSProperties}>
            <span className="tiny">문서 제목</span>
            <input
              className="input"
              value={snapshot.feedbackDocument.title}
              onChange={(event) => onSnapshotChange({
                ...snapshot,
                feedbackDocument: { ...snapshot.feedbackDocument, title: event.target.value },
              })}
            />
          </label>
          <label className="stack" style={{ "--stack": "5px" } as CSSProperties}>
            <span className="tiny">Markdown 본문</span>
            <textarea
              className="input"
              rows={12}
              value={snapshot.feedbackDocument.markdown}
              onChange={(event) => onSnapshotChange({
                ...snapshot,
                feedbackDocument: { ...snapshot.feedbackDocument, markdown: event.target.value },
              })}
            />
          </label>
        </section>

        <div
          className="surface"
          style={{
            position: "sticky",
            bottom: 8,
            padding: 12,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span className="small">{saveStateMessage(saveState)}</span>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={!onReviewDraft || saveState !== "saved" || draftLiveBaseStale}
            onClick={onReviewDraft}
          >
            변경사항 검토
          </button>
        </div>
      </div>
    </Panel>
  );
}
