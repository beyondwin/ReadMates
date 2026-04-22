"use client";

import { type CSSProperties, useState } from "react";
import { saveCheckin } from "@/features/current-session/actions/save-checkin";
import { saveQuestions } from "@/features/current-session/actions/save-question";
import { saveLongReview, saveOneLineReview } from "@/features/current-session/actions/save-review";
import { updateRsvp } from "@/features/current-session/actions/update-rsvp";
import { MobileCurrentSessionBoard, type MobileSessionTab } from "@/features/current-session/components/current-session-mobile";
import { QuestionEditor, type QuestionInput } from "@/features/current-session/components/current-session-question-editor";
import { initialQuestionInputs } from "@/features/current-session/components/current-session-question-editor-utils";
import {
  BoardCheckins,
  BoardHighlights,
  BoardQuestions,
  CheckinPanel,
  LongReviewPanel,
  MyStatusCard,
  OneLineReviewPanel,
  RosterList,
  RsvpPanel,
  SessionMeta,
} from "@/features/current-session/components/current-session-panels";
import type {
  CurrentSessionAuth,
  CurrentSession,
  RsvpUpdateStatus,
  SaveScope,
  SaveState,
} from "@/features/current-session/components/current-session-types";
import { SUSPENDED_MEMBER_NOTICE } from "@/features/current-session/components/current-session-types";
import { requestReadmatesRouteRefresh } from "@/src/pages/readmates-page-data";
import type { CurrentSessionResponse } from "@/shared/api/readmates";
import { BookCover } from "@/shared/ui/book-cover";
import { formatDateLabel, formatDeadlineLabel, formatSessionKicker } from "@/shared/ui/readmates-display";

type BoardTab = "questions" | "checkins" | "highlights";

const emptySaveStatuses: Record<SaveScope, SaveState> = {
  checkin: "idle",
  question: "idle",
  longReview: "idle",
  oneLineReview: "idle",
};

