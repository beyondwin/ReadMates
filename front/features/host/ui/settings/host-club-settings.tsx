import { useState, type FormEvent } from "react";
import type { HostSettingsView as Settings } from "@/features/host/model/host-settings-model";
import { ReadmatesIcon } from "@/shared/ui/icon";

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

  function toggleField(field: string) {
    setOpenField(openField === field ? null : field);
  }

  return (
    <section className="rm-host-settings" aria-labelledby="club-settings-title" data-revision={settings.revision}>
      <h2 id="club-settings-title">클럽 설정</h2>
      {stale ? <p role="alert">다른 운영자가 먼저 변경했습니다. 최신 설정을 확인한 뒤 다시 저장해 주세요.</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <form className="stack" onSubmit={submit}>
        <dl>
          <div>
            <dt>클럽 이름</dt>
            <dd>{draft.name}</dd>
            <button type="button" className="rm-host-settings__edit" onClick={() => toggleField("name")}>수정</button>
          </div>
          {openField === "name" ? (
            <div className="rm-host-settings__editor">
              <label>클럽 이름<input required value={draft.name} onChange={(event) => onDraftChange({ ...draft, name: event.target.value })} /></label>
              <button disabled={saving} type="submit">적용</button>
            </div>
          ) : null}
          <div>
            <dt>가입 승인</dt>
            <dd>{approvalCopy[draft.approvalPolicy]}</dd>
            <button type="button" className="rm-host-settings__edit" onClick={() => toggleField("approval")}>변경</button>
          </div>
          {openField === "approval" ? (
            <div className="rm-host-settings__editor">
              <label>가입 승인<select value={draft.approvalPolicy} onChange={(event) => onDraftChange({ ...draft, approvalPolicy: event.target.value as Settings["approvalPolicy"] })}><option value="INVITE_ONLY">초대 전용</option><option value="HOST_APPROVAL">운영자 승인</option></select></label>
              <button disabled={saving} type="submit">적용</button>
            </div>
          ) : null}
          <div>
            <dt>기본 시간대</dt>
            <dd>{draft.defaultTimezone}</dd>
            <button type="button" className="rm-host-settings__edit" onClick={() => toggleField("timezone")}>변경</button>
          </div>
          {openField === "timezone" ? (
            <div className="rm-host-settings__editor">
              <label>기본 시간대<input required value={draft.defaultTimezone} onChange={(event) => onDraftChange({ ...draft, defaultTimezone: event.target.value })} /></label>
              <button disabled={saving} type="submit">적용</button>
            </div>
          ) : null}
          <div>
            <dt>일정 리마인드</dt>
            <dd>{draft.scheduleReminderEnabled ? "사용 중 · 멤버 수신 설정에 따름" : "사용 안 함"}</dd>
            <button type="button" className="rm-host-settings__edit" onClick={() => toggleField("reminder")}>설정</button>
          </div>
          {openField === "reminder" ? (
            <div className="rm-host-settings__editor">
              <label><input type="checkbox" checked={draft.scheduleReminderEnabled} onChange={(event) => onDraftChange({ ...draft, scheduleReminderEnabled: event.target.checked })} /> 일정 알림 사용</label>
              <button disabled={saving} type="submit">적용</button>
            </div>
          ) : null}
          <div>
            <dt>기록 기본 공개 범위</dt>
            <dd>{publicationCopy[draft.recordPublicationDefault]}</dd>
            <button type="button" className="rm-host-settings__edit" onClick={() => toggleField("publication")}>변경</button>
          </div>
          {openField === "publication" ? (
            <div className="rm-host-settings__editor">
              <label>기록 기본 공개 범위<select value={draft.recordPublicationDefault} onChange={(event) => onDraftChange({ ...draft, recordPublicationDefault: event.target.value as Settings["recordPublicationDefault"] })}><option value="HOST_ONLY">운영진</option><option value="MEMBER">멤버</option><option value="PUBLIC">공개</option></select></label>
              <button disabled={saving} type="submit">적용</button>
            </div>
          ) : null}
        </dl>
        <h3>권한과 운영</h3>
        <dl>
          <div>
            <dt>공동 호스트</dt>
            <dd>{hostCount ?? "—"}</dd>
            <button type="button" className="rm-host-settings__edit" onClick={onManageHosts}>관리</button>
          </div>
          <div>
            <dt>변경 이력</dt>
            <dd />
            <button type="button" className="rm-host-settings__edit" onClick={onOpenHistory}>열기</button>
          </div>
        </dl>
      </form>
      <button type="button" className="rm-host-settings__end" aria-label="클럽 운영 종료" onClick={onCloseReview}>
        <span>
          클럽 운영 종료
          <p>기록 보존 정책을 확인한 뒤 진행해요.</p>
        </span>
        <ReadmatesIcon name="chevron-right" size={24} />
      </button>
    </section>
  );
}
