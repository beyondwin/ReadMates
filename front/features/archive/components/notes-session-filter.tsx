"use client";

import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type RefObject, useEffect, useRef } from "react";
import type { NoteSessionItem } from "@/shared/api/readmates";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";
import { noteSessionNumberLabel, sessionBookTitle } from "@/features/archive/components/notes-session-filter-utils";
import type { FeedFilter } from "@/features/archive/components/notes-feed-list";
import { Link } from "@/src/app/router-link";

function sessionHref(session: NoteSessionItem, filter: FeedFilter) {
  const params = new URLSearchParams({ sessionId: session.sessionId });

  if (filter !== "all") {
    params.set("filter", filter);
  }

  return `/app/notes?${params.toString()}`;
}

function sessionRecordSummary(session: NoteSessionItem) {
  return `기록 ${session.totalCount}`;
}

function sessionMatchesQuery(session: NoteSessionItem, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  const numberLabel = noteSessionNumberLabel(session).toLocaleLowerCase();
  const compactNumberLabel = numberLabel.replace(".", "");
  const bookTitle = sessionBookTitle(session).toLocaleLowerCase();

  return bookTitle.includes(normalizedQuery) || numberLabel.includes(normalizedQuery) || compactNumberLabel.includes(normalizedQuery);
}

function uniqueNoteSessions(sessions: NoteSessionItem[]) {
  const seenSessionIds = new Set<string>();

  return sessions.filter((session) => {
    if (seenSessionIds.has(session.sessionId)) {
      return false;
    }

    seenSessionIds.add(session.sessionId);
    return true;
  });
}

function mobileRecentSessions(noteSessions: NoteSessionItem[], selectedSessionId: string | null) {
  const uniqueSessions = uniqueNoteSessions(noteSessions);
  const recentSessions = uniqueSessions.slice(0, 8);
  const selectedSession = selectedSessionId ? uniqueSessions.find((session) => session.sessionId === selectedSessionId) : undefined;

  if (!selectedSession || recentSessions.some((session) => session.sessionId === selectedSession.sessionId)) {
    return recentSessions;
  }

  return [...uniqueSessions.slice(0, 7), selectedSession];
}

export function SelectedSessionHeader({ session }: { session: NoteSessionItem | null }) {
  return (
    <div>
      <p className="eyebrow" style={{ margin: 0 }}>
        클럽 노트
      </p>
      <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
        {session ? sessionBookTitle(session) : "읽고 돌아오는 자리"}
      </h1>
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        {session
          ? `${noteSessionNumberLabel(session)} · ${formatDateOnlyLabel(session.date)}`
          : "다른 멤버의 질문, 한줄평, 읽기 흔적. 댓글도 좋아요도 없는 조용한 피드."}
      </p>
      {session ? (
        <div className="row" style={{ gap: "6px", flexWrap: "wrap", marginTop: "14px" }} aria-label="선택한 세션 기록 수">
          <span className="badge">질문 {session.questionCount}</span>
          <span className="badge">한줄평 {session.oneLinerCount}</span>
          <span className="badge">하이라이트 {session.highlightCount}</span>
          <span className="badge">읽기 흔적 {session.checkinCount}</span>
        </div>
      ) : null}
    </div>
  );
}

export function SessionRail({
  noteSessions,
  selectedSessionId,
  filter,
  query,
  onQueryChange,
}: {
  noteSessions: NoteSessionItem[];
  selectedSessionId: string | null;
  filter: FeedFilter;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const filteredSessions = noteSessions.filter((session) => sessionMatchesQuery(session, query));

  return (
    <div>
      <div className="row-between" style={{ alignItems: "baseline", marginBottom: "12px" }}>
        <div className="eyebrow">세션별</div>
        <span className="tiny mono" style={{ color: "var(--text-3)" }}>
          최근순
        </span>
      </div>
      <label className="rm-sr-only" htmlFor="notes-session-search">
        세션 검색
      </label>
      <div style={{ position: "relative", marginBottom: "12px" }}>
        <span
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--text-3)",
            lineHeight: 0,
          }}
        >
          <SearchIcon size={14} />
        </span>
        <input
          id="notes-session-search"
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="책 제목 또는 No.06"
          style={{
            width: "100%",
            height: "38px",
            padding: "0 12px 0 34px",
            border: "1px solid var(--line)",
            borderRadius: "var(--r-2)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        />
      </div>
      <div
        className="stack"
        style={{
          "--stack": "0px",
          maxHeight: "560px",
          overflowY: "auto",
          borderTop: noteSessions.length > 0 ? "1px solid var(--line)" : 0,
        } as CSSProperties}
      >
        {noteSessions.length === 0 ? <SelectorEmptyState /> : null}
        {noteSessions.length > 0 && filteredSessions.length === 0 ? <SelectorSearchEmptyState /> : null}
        {filteredSessions.map((session, index) => (
          <SessionRow
            key={session.sessionId}
            session={session}
            selected={session.sessionId === selectedSessionId}
            filter={filter}
            showStrongTopBorder={index === 0}
          />
        ))}
      </div>
    </div>
  );
}

