import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import {
  beginHostMeetingFilterCommit,
  commitHostMeetingAttendanceRow,
  commitHostMeetingFilterRaf,
} from "@/shared/observability/host-meeting-performance";
import {
  WorkspaceUndoBar,
  type WorkspacePendingUndo,
} from "@/features/host/ui/session-workspace/workspace-undo-bar";
import "./meeting-response-ledger.css";

type Response = "GOING" | "NOT_GOING" | "UNSURE" | "NO_RESPONSE";
export type MeetingAttendance = "ATTENDED" | "ABSENT" | "UNKNOWN";
export type MeetingResponseLedgerPresentation = "default" | "meetingDay" | "attendanceBoard";
type MeetingDayFilter = "pending" | "arrived" | "all";

export type MeetingResponseLedgerRow = {
  membershipId: string;
  displayName: string;
  secondaryLabel: string;
  avatarKey?: string | null;
  response: Response;
  attendance: MeetingAttendance;
  attendanceRevision: number;
  questionCount: number | null;
  recentResponseLabel: string | null;
  writeState?: "idle" | "saving" | "saved" | "error" | "conflict";
};

export type MeetingResponseLedgerAttendeeInput = {
  membershipId: string;
  displayName: string;
  accountName?: string | null;
  avatarKey?: string | null;
  rsvpStatus: "NO_RESPONSE" | "GOING" | "MAYBE" | "DECLINED";
  attendanceStatus: MeetingAttendance;
  attendanceRevision: number;
  participationStatus?: "ACTIVE" | "EXCLUDED" | string | null;
};

const responseLabel: Record<Response, string> = {
  GOING: "참석",
  NOT_GOING: "불참",
  UNSURE: "미정",
  NO_RESPONSE: "미응답",
};
const attendanceLabel: Record<MeetingAttendance, string> = {
  ATTENDED: "출석",
  ABSENT: "불참",
  UNKNOWN: "확인 전",
};

function isPendingAttendance(attendance: MeetingAttendance): boolean {
  return attendance === "UNKNOWN";
}

export function MeetingResponseLedger({
  rows,
  onAttendanceChange,
  onBulkAttendanceChange,
  presentation = "default",
  pendingUndo = null,
  agendaHref = null,
}: {
  rows: ReadonlyArray<MeetingResponseLedgerRow>;
  onAttendanceChange: (membershipId: string, attendance: MeetingAttendance) => void;
  onBulkAttendanceChange: (membershipIds: ReadonlyArray<string>, attendance: MeetingAttendance) => void;
  presentation?: MeetingResponseLedgerPresentation;
  pendingUndo?: WorkspacePendingUndo | null;
  agendaHref?: string | null;
}) {
  if (presentation === "attendanceBoard") {
    return (
      <AttendanceBoardLedger
        rows={rows}
        onAttendanceChange={onAttendanceChange}
        onBulkAttendanceChange={onBulkAttendanceChange}
        pendingUndo={pendingUndo}
        agendaHref={agendaHref}
      />
    );
  }

  if (presentation === "meetingDay") {
    return (
      <MeetingDayResponseLedger
        rows={rows}
        onAttendanceChange={onAttendanceChange}
        onBulkAttendanceChange={onBulkAttendanceChange}
        pendingUndo={pendingUndo}
      />
    );
  }

  return (
    <DefaultMeetingResponseLedger
      rows={rows}
      onAttendanceChange={onAttendanceChange}
      onBulkAttendanceChange={onBulkAttendanceChange}
    />
  );
}

const attendanceBoardChoices = [
  { attendance: "ATTENDED" as const, label: "참석" },
  { attendance: "ABSENT" as const, label: "불참" },
  { attendance: "UNKNOWN" as const, label: "미확인" },
] as const;

function rsvpFactLabel(response: Response): string {
  if (response === "GOING") return "참석 응답";
  if (response === "NOT_GOING") return "불참 응답";
  if (response === "UNSURE") return "미정 응답";
  return "미응답";
}

