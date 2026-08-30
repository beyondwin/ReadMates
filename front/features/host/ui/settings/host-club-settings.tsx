import { useState, type FormEvent } from "react";
import type { HostClubSettings as Settings, UpdateHostClubSettingsRequest } from "@/features/host/api/host-club-settings-contracts";

export function HostClubSettings({ settings, saving, stale, error, onSave }: { settings: Settings; saving: boolean; stale: boolean; error: string | null; onSave: (request: UpdateHostClubSettingsRequest) => Promise<unknown> }) {
  const [draft, setDraft] = useState(settings);
  function submit(event: FormEvent) {
    event.preventDefault();
    void onSave({ name: draft.name.trim(), approvalPolicy: draft.approvalPolicy, defaultTimezone: draft.defaultTimezone.trim(), scheduleReminderEnabled: draft.scheduleReminderEnabled, recordPublicationDefault: draft.recordPublicationDefault, expectedRevision: settings.revision, idempotencyKey: crypto.randomUUID() });
  }
  return <section className="surface-quiet stack rm-host-editorial-ledger__panel" aria-labelledby="club-settings-title">
    <div className="cluster"><h2 id="club-settings-title">클럽 기본 설정</h2><span className="small muted">revision {settings.revision}</span></div>
    {stale ? <p role="alert">다른 운영자가 먼저 변경했습니다. 최신 설정을 확인한 뒤 다시 저장해 주세요.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    <form className="stack" onSubmit={submit}>
      <label>클럽 이름<input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
      <label>가입 승인<select value={draft.approvalPolicy} onChange={(event) => setDraft({ ...draft, approvalPolicy: event.target.value as Settings["approvalPolicy"] })}><option value="INVITE_ONLY">초대 전용</option><option value="HOST_APPROVAL">운영자 승인</option></select></label>
      <label>기본 시간대<input required value={draft.defaultTimezone} onChange={(event) => setDraft({ ...draft, defaultTimezone: event.target.value })} /></label>
      <label><input type="checkbox" checked={draft.scheduleReminderEnabled} onChange={(event) => setDraft({ ...draft, scheduleReminderEnabled: event.target.checked })} /> 일정 알림 사용</label>
      <label>기록 기본 공개 범위<select value={draft.recordPublicationDefault} onChange={(event) => setDraft({ ...draft, recordPublicationDefault: event.target.value as Settings["recordPublicationDefault"] })}><option value="HOST_ONLY">운영진</option><option value="MEMBER">멤버</option><option value="PUBLIC">공개</option></select></label>
      <button className="btn" disabled={saving} type="submit">설정 저장</button>
    </form>
  </section>;
}