function SelectorEmptyState() {
  return (
    <p className="small" style={{ color: "var(--text-2)", margin: 0, padding: "14px 0" }}>
      표시할 세션 기록이 없습니다.
    </p>
  );
}

function SelectorSearchEmptyState() {
  return (
    <p className="small" style={{ color: "var(--text-2)", margin: 0, padding: "14px 0" }}>
      일치하는 세션이 없습니다.
    </p>
  );
}

function SessionRow({
  session,
  selected,
  filter,
  showStrongTopBorder = false,
  onClick,
}: {
  session: NoteSessionItem;
  selected: boolean;
  filter: FeedFilter;
  showStrongTopBorder?: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={sessionHref(session, filter)}
      aria-current={selected ? "page" : undefined}
      aria-label={`${noteSessionNumberLabel(session)} ${sessionBookTitle(session)} 세션 보기`}
      onClick={onClick}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "14px 12px",
        borderTop: showStrongTopBorder ? "0" : "1px solid var(--line-soft)",
        borderLeft: selected ? "3px solid var(--accent)" : "3px solid transparent",
        color: "inherit",
        textDecoration: "none",
        background: selected ? "var(--accent-soft)" : "transparent",
      }}
    >
      <div className="row-between">
        <span className="mono tiny" style={{ color: selected ? "var(--accent)" : "var(--text-3)" }}>
          {noteSessionNumberLabel(session)}
        </span>
        {selected ? <span className="badge badge-accent badge-dot">선택됨</span> : null}
      </div>
      <div className="body" style={{ marginTop: "4px", fontSize: "14px", fontWeight: selected ? 600 : 500 }}>
        {sessionBookTitle(session)}
      </div>
      <div className="tiny" style={{ marginTop: "2px" }}>
        {formatDateOnlyLabel(session.date)} · {sessionRecordSummary(session)}
      </div>
    </Link>
  );
}