function AttendanceBoardLedger({
  rows,
  onAttendanceChange,
  onBulkAttendanceChange,
  pendingUndo,
  agendaHref,
}: {
  rows: ReadonlyArray<MeetingResponseLedgerRow>;
  onAttendanceChange: (membershipId: string, attendance: MeetingAttendance) => void;
  onBulkAttendanceChange: (membershipIds: ReadonlyArray<string>, attendance: MeetingAttendance) => void;
  pendingUndo: WorkspacePendingUndo | null;
  agendaHref: string | null;
}) {
  const pendingIds = useMemo(
    () => rows.filter((row) => isPendingAttendance(row.attendance)).map((row) => row.membershipId),
    [rows],
  );
  const counts = useMemo(() => ({
    pending: pendingIds.length,
    attended: rows.filter((row) => row.attendance === "ATTENDED").length,
    all: rows.length,
  }), [pendingIds.length, rows]);

  useLayoutEffect(() => {
    commitHostMeetingAttendanceRow(rows);
  }, [rows]);

  const boardUndo = pendingUndo
    ? { ...pendingUndo, undoLabel: pendingUndo.undoLabel ?? "실행 취소" }
    : null;

  return (
    <section
      className="rm-meeting-response-ledger rm-meeting-response-ledger--attendance-board"
      aria-labelledby="meeting-day-attendance-title"
    >
      <div className="rm-meeting-response-ledger__head">
        <p className="rm-meeting-response-ledger__eyebrow">현장 운영</p>
        <div className="rm-meeting-response-ledger__title-row">
          <h2 id="meeting-day-attendance-title" className="h2 editorial">출석 확인</h2>
          {agendaHref ? (
            <a className="rm-meeting-response-ledger__agenda" href={agendaHref}>진행 순서 보기</a>
          ) : null}
        </div>
        <p className="rm-meeting-response-ledger__summary">
          실제 출석 {counts.attended} / {counts.all} · 확인 필요 {counts.pending}
        </p>
        <p className="rm-meeting-response-ledger__note">참석 응답과 실제 출석은 별개로 기록해요.</p>
      </div>

      {rows.length === 0 ? (
        <p role="status" className="rm-meeting-panel-state">조건에 맞는 참여자가 없습니다.</p>
      ) : (
        <ul className="rm-meeting-response-ledger__rows">
          {rows.map((row) => (
            <li key={row.membershipId} className="rm-meeting-response-ledger__row rm-meeting-response-ledger__row--board">
              <div className="rm-meeting-response-ledger__person">
                {row.avatarKey ? (
                  <AvatarChip
                    avatarKey={row.avatarKey}
                    name={row.displayName}
                    label=""
                    sizeRole="roster"
                  />
                ) : null}
                <span className="rm-meeting-response-ledger__person-copy">
                  <strong>{row.displayName}</strong>
                  <span className="small muted">{rsvpFactLabel(row.response)}</span>
                </span>
              </div>
              <div
                className="rm-meeting-response-ledger__attendance-group"
                role="group"
                aria-label={`${row.displayName} 실제 출석`}
              >
                {attendanceBoardChoices.map((choice) => (
                  <button
                    key={choice.attendance}
                    type="button"
                    className="rm-meeting-response-ledger__attendance-choice"
                    data-attendance={choice.attendance}
                    aria-label={`${row.displayName} ${choice.label}`}
                    aria-pressed={row.attendance === choice.attendance}
                    disabled={row.writeState === "saving"}
                    onClick={() => {
                      if (row.attendance === choice.attendance) return;
                      onAttendanceChange(row.membershipId, choice.attendance);
                    }}
                  >
                    {choice.label}
                  </button>
                ))}
              </div>
              {row.writeState === "saving" ? <span role="status" className="small">저장 중</span> : null}
              {row.writeState === "error" ? <span role="alert" className="small">저장하지 못했습니다. 다시 선택해 주세요.</span> : null}
              {row.writeState === "conflict" ? <span role="alert" className="small">최신 출석 상태와 충돌했습니다. 새로 확인해 주세요.</span> : null}
            </li>
          ))}
        </ul>
      )}

      {counts.pending > 0 ? (
        <div className="rm-meeting-response-ledger__bulk rm-meeting-response-ledger__bulk--meeting-day">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => onBulkAttendanceChange(pendingIds, "ATTENDED")}
          >
            나머지 {counts.pending}명 모두 참석으로 표시
          </button>
        </div>
      ) : null}

      <p className="rm-meeting-response-ledger__save-hint">선택하면 바로 저장돼요.</p>
      <WorkspaceUndoBar pendingUndo={boardUndo} />
    </section>
  );
}