export default function CurrentSession({ auth, data }: { auth?: CurrentSessionAuth; data: CurrentSessionResponse }) {
  if (data.currentSession === null) {
    return (
      <main>
        <section className="page-header-compact">
          <div className="container">
            <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
              아직 열린 세션이 없습니다
            </h1>
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              호스트가 새 세션을 등록하면 RSVP, 읽기 체크인, 질문 작성이 열립니다.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <CurrentSessionBoard
      key={data.currentSession.sessionId}
      session={data.currentSession}
      isSuspended={auth?.membershipStatus === "SUSPENDED"}
    />
  );
}

function CurrentSessionBoard({ session, isSuspended }: { session: CurrentSession; isSuspended: boolean }) {
  const [rsvp, setRsvp] = useState<CurrentSession["myRsvpStatus"]>(session.myRsvpStatus);
  const [readingProgress, setReadingProgress] = useState(session.myCheckin?.readingProgress ?? 0);
  const [checkinNote, setCheckinNote] = useState(session.myCheckin?.note ?? "");
  const [questionInputs, setQuestionInputs] = useState<QuestionInput[]>(() => initialQuestionInputs(session.myQuestions));
  const [questionValidationMessage, setQuestionValidationMessage] = useState("");
  const [longReview, setLongReview] = useState(session.myLongReview?.body ?? "");
  const [oneLineReview, setOneLineReview] = useState(session.myOneLineReview?.text ?? "");
  const [saveStatuses, setSaveStatuses] = useState<Record<SaveScope, SaveState>>(emptySaveStatuses);
  const [boardTab, setBoardTab] = useState<BoardTab>("questions");
  const [mobileTab, setMobileTab] = useState<MobileSessionTab>("prep");
  const writtenQuestionCount = questionInputs.filter((input) => input.text.trim()).length;

  const setSaveStatus = (scope: SaveScope, status: SaveState) => {
    setSaveStatuses((current) => ({ ...current, [scope]: status }));
  };

  const resetSaveStatus = (scope: SaveScope) => {
    setSaveStatuses((current) => (current[scope] === "idle" ? current : { ...current, [scope]: "idle" }));
  };

  const updateQuestionInput = (index: number, value: string) => {
    resetSaveStatus("question");
    setQuestionValidationMessage("");
    setQuestionInputs((current) =>
      current.map((input, currentIndex) => (currentIndex === index ? { ...input, text: value } : input)),
    );
  };

  const addQuestionInput = () => {
    if (isSuspended) {
      return;
    }

    resetSaveStatus("question");
    if (questionInputs.length >= 5) {
      setQuestionValidationMessage("최대 5개까지 작성할 수 있어요.");
      return;
    }

    setQuestionValidationMessage("");
    setQuestionInputs((current) => [...current, { clientId: `added-${Date.now()}-${current.length}`, text: "" }]);
  };

  const removeQuestionInput = (index: number) => {
    if (isSuspended) {
      return;
    }

    resetSaveStatus("question");
    setQuestionValidationMessage("");
    if (questionInputs.length <= 2) {
      setQuestionValidationMessage("질문 입력칸은 최소 2개가 필요해요.");
      return;
    }

    setQuestionInputs((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSaveQuestions = () => {
    if (isSuspended) {
      return;
    }

    const validQuestionPayload = questionInputs.map((input) => ({ text: input.text.trim() })).filter((input) => input.text);

    if (validQuestionPayload.length < 2) {
      resetSaveStatus("question");
      setQuestionValidationMessage("질문은 최소 2개 작성해 주세요.");
      return;
    }

    setQuestionValidationMessage("");
    void runSave("question", () => saveQuestions(validQuestionPayload));
  };

  const runSave = async (scope: SaveScope, operation: () => Promise<Response>) => {
    setSaveStatus(scope, "saving");

    try {
      const response = await operation();

      if (!response.ok) {
        throw new Error(`${scope} save failed`);
      }

      setSaveStatus(scope, "saved");
      requestReadmatesRouteRefresh();
    } catch {
      setSaveStatus(scope, "error");
    }
  };

  const handleRsvp = (status: RsvpUpdateStatus) => {
    if (isSuspended) {
      return;
    }

    setRsvp(status);
    void updateRsvp(status).then((response) => {
      if (response.ok) {
        requestReadmatesRouteRefresh();
      }
    });
  };

  const handleBoardTab = (tab: BoardTab) => {
    setBoardTab(tab);
  };

  const handleMobileTab = (tab: MobileSessionTab) => {
    setMobileTab(tab);
  };

  const handleReadingProgressChange = (value: number) => {
    resetSaveStatus("checkin");
    setReadingProgress(value);
  };

  const handleCheckinNoteChange = (value: string) => {
    resetSaveStatus("checkin");
    setCheckinNote(value);
  };

  const handleLongReviewChange = (value: string) => {
    resetSaveStatus("longReview");
    setLongReview(value);
  };

  const handleOneLineReviewChange = (value: string) => {
    resetSaveStatus("oneLineReview");
    setOneLineReview(value);
  };

  const handleSaveCheckin = () => {
    if (isSuspended) {
      return;
    }

    void runSave("checkin", () => saveCheckin(readingProgress, checkinNote));
  };

  const handleSaveLongReview = () => {
    if (isSuspended) {
      return;
    }

    void runSave("longReview", () => saveLongReview(longReview));
  };

  const handleSaveOneLineReview = () => {
    if (isSuspended) {
      return;
    }

    void runSave("oneLineReview", () => saveOneLineReview(oneLineReview));
  };

  return (
    <>
      <MobileCurrentSessionBoard
        session={session}
        rsvp={rsvp}
        readingProgress={readingProgress}
        onReadingProgressChange={handleReadingProgressChange}
        checkinNote={checkinNote}
        onCheckinNoteChange={handleCheckinNoteChange}
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
        onOneLineReviewChange={handleOneLineReviewChange}
        checkinSaveStatus={saveStatuses.checkin}
        questionSaveStatus={saveStatuses.question}
        longReviewSaveStatus={saveStatuses.longReview}
        oneLineReviewSaveStatus={saveStatuses.oneLineReview}
        onRsvpChange={handleRsvp}
        mobileTab={mobileTab}
        onMobileTabChange={handleMobileTab}
        onSaveCheckin={handleSaveCheckin}
        onSaveLongReview={handleSaveLongReview}
        onSaveOneLineReview={handleSaveOneLineReview}
        isSuspended={isSuspended}
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

        <section style={{ padding: "32px 0 24px" }}>
          <div className="container">
            <div className="row" style={{ gap: "10px", marginBottom: "18px" }}>
              <span className="eyebrow">단계 01</span>
              <span className="small" style={{ color: "var(--text-3)" }}>
                개인 준비
              </span>
            </div>

            <div className="ws-grid">
              <fieldset
                className="stack"
                disabled={isSuspended}
                style={{ "--stack": "20px", border: 0, margin: 0, padding: 0, minWidth: 0 } as CSSProperties}
              >
                {isSuspended ? <SuspendedMemberNotice /> : null}

                <RsvpPanel rsvp={rsvp} onRsvp={handleRsvp} />

                <CheckinPanel
                  readingProgress={readingProgress}
                  checkinNote={checkinNote}
                  saveStatus={saveStatuses.checkin}
                  onReadingProgressChange={handleReadingProgressChange}
                  onCheckinNoteChange={handleCheckinNoteChange}
                  onSave={handleSaveCheckin}
                />

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

                <OneLineReviewPanel
                  oneLineReview={oneLineReview}
                  saveStatus={saveStatuses.oneLineReview}
                  onChange={handleOneLineReviewChange}
                  onSave={handleSaveOneLineReview}
                />

                <LongReviewPanel
                  longReview={longReview}
                  saveStatus={saveStatuses.longReview}
                  onChange={handleLongReviewChange}
                  onSave={handleSaveLongReview}
                />
              </fieldset>

              <aside className="stack" style={{ "--stack": "20px" } as CSSProperties}>
                <MyStatusCard rsvp={rsvp} readingProgress={readingProgress} writtenQuestionCount={writtenQuestionCount} />

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
                {[
                  { key: "questions", label: `질문 · ${session.board.questions.length}` },
                  { key: "checkins", label: `읽기 흔적 · ${session.board.checkins.length}` },
                  { key: "highlights", label: `하이라이트 · ${session.board.highlights.length}` },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    aria-pressed={boardTab === tab.key}
                    onClick={() => handleBoardTab(tab.key as BoardTab)}
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
            {boardTab === "checkins" ? <BoardCheckins checkins={session.board.checkins} /> : null}
            {boardTab === "highlights" ? <BoardHighlights highlights={session.board.highlights} /> : null}
          </div>
        </section>
      </main>
    </>
  );
}

function SuspendedMemberNotice() {
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
        {SUSPENDED_MEMBER_NOTICE}
      </p>
    </div>
  );
}
