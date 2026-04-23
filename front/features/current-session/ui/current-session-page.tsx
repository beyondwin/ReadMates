"use client";

import { type CSSProperties, type KeyboardEvent, useState } from "react";
import { MobileCurrentSessionBoard, type MobileSessionTab } from "@/features/current-session/ui/current-session-mobile";
import { QuestionEditor, type QuestionInput } from "@/features/current-session/ui/current-session-question-editor";
import { initialQuestionInputs } from "@/features/current-session/ui/current-session-question-editor-utils";
import {
  BoardHighlights,
  BoardOneLineReviews,
  BoardQuestions,
  CheckinPanel,
  LongReviewPanel,
  MyStatusCard,
  RosterList,
  RsvpPanel,
  SessionMeta,
} from "@/features/current-session/ui/current-session-panels";
import type {
  CurrentSessionAuth,
  CurrentSession,
  CurrentSessionInternalLinkProps,
  CurrentSessionPageData,
  InternalLinkComponent,
  RsvpUpdateStatus,
  SaveScope,
  SaveState,
} from "@/features/current-session/ui/current-session-types";
import {
  buildQuestionPayload,
  countWrittenQuestions,
  createAddedQuestionInput,
  getAddQuestionValidationMessage,
  type CurrentSessionQuestionPayloadItem,
  getQuestionPayloadValidationMessage,
  getRemoveQuestionValidationMessage,
} from "@/features/current-session/model/current-session-form-model";
import {
  getBlockedWriteValidationMessage,
  getCurrentSessionAccessState,
  getCurrentSessionBoardTabs,
  getCurrentSessionMemberNotice,
  type CurrentSessionBoardTab,
} from "@/features/current-session/model/current-session-view-model";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateLabel, formatDeadlineLabel, formatSessionKicker, rsvpLabel } from "@/shared/ui/readmates-display";

const emptySaveStatuses: Record<SaveScope, SaveState> = {
  rsvp: "idle",
  checkin: "idle",
  question: "idle",
  longReview: "idle",
  oneLineReview: "idle",
};

export type CurrentSessionSaveActions = {
  updateRsvp: (status: RsvpUpdateStatus) => Promise<void>;
  saveCheckin: (readingProgress: number) => Promise<void>;
  saveQuestions: (questions: CurrentSessionQuestionPayloadItem[]) => Promise<void>;
  saveLongReview: (body: string) => Promise<void>;
  saveOneLineReview: (text: string) => Promise<void>;
};

function AnchorInternalLink({ href, children, ...props }: CurrentSessionInternalLinkProps) {
  return (
    <a {...props} href={href}>
      {children}
    </a>
  );
}

type CurrentSessionPageProps = {
  auth?: CurrentSessionAuth;
  data: CurrentSessionPageData;
  actions: CurrentSessionSaveActions;
  internalLinkComponent: InternalLinkComponent;
  onSaveSuccess?: () => void;
};

export function CurrentSessionPage({ auth, data, actions, internalLinkComponent, onSaveSuccess }: CurrentSessionPageProps) {
  if (data.currentSession === null) {
    return <CurrentSessionEmpty auth={auth} internalLinkComponent={internalLinkComponent} />;
  }

  return (
    <CurrentSessionBoard
      key={data.currentSession.sessionId}
      session={data.currentSession}
      auth={auth}
      actions={actions}
      internalLinkComponent={internalLinkComponent}
      onSaveSuccess={onSaveSuccess}
    />
  );
}

export default CurrentSessionPage;

