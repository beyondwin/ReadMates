import { useState, type FormEvent } from "react";
import type { HostSettingsView as Settings } from "@/features/host/model/host-settings-model";

const approvalCopy: Record<Settings["approvalPolicy"], string> = {
  INVITE_ONLY: "초대 전용",
  HOST_APPROVAL: "호스트가 직접 승인",
};

const publicationCopy: Record<Settings["recordPublicationDefault"], string> = {
  HOST_ONLY: "운영진",
  MEMBER: "멤버에게만 공개",
  PUBLIC: "공개",
};

export function HostClubSettings({
  settings,
  draft,
  saving,
  stale,
  error,
  onDraftChange,
  onSave,
  hostCount,
  onManageHosts,
  onOpenHistory,
  onCloseReview,
}: {
  settings: Settings;
  draft: Settings;
  saving: boolean;
  stale: boolean;
  error: string | null;
  onDraftChange: (draft: Settings) => void;
  onSave: () => void;
  hostCount?: string;
  onManageHosts?: () => void;
  onOpenHistory?: () => void;
  onCloseReview?: () => void;
}) {
  const [openField, setOpenField] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave();
  }

  return (
    <section className="stack rm-host-editorial-ledger__panel" aria-labelledby="club-settings-title" data-revision={settings.revision}>
      <div className="cluster">
        <h2 id="club-settings-title">클럽 설정</h2>
        <span className="small muted">revision {settings.revision}</span>
      </div>
      {stale ? <p role="alert">다른 운영자가 먼저 변경했습니다. 최신 설정을 확인한 뒤 다시 저장해 주세요.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <form className="stack rm-host-editorial-ledger__form" onSubmit={submit}>
        <div className="rm-host-editorial-ledger__row">
          <span>클럽 이름</span>
          <span>{draft.name}</span>
          <button type="button" className="btn-quiet" onClick={() => setOpenField(openField === "name" ? null : "name")}>수정</button>
        </div>
        <label className={openField === "name" ? undefined : "sr-only"}>클럽 이름<input required value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} /></label>
        <div className="rm-host-editorial-ledger__row">
          <span>가입 승인</span>
          <span>{approvalCopy[draft.approvalPolicy]}</span>
          <button type="button" className="btn-quiet" onClick={() => setOpenField(openField === "approval" ? null : "approval")}>변경</button>
        </div>
        <label className={openField === "approval" ? undefined : "sr-only"}>가입 승인<select value={draft.approvalPolicy} onChange={(event) => onDraftChange({ ...draft, approvalPolicy: event.target.value as Settings["approvalPolicy"] })}><option value="INVITE_ONLY">초대 전용</option><option value="HOST_APPROVAL">운영자 승인</option></select></label>
        <div className="rm-host-editorial-ledger__row">
          <span>기본 시간대</span>
          <span>{draft.defaultTimezone}</span>
          <button type="button" className="btn-quiet" onClick={() => setOpenField(openField === "timezone" ? null : "timezone")}>변경</button>
        </div>
        <label className={openField === "timezone" ? undefined : "sr-only"}>기본 시간대<input required value={draft.defaultTimezone} onChange={(event) => onDraftChange({ ...draft, defaultTimezone: event.target.value })} /></label>
        <div className="rm-host-editorial-ledger__row">
          <span>일정 리마인드</span>
          <span>{draft.scheduleReminderEnabled ? "사용 중 · 멤버 수신 설정에 따름" : "사용 안 함"}</span>
          <button type="button" className="btn-quiet" onClick={() => setOpenField(openField === "reminder" ? null : "reminder")}>설정</button>
        </div>
        <label className={openField === "reminder" ? undefined : "sr-only"}><input type="checkbox" checked={draft.scheduleReminderEnabled} onChange={(event) => onDraftChange({ ...draft, scheduleReminderEnabled: event.target.checked })} /> 일정 알림 사용</label>
        <div className="rm-host-editorial-ledger__row">
          <span>기록 공개 기본값</span>
          <span>{publicationCopy[draft.recordPublicationDefault]}</span>
          <button type="button" className="btn-quiet" onClick={() => setOpenField(openField === "publication" ? null : "publication")}>변경</button>
        </div>
        <label className={openField === "publication" ? undefined : "sr-only"}>기록 공개 기본값<select value={draft.recordPublicationDefault} onChange={(event) => onDraftChange({ ...draft, recordPublicationDefault: event.target.value as Settings["recordPublicationDefault"] })}><option value="HOST_ONLY">운영진</option><option value="MEMBER">멤버</option><option value="PUBLIC">공개</option></select></label>
        <h3 className="rm-host-records-ledger__title">권한과 운영</h3>
        <div className="rm-host-editorial-ledger__row">
          <span>공동 호스트</span>
          <span>{hostCount ?? "—"}</span>
          <button type="button" className="btn-quiet" onClick={onManageHosts}>관리</button>
        </div>
        <div className="rm-host-editorial-ledger__row">
          <span>변경 이력</span>
          <span />
          <button type="button" className="btn-quiet" onClick={onOpenHistory}>열기</button>
        </div>
        <button className="btn" disabled={saving} type="submit">설정 저장</button>
      </form>
      <section className="rm-host-club-close" aria-labelledby="club-close-title">
        <h2 id="club-close-title">클럽 운영 종료</h2>
        <p className="small muted">기록 보존 정책을 확인한 뒤 진행해요.</p>
        <button className="btn-quiet" type="button" onClick={onCloseReview}>종료 검토</button>
      </section>
    </section>
  );
}