function MeetingDayResponseLedger({
  rows,
  onAttendanceChange,
  onBulkAttendanceChange,
  pendingUndo,
}: {
  rows: ReadonlyArray<MeetingResponseLedgerRow>;
  onAttendanceChange: (membershipId: string, attendance: MeetingAttendance) => void;
  onBulkAttendanceChange: (membershipIds: ReadonlyArray<string>, attendance: MeetingAttendance) => void;
  pendingUndo: WorkspacePendingUndo | null;
}) {
  const [filter, setFilter] = useState<MeetingDayFilter>("pending");
  const pendingIds = useMemo(
    () => rows.filter((row) => isPendingAttendance(row.attendance)).map((row) => row.membershipId),
    [rows],
  );
  const counts = useMemo(() => ({
    pending: pendingIds.length,
    arrived: rows.filter((row) => row.attendance === "ATTENDED").length,
    all: rows.length,
  }), [pendingIds.length, rows]);
  const visible = useMemo(() => {
    if (filter === "pending") return rows.filter((row) => isPendingAttendance(row.attendance));
    if (filter === "arrived") return rows.filter((row) => row.attendance === "ATTENDED");
    return rows;
  }, [filter, rows]);

  useLayoutEffect(() => {
    commitHostMeetingAttendanceRow(rows);
  }, [rows]);

  return (
    <section
      className="rm-meeting-response-ledger rm-meeting-response-ledger--meeting-day"
      aria-labelledby="meeting-day-attendance-title"
    >
      <div className="rm-meeting-response-ledger__head">
        <div>
          <h2 id="meeting-day-attendance-title" className="h2 editorial">출석 확인</h2>
        </div>
        <div className="rm-meeting-response-ledger__segments" role="group" aria-label="출석 필터">
          <button
            type="button"
            className="rm-meeting-response-ledger__segment"
            aria-pressed={filter === "pending"}
            onClick={() => setFilter("pending")}
          >
            아직 안 옴 {counts.pending}
          </button>
          <button
            type="button"
            className="rm-meeting-response-ledger__segment"
            aria-pressed={filter === "arrived"}
            onClick={() => setFilter("arrived")}
          >
            도착 {counts.arrived}
          </button>
          <button
            type="button"
            className="rm-meeting-response-ledger__segment"
            aria-pressed={filter === "all"}
            onClick={() => setFilter("all")}
          >
            전체 {counts.all}
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <p role="status" className="rm-meeting-panel-state">조건에 맞는 참여자가 없습니다.</p>
      ) : (
        <ul className="rm-meeting-response-ledger__rows">
          {visible.map((row) => {
            const arrived = row.attendance === "ATTENDED";
            const label = arrived
              ? `${row.displayName} · 도착함`
              : `${row.displayName} · 도착으로 표시`;
            return (
              <li key={row.membershipId} className="rm-meeting-response-ledger__row rm-meeting-response-ledger__row--checkin">
                <button
                  type="button"
                  className={`rm-meeting-response-ledger__checkin${arrived ? " is-arrived" : ""}`}
                  aria-label={label}
                  disabled={row.writeState === "saving" || arrived}
                  onClick={() => onAttendanceChange(row.membershipId, "ATTENDED")}
                >
                  <span className="rm-meeting-response-ledger__person">
                    <strong>{row.displayName}</strong>
                    <span className="small muted">
                      {arrived ? "도착함" : `${responseLabel[row.response]} 응답`}
                    </span>
                  </span>
                  <span className="rm-meeting-response-ledger__checkin-action">
                    {arrived ? "도착함" : "도착"}
                  </span>
                </button>
                <label className="rm-meeting-response-ledger__correction">
                  <span>실제 출석</span>
                  <select
                    aria-label={`${row.displayName} 실제 출석`}
                    value={row.attendance}
                    disabled={row.writeState === "saving"}
                    onChange={(event) => onAttendanceChange(
                      row.membershipId,
                      event.currentTarget.value as MeetingAttendance,
                    )}
                  >
                    <option value="UNKNOWN">확인 전</option>
                    <option value="ATTENDED">출석</option>
                    <option value="ABSENT">불참</option>
                  </select>
                </label>
                {row.writeState === "saving" ? <span role="status" className="small">저장 중</span> : null}
                {row.writeState === "error" ? <span role="alert" className="small">저장하지 못했습니다. 다시 선택해 주세요.</span> : null}
                {row.writeState === "conflict" ? <span role="alert" className="small">최신 출석 상태와 충돌했습니다. 새로 확인해 주세요.</span> : null}
              </li>
            );
          })}
        </ul>
      )}

      {counts.pending > 0 ? (
        <div className="rm-meeting-response-ledger__bulk rm-meeting-response-ledger__bulk--meeting-day">
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => onBulkAttendanceChange(pendingIds, "ATTENDED")}
          >
            나머지 {counts.pending}명 모두 참석
          </button>
        </div>
      ) : null}

      <WorkspaceUndoBar pendingUndo={pendingUndo} />
    </section>
  );
}