export function CurrentSessionEmpty({
  auth,
  internalLinkComponent: InternalLink = AnchorInternalLink,
}: {
  auth?: CurrentSessionAuth;
  internalLinkComponent?: InternalLinkComponent;
}) {
  return (
    <main>
      <section className="page-header-compact rm-current-session-empty-header">
        <div className="container">
          <div className="rm-empty-state" style={{ padding: "34px" }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              현재 세션 작업대
            </p>
            <h1 className="h1 editorial" style={{ margin: "8px 0 4px" }}>
              아직 열린 세션이 없습니다
            </h1>
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              새 세션이 등록되면 RSVP, 읽기 진행률, 토론 질문 작업대가 열립니다.
            </p>
            {auth?.role === "HOST" ? (
              <InternalLink href="/app/host/sessions/new" className="btn btn-primary" style={{ marginTop: "18px" }}>
                새 세션 만들기
              </InternalLink>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}

export function CurrentSessionBoard({
  session,
  auth,
  actions,
  internalLinkComponent = AnchorInternalLink,
  onSaveSuccess,
}: {
  session: CurrentSession;
  auth?: CurrentSessionAuth;
  actions: CurrentSessionSaveActions;
  internalLinkComponent?: InternalLinkComponent;
  onSaveSuccess?: () => void;
}) {
  const [rsvp, setRsvp] = useState<CurrentSession["myRsvpStatus"]>(session.myRsvpStatus);
  const [readingProgress, setReadingProgress] = useState(session.myCheckin?.readingProgress ?? 0);
  const [questionInputs, setQuestionInputs] = useState<QuestionInput[]>(() => initialQuestionInputs(session.myQuestions));
  const [questionValidationMessage, setQuestionValidationMessage] = useState("");
  const [longReview, setLongReview] = useState(session.myLongReview?.body ?? "");
  const oneLineReview = session.myOneLineReview?.text ?? "";
  const [saveStatuses, setSaveStatuses] = useState<Record<SaveScope, SaveState>>(emptySaveStatuses);
  const [boardTab, setBoardTab] = useState<CurrentSessionBoardTab>("questions");
  const [mobileTab, setMobileTab] = useState<MobileSessionTab>("prep");
  const writtenQuestionCount = countWrittenQuestions(questionInputs);
  const accessState = getCurrentSessionAccessState(auth);
  const { isViewer, isHost, canWrite } = accessState;
  const memberNotice = getCurrentSessionMemberNotice(accessState);
  const boardTabs = getCurrentSessionBoardTabs(session.board);

  const setSaveStatus = (scope: SaveScope, status: SaveState) => {
    setSaveStatuses((current) => ({ ...current, [scope]: status }));
  };

  const resetSaveStatus = (scope: SaveScope) => {
    setSaveStatuses((current) => (current[scope] === "idle" ? current : { ...current, [scope]: "idle" }));
  };

  const blockReadOnlyWrite = () => {
    if (canWrite) {
      return false;
    }

    const validationMessage = getBlockedWriteValidationMessage({ isViewer });
    if (validationMessage) {
      setQuestionValidationMessage(validationMessage);
    }

    return true;
  };

  const updateQuestionInput = (index: number, value: string) => {
    if (!canWrite) {
      return;
    }

    resetSaveStatus("question");
    setQuestionValidationMessage("");
    setQuestionInputs((current) =>
      current.map((input, currentIndex) => (currentIndex === index ? { ...input, text: value } : input)),
    );
  };

  const addQuestionInput = () => {
    if (blockReadOnlyWrite()) {
      return;
    }

    resetSaveStatus("question");
    const validationMessage = getAddQuestionValidationMessage(questionInputs);
    if (validationMessage) {
      setQuestionValidationMessage(validationMessage);
      return;
    }

    setQuestionValidationMessage("");
    setQuestionInputs((current) => [...current, createAddedQuestionInput(current.length, Date.now())]);
  };

  const removeQuestionInput = (index: number) => {
    if (blockReadOnlyWrite()) {
      return;
    }

    resetSaveStatus("question");
    setQuestionValidationMessage("");
    const validationMessage = getRemoveQuestionValidationMessage(questionInputs);
    if (validationMessage) {
      setQuestionValidationMessage(validationMessage);
      return;
    }

    setQuestionInputs((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSaveQuestions = () => {
    if (blockReadOnlyWrite()) {
      return;
    }

    const validQuestionPayload = buildQuestionPayload(questionInputs);
    const validationMessage = getQuestionPayloadValidationMessage(validQuestionPayload);

    if (validationMessage) {
      resetSaveStatus("question");
      setQuestionValidationMessage(validationMessage);
      return;
    }

    setQuestionValidationMessage("");
    void runSave("question", () => actions.saveQuestions(validQuestionPayload));
  };

  const runSave = async (scope: SaveScope, operation: () => Promise<void>) => {
    setSaveStatus(scope, "saving");

    try {
      await operation();
      setSaveStatus(scope, "saved");
      onSaveSuccess?.();
    } catch {
      setSaveStatus(scope, "error");
    }
  };

  const handleRsvp = (status: RsvpUpdateStatus) => {
    if (blockReadOnlyWrite()) {
      return;
    }

    const previousRsvp = rsvp;
    setRsvp(status);
    setSaveStatus("rsvp", "saving");
    void actions.updateRsvp(status)
      .then(() => {
        setSaveStatus("rsvp", "saved");
        onSaveSuccess?.();
      })
      .catch(() => {
        setRsvp(previousRsvp);
        setSaveStatus("rsvp", "error");
      });
  };

  const handleBoardTab = (tab: CurrentSessionBoardTab) => {
    setBoardTab(tab);
  };

  const focusBoardTab = (tab: CurrentSessionBoardTab) => {
    globalThis.setTimeout(() => {
      document.getElementById(`current-session-board-tab-${tab}`)?.focus();
    }, 0);
  };

  const handleBoardTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = boardTabs.map((tab) => tab.key);
    const currentIndex = keys.indexOf(boardTab);
    const lastIndex = keys.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % keys.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + keys.length) % keys.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : -1;

    if (nextIndex < 0) {
      return;
    }

    event.preventDefault();
    const nextTab = keys[nextIndex];
    setBoardTab(nextTab);
    focusBoardTab(nextTab);
  };

  const handleMobileTab = (tab: MobileSessionTab) => {
    setMobileTab(tab);
  };

  const handleReadingProgressChange = (value: number) => {
    if (!canWrite) {
      return;
    }

    resetSaveStatus("checkin");
    setReadingProgress(value);
  };

  const handleLongReviewChange = (value: string) => {
    if (!canWrite) {
      return;
    }

    resetSaveStatus("longReview");
    setLongReview(value);
  };

  const handleSaveCheckin = () => {
    if (blockReadOnlyWrite()) {
      return;
    }

    void runSave("checkin", () => actions.saveCheckin(readingProgress));
  };

  const handleSaveLongReview = () => {
    if (blockReadOnlyWrite()) {
      return;
    }

    void runSave("longReview", () => actions.saveLongReview(longReview));
  };

  return (
    <>
      <MobileCurrentSessionBoard
        session={session}
        rsvp={rsvp}
        readingProgress={readingProgress}
        onReadingProgressChange={handleReadingProgressChange}
        questionInputs={questionInputs}
        questionValidationMessage={questionValidationMessage}
        onQuestionChange={updateQuestionInput}
        onAddQuestion={addQuestionInput}
        onRemoveQuestion={removeQuestionInput}
        onSaveQuestions={handleSaveQuestions}
        writtenQuestionCount={writtenQuestionCount}
        longReview={longReview}
        onLongReviewChange={handleLongReviewChange}
        oneLineReview={oneLineReview}
        checkinSaveStatus={saveStatuses.checkin}
        questionSaveStatus={saveStatuses.question}
        longReviewSaveStatus={saveStatuses.longReview}
        rsvpSaveStatus={saveStatuses.rsvp}
        onRsvpChange={handleRsvp}
        mobileTab={mobileTab}
        onMobileTabChange={handleMobileTab}
        onSaveCheckin={handleSaveCheckin}
        onSaveLongReview={handleSaveLongReview}
        isViewer={isViewer}
        memberNotice={memberNotice}
        isHost={isHost}
        canWrite={canWrite}
        internalLinkComponent={internalLinkComponent}
      />

      <main className="desktop-only rm-current-session-desktop">
        <section className="page-header-compact" style={{ padding: "28px 0 24px" }}>
          <div className="container">
            <div className="row-between" style={{ alignItems: "flex-start" }}>
              <div className="row" style={{ alignItems: "flex-start", gap: "16px", minWidth: 0 }}>
                <BookCover title={session.bookTitle} author={session.bookAuthor} imageUrl={session.bookImageUrl} width={72} />
                <div style={{ minWidth: 0 }}>
                  <p className="eyebrow" style={{ margin: 0 }}>
                    {formatSessionKicker(session.sessionNumber, session.date)}
                  </p>
                  <h1 className="h1 editorial" style={{ margin: "8px 0 4px" }}>
                    {session.bookTitle}
                  </h1>
                  <div className="small">
                    {session.bookAuthor} · {formatDateLabel(session.date)} · {session.startTime} – {session.endTime} ·{" "}
                    {session.locationLabel}
                  </div>
                </div>
              </div>
              <span className="badge badge-accent badge-dot">
                질문 제출 마감 · {formatDeadlineLabel(session.questionDeadlineAt)}
              </span>
            </div>
          </div>
        </section>

        <section style={{ padding: "32px 0 24px" }} aria-labelledby="current-session-prep-heading">
          <div className="container">
            <div style={{ marginBottom: "18px" }}>
              <span className="eyebrow">읽기 진행률 · 출석 · 질문</span>
              <h2 id="current-session-prep-heading" className="h3 editorial" style={{ margin: "6px 0 0" }}>
                내 준비 작업대
              </h2>
              <p className="small" style={{ color: "var(--text-2)", margin: "6px 0 0" }}>
                읽기 진행률, RSVP, 토론 질문을 세션 전에 바로 정리합니다.
              </p>
            </div>

            <div className="ws-grid">
              {isViewer ? (
                <ViewerSessionReadOnly
                  session={session}
                  rsvp={rsvp}
                  readingProgress={readingProgress}
                  longReview={longReview}
                  oneLineReview={oneLineReview}
                  memberNotice={memberNotice}
                />
              ) : (
                <fieldset
                  className="stack"
                  disabled={!canWrite}
                  style={{ "--stack": "20px", border: 0, margin: 0, padding: 0, minWidth: 0 } as CSSProperties}
                >
                  {memberNotice?.kind === "suspended" ? <SuspendedMemberNotice message={memberNotice.message} /> : null}

                  <section aria-labelledby="attendance-rsvp-heading">
                    <div className="eyebrow" id="attendance-rsvp-heading" style={{ marginBottom: "10px" }}>
                      출석과 RSVP
                    </div>
                    <RsvpPanel rsvp={rsvp} saveStatus={saveStatuses.rsvp} onRsvp={handleRsvp} />
                  </section>

                  <section aria-labelledby="reading-record-heading">
                    <div className="eyebrow" id="reading-record-heading" style={{ marginBottom: "10px" }}>
                      읽기 진행률
                    </div>
                    <CheckinPanel
                      readingProgress={readingProgress}
                      saveStatus={saveStatuses.checkin}
                      onReadingProgressChange={handleReadingProgressChange}
                      onSave={handleSaveCheckin}
                    />
                  </section>

                  <section aria-labelledby="discussion-questions-heading">
                    <div className="eyebrow" id="discussion-questions-heading" style={{ marginBottom: "10px" }}>
                      토론 질문
                    </div>
                    <QuestionEditor
                      variant="desktop"
                      questionInputs={questionInputs}
                      writtenQuestionCount={writtenQuestionCount}
                      validationMessage={questionValidationMessage}
                      saveStatus={saveStatuses.question}
                      onChangeQuestion={updateQuestionInput}
                      onAddQuestion={addQuestionInput}
                      onRemoveQuestion={removeQuestionInput}
                      onSaveQuestions={handleSaveQuestions}
                    />
                  </section>

                  <LongReviewPanel
                    longReview={longReview}
                    saveStatus={saveStatuses.longReview}
                    onChange={handleLongReviewChange}
                    onSave={handleSaveLongReview}
                  />
                </fieldset>
              )}

              <aside className="stack" style={{ "--stack": "20px" } as CSSProperties}>
                <MyStatusCard
                  rsvp={rsvp}
                  readingProgress={readingProgress}
                  writtenQuestionCount={writtenQuestionCount}
                  hasOneLineReview={Boolean(oneLineReview.trim())}
                />

                <SessionMeta session={session} />

                <RosterList session={session} />
              </aside>
            </div>
          </div>
        </section>

        <hr className="divider" style={{ margin: "48px 0 0" }} />

        <section style={{ padding: "48px 0 80px", background: "var(--bg-sub)" }}>
          <div className="container">
            <div className="row-between" style={{ alignItems: "flex-start", marginBottom: "18px" }}>
              <div className="row" style={{ gap: "10px", flexWrap: "wrap" }}>
                <span className="eyebrow">단계 02</span>
                <span className="small" style={{ color: "var(--text-3)" }}>
                  공동 보드 · 다른 멤버의 기록
                </span>
              </div>
              <div
                className="row"
                aria-label="공동 보드"
                onKeyDown={handleBoardTabKeyDown}
                style={{
                  gap: "4px",
                  background: "var(--bg)",
                  padding: "4px",
                  borderRadius: "999px",
                  border: "1px solid var(--line)",
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                {boardTabs.map((tab) => (
                  <button
                    key={tab.key}
                    id={`current-session-board-tab-${tab.key}`}
                    type="button"
                    aria-pressed={boardTab === tab.key}
                    onClick={() => handleBoardTab(tab.key)}
                    style={{
                      height: "30px",
                      padding: "0 14px",
                      fontSize: "13px",
                      borderRadius: "999px",
                      background: boardTab === tab.key ? "var(--accent-soft)" : "transparent",
                      color: boardTab === tab.key ? "var(--accent)" : "var(--text-2)",
                      fontWeight: boardTab === tab.key ? 500 : 400,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {boardTab === "questions" ? <BoardQuestions questions={session.board.questions} /> : null}
            {boardTab === "oneLineReviews" ? <BoardOneLineReviews oneLineReviews={session.board.oneLineReviews} /> : null}
            {boardTab === "highlights" ? <BoardHighlights highlights={session.board.highlights} /> : null}
          </div>
        </section>
      </main>
    </>
  );
}

function SuspendedMemberNotice({ message }: { message: string }) {
  return (
    <div
      className="surface-quiet"
      role="note"
      style={{
        padding: "16px 18px",
        borderColor: "var(--danger)",
        color: "var(--danger)",
      }}
    >
      <p className="small" style={{ margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

function ViewerMemberNotice({ message }: { message: string }) {
  return (
    <div className="surface-quiet" role="note" style={{ padding: "16px 18px" }}>
      <p className="eyebrow" style={{ margin: 0 }}>
        둘러보기 멤버
      </p>
      <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
        {message}
      </p>
      <p className="small" style={{ color: "var(--text-2)", margin: "4px 0 0" }}>
        정식 멤버가 되면 RSVP와 질문 작성이 열립니다.
      </p>
    </div>
  );
}

function ViewerSessionReadOnly({
  session,
  rsvp,
  readingProgress,
  longReview,
  oneLineReview,
  memberNotice,
}: {
  session: CurrentSession;
  rsvp: CurrentSession["myRsvpStatus"];
  readingProgress: number;
  longReview: string;
  oneLineReview: string;
  memberNotice: ReturnType<typeof getCurrentSessionMemberNotice>;
}) {
  const questions = session.myQuestions.filter((question) => question.text.trim());
  const reviewItems = [
    {
      label: "한줄평",
      title: "보존된 한줄평",
      body: oneLineReview.trim() || "아직 남긴 한줄평이 없습니다.",
    },
    {
      label: "서평",
      title: "보존된 서평",
      body: longReview.trim() || "아직 남긴 서평이 없습니다.",
    },
  ];

  return (
    <div className="stack" style={{ "--stack": "20px" } as CSSProperties}>
      {memberNotice?.kind === "viewer" ? <ViewerMemberNotice message={memberNotice.message} /> : null}

      <section className="surface" aria-labelledby="viewer-session-detail-heading" style={{ padding: "28px" }}>
        <div className="eyebrow">읽기 전용 세션 상세</div>
        <h2 id="viewer-session-detail-heading" className="h4 editorial" style={{ margin: "6px 0 0" }}>
          기록은 볼 수 있고, 새 참여 기록은 정식 멤버에게 열립니다
        </h2>
        <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
          둘러보기 멤버는 RSVP, 읽기 진행률, 질문, 서평 저장을 할 수 없습니다. 기존 기록과 공동 보드, 피드백 문서 접근 상태는 읽기 전용으로 확인할 수 있어요.
        </p>
        <div className="grid-2" style={{ marginTop: "18px" }}>
          <ReadOnlyMetric label="RSVP" value={rsvpLabel(rsvp)} />
          <ReadOnlyMetric label="읽기 진행률" value={`${readingProgress}%`} />
          <ReadOnlyMetric label="토론 질문" value={`${questions.length}개`} />
          <ReadOnlyMetric label="피드백 문서" value="정식 멤버 전환 후" />
        </div>
      </section>

      <section className="surface" aria-labelledby="viewer-checkin-heading" style={{ padding: "28px" }}>
        <div className="eyebrow" id="viewer-checkin-heading">
          읽기 진행률
        </div>
        <div className="h4 editorial" style={{ marginTop: "6px" }}>
          {readingProgress}%
        </div>
        <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 0", whiteSpace: "pre-wrap" }}>
          진행률은 내 준비 상태와 호스트 운영 확인에 사용됩니다.
        </p>
      </section>

      <section className="surface" aria-labelledby="viewer-questions-heading" style={{ padding: "28px" }}>
        <div className="eyebrow" id="viewer-questions-heading">
          보존된 질문
        </div>
        <div className="stack" style={{ "--stack": "10px", marginTop: "12px" } as CSSProperties}>
          {questions.length > 0 ? (
            questions.map((question) => (
              <article key={`${question.priority}-${question.text}`} className="surface-quiet" style={{ padding: "14px" }}>
                <div className="tiny mono" style={{ color: "var(--text-3)", marginBottom: "6px" }}>
                  Q{question.priority}
                </div>
                <div className="small editorial" style={{ color: "var(--text)" }}>
                  {question.text}
                </div>
              </article>
            ))
          ) : (
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              아직 남긴 질문이 없습니다. 공동 보드의 다른 멤버 질문은 아래에서 볼 수 있어요.
            </p>
          )}
        </div>
      </section>

      <section className="surface" aria-labelledby="viewer-reviews-heading" style={{ padding: "28px" }}>
        <div className="eyebrow" id="viewer-reviews-heading">
          보존된 서평
        </div>
        <div className="stack" style={{ "--stack": "12px", marginTop: "12px" } as CSSProperties}>
          {reviewItems.map((item) => (
            <article key={item.label} className="surface-quiet" style={{ padding: "14px" }}>
              <div className="tiny mono" style={{ color: "var(--text-3)", marginBottom: "6px" }}>
                {item.title}
              </div>
              <p className="small editorial" style={{ color: "var(--text)", margin: 0, whiteSpace: "pre-wrap" }}>
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="surface-quiet rm-locked-state" role="note" style={{ padding: "22px" }}>
        <div className="eyebrow">피드백 문서 접근</div>
        <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
          피드백 문서는 참석한 정식 멤버에게 열립니다. 둘러보기 상태에서는 업로드 여부와 접근 제한만 확인할 수 있어요.
        </p>
      </section>
    </div>
  );
}

function ReadOnlyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-quiet" style={{ padding: "14px" }}>
      <div className="tiny mono" style={{ color: "var(--text-3)", marginBottom: "6px" }}>
        {label}
      </div>
      <div className="body" style={{ fontWeight: 500 }}>
        {value}
      </div>
    </div>
  );
}