export function MobileSessionPicker({
  noteSessions,
  selectedSessionId,
  filter,
  onOpenAll,
  allSessionsButtonRef,
}: {
  noteSessions: NoteSessionItem[];
  selectedSessionId: string | null;
  filter: FeedFilter;
  onOpenAll: () => void;
  allSessionsButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const recentSessions = mobileRecentSessions(noteSessions, selectedSessionId);

  return (
    <div className="mobile-only rm-notes-feed-page__mobile-picker">
      <div className="row-between" style={{ marginBottom: "10px" }}>
        <span className="eyebrow">세션별</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onOpenAll} ref={allSessionsButtonRef}>
          전체 세션
        </button>
      </div>
      {noteSessions.length === 0 ? (
        <SelectorEmptyState />
      ) : (
        <div className="m-hscroll" style={{ padding: "0 0 6px", gap: "10px" }} aria-label="최근 세션">
          {recentSessions.map((session) => {
            const selected = session.sessionId === selectedSessionId;

            return (
              <Link
                key={session.sessionId}
                to={sessionHref(session, filter)}
                aria-current={selected ? "page" : undefined}
                aria-label={`${noteSessionNumberLabel(session)} ${sessionBookTitle(session)} 세션 보기`}
                style={{
                  minWidth: "156px",
                  padding: "12px",
                  border: `1px solid ${selected ? "var(--accent-line)" : "var(--line)"}`,
                  borderRadius: "var(--r-2)",
                  background: selected ? "var(--accent-soft)" : "var(--bg-raised)",
                }}
              >
                <div className="row-between">
                  <span className="mono tiny" style={{ color: selected ? "var(--accent)" : "var(--text-3)" }}>
                    {noteSessionNumberLabel(session)}
                  </span>
                  {selected ? <span className="tiny">선택됨</span> : null}
                </div>
                <div className="small" style={{ marginTop: "4px", color: "var(--text)" }}>
                  {sessionBookTitle(session)}
                </div>
                <div className="tiny" style={{ marginTop: "2px" }}>
                  {formatDateOnlyLabel(session.date)} · {sessionRecordSummary(session)}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MobileSessionSheet({
  noteSessions,
  selectedSessionId,
  filter,
  query,
  onQueryChange,
  onClose,
  restoreFocusRef,
}: {
  noteSessions: NoteSessionItem[];
  selectedSessionId: string | null;
  filter: FeedFilter;
  query: string;
  onQueryChange: (query: string) => void;
  onClose: () => void;
  restoreFocusRef: RefObject<HTMLButtonElement | null>;
}) {
  const filteredSessions = noteSessions.filter((session) => sessionMatchesQuery(session, query));
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const restoreFocusElement = restoreFocusRef.current;
    const focusTarget = searchInputRef.current ?? closeButtonRef.current ?? dialogRef.current;
    focusTarget?.focus();

    return () => {
      if (restoreFocusElement?.isConnected) {
        restoreFocusElement.focus();
      }
    };
  }, [restoreFocusRef]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;
    const focusIsInsideDialog = activeElement instanceof Node && Boolean(dialogRef.current?.contains(activeElement));

    if (event.shiftKey) {
      if (activeElement === firstElement || !focusIsInsideDialog) {
        event.preventDefault();
        lastElement.focus();
      }
      return;
    }

    if (activeElement === lastElement || !focusIsInsideDialog) {
      event.preventDefault();
      firstElement.focus();
    }
  };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="notes-mobile-session-sheet-title"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "flex-end",
        background: "oklch(0 0 0 / 0.36)",
      }}
    >
      <div
        style={{
          width: "100%",
          maxHeight: "86vh",
          overflow: "hidden",
          borderRadius: "18px 18px 0 0",
          border: "1px solid var(--line)",
          background: "var(--bg)",
          boxShadow: "0 -12px 34px oklch(0 0 0 / 0.12)",
        }}
      >
        <div className="row-between" style={{ padding: "18px 18px 12px", borderBottom: "1px solid var(--line-soft)" }}>
          <h2 id="notes-mobile-session-sheet-title" className="h3 editorial" style={{ margin: 0 }}>
            전체 세션
          </h2>
          <button type="button" className="btn btn-quiet btn-sm" aria-label="전체 세션 닫기" onClick={onClose} ref={closeButtonRef}>
            닫기
          </button>
        </div>
        <div style={{ padding: "14px 18px 18px" }}>
          <label className="rm-sr-only" htmlFor="notes-mobile-session-search">
            전체 세션 검색
          </label>
          <input
            id="notes-mobile-session-search"
            type="search"
            ref={searchInputRef}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="책 제목 또는 No.06"
            style={{
              width: "100%",
              height: "40px",
              padding: "0 12px",
              border: "1px solid var(--line)",
              borderRadius: "var(--r-2)",
              background: "var(--bg-raised)",
              color: "var(--text)",
            }}
          />
        </div>
        <div style={{ maxHeight: "58vh", overflowY: "auto", padding: "0 18px 22px" }}>
          {noteSessions.length === 0 ? <SelectorEmptyState /> : null}
          {noteSessions.length > 0 && filteredSessions.length === 0 ? <SelectorSearchEmptyState /> : null}
          <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
            {filteredSessions.map((session, index) => (
              <SessionRow
                key={session.sessionId}
                session={session}
                selected={session.sessionId === selectedSessionId}
                filter={filter}
                showStrongTopBorder={index === 0}
                onClick={onClose}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="9" cy="9" r="5" />
      <path d="M13 13l4 4" />
    </svg>
  );
}