function DefaultMeetingResponseLedger({
  rows,
  onAttendanceChange,
  onBulkAttendanceChange,
}: {
  rows: ReadonlyArray<MeetingResponseLedgerRow>;
  onAttendanceChange: (membershipId: string, attendance: MeetingAttendance) => void;
  onBulkAttendanceChange: (membershipIds: ReadonlyArray<string>, attendance: MeetingAttendance) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Response | "ALL">("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkTarget, setBulkTarget] = useState<MeetingAttendance | null>(null);
  const pendingFilterCommitRef = useRef(false);
  const visible = useMemo(() => rows.filter((row) => {
    const matchesQuery = `${row.displayName} ${row.secondaryLabel}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
    return matchesQuery && (filter === "ALL" || row.response === filter);
  }), [filter, query, rows]);
  const totals = useMemo(() => Object.fromEntries(
    (["GOING", "UNSURE", "NOT_GOING", "NO_RESPONSE"] as const).map((status) => [
      status,
      rows.filter((row) => row.response === status).length,
    ]),
  ) as Record<Response, number>, [rows]);

  useLayoutEffect(() => {
    commitHostMeetingAttendanceRow(rows);
  }, [rows]);

  useLayoutEffect(() => {
    if (!pendingFilterCommitRef.current) return;
    pendingFilterCommitRef.current = false;
    const frame = requestAnimationFrame(() => commitHostMeetingFilterRaf());
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const beginFilterCommit = () => {
    pendingFilterCommitRef.current = true;
    beginHostMeetingFilterCommit();
  };

  return (
    <section className="rm-meeting-response-ledger" aria-labelledby="meeting-response-ledger-title">
      <div className="rm-meeting-response-ledger__head">
        <div>
          <h2 id="meeting-response-ledger-title" className="h2 editorial">참여자 기록</h2>
          <p role="status" aria-label="참석 응답 합계" className="small rm-meeting-response-ledger__totals">
            참석 {totals.GOING} · 미정 {totals.UNSURE} · 불참 {totals.NOT_GOING} · 미응답 {totals.NO_RESPONSE}
          </p>
        </div>
        <div className="rm-meeting-response-ledger__tools">
          <label>
            <span className="sr-only">참여자 검색</span>
            <input type="search" aria-label="참여자 검색" value={query} onChange={(event) => {
              beginFilterCommit();
              setQuery(event.currentTarget.value);
            }} placeholder="이름으로 찾기" />
          </label>
          <label>
            <span className="sr-only">참석 응답 필터</span>
            <select aria-label="참석 응답 필터" value={filter} onChange={(event) => {
              beginFilterCommit();
              setFilter(event.currentTarget.value as Response | "ALL");
            }}>
              <option value="ALL">모든 응답</option>
              <option value="GOING">참석</option>
              <option value="UNSURE">미정</option>
              <option value="NOT_GOING">불참</option>
              <option value="NO_RESPONSE">미응답</option>
            </select>
          </label>
        </div>
      </div>
      {selected.size > 0 ? (
        <div className="rm-meeting-response-ledger__bulk" role="group" aria-label="선택한 참여자 실제 출석 변경">
          <span>{selected.size}명 선택</span>
          {(["ATTENDED", "ABSENT", "UNKNOWN"] as const).map((status) => (
            <button key={status} type="button" className="btn btn-quiet btn-sm" onClick={() => setBulkTarget(status)}>
              {attendanceLabel[status]}으로 변경
            </button>
          ))}
        </div>
      ) : null}
      {visible.length === 0 ? (
        <p role="status" className="rm-meeting-panel-state">조건에 맞는 참여자가 없습니다.</p>
      ) : (
        <ul className="rm-meeting-response-ledger__rows">
          {visible.map((row) => (
            <li key={row.membershipId} aria-label={`${row.displayName} · ${row.secondaryLabel}`} className="rm-meeting-response-ledger__row">
              <label className="rm-meeting-response-ledger__select">
                <input
                  type="checkbox"
                  aria-label={`${row.displayName} 선택`}
                  checked={selected.has(row.membershipId)}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(row.membershipId);
                      else next.delete(row.membershipId);
                      return next;
                    });
                  }}
                />
              </label>
              <div className="rm-meeting-response-ledger__person">
                <strong>{row.displayName}</strong>
                <span className="small muted">{row.secondaryLabel}</span>
              </div>
              <dl className="rm-meeting-response-ledger__facts">
                <div><dt>참석 응답</dt><dd>{responseLabel[row.response]}</dd></div>
                <div><dt>질문</dt><dd>{row.questionCount === null ? "확인 전" : `${row.questionCount}개`}</dd></div>
                <div><dt>최근 응답</dt><dd>{row.recentResponseLabel ?? "기록 없음"}</dd></div>
              </dl>
              <label className="rm-meeting-response-ledger__attendance">
                <span>실제 출석</span>
                <select
                  aria-label={`${row.displayName} 실제 출석`}
                  value={row.attendance}
                  disabled={row.writeState === "saving"}
                  onChange={(event) => onAttendanceChange(row.membershipId, event.currentTarget.value as MeetingAttendance)}
                >
                  <option value="UNKNOWN">확인 전</option>
                  <option value="ATTENDED">출석</option>
                  <option value="ABSENT">불참</option>
                </select>
              </label>
              {row.writeState === "saving" ? <span role="status" className="small">저장 중</span> : null}
              {row.writeState === "saved" ? <span role="status" className="small">저장됨</span> : null}
              {row.writeState === "error" ? <span role="alert" className="small">저장하지 못했습니다. 다시 선택해 주세요.</span> : null}
              {row.writeState === "conflict" ? <span role="alert" className="small">최신 출석 상태와 충돌했습니다. 새로 확인해 주세요.</span> : null}
            </li>
          ))}
        </ul>
      )}
      {bulkTarget ? (
        <div className="rm-host-action-dialog-backdrop" role="presentation">
          <section
            className="rm-host-action-dialog-sheet stack"
            style={{ width: "min(440px, 100%)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-bulk-attendance-confirm-title"
            onKeyDown={(event) => {
              if (event.key === "Escape") setBulkTarget(null);
            }}
          >
            <h2 id="meeting-bulk-attendance-confirm-title" className="h2 editorial">일괄 실제 출석 변경 확인</h2>
            <p style={{ margin: 0 }}>
              선택한 {selected.size}명을 <strong>{attendanceLabel[bulkTarget]}</strong>으로 변경합니다.
            </p>
            <p className="small muted" style={{ margin: 0 }}>확인한 뒤에만 출석 상태를 저장합니다.</p>
            <div className="row wrap" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-quiet" autoFocus onClick={() => setBulkTarget(null)}>취소</button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onBulkAttendanceChange([...selected], bulkTarget);
                  setBulkTarget(null);
                  setSelected(new Set());
                }}
              >
                {selected.size}명을 {attendanceLabel[bulkTarget]}으로 변경
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
