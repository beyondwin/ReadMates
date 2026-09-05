import type { HostCoHostMemberView } from "@/features/host/model/host-settings-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";

export function HostCoHostManagement({
  settingsRevision,
  members,
  busy,
  alert,
  canRetry,
  onChange,
  onRefresh,
  onRetryCommand,
}: {
  settingsRevision: number;
  members: HostCoHostMemberView[];
  busy: boolean;
  alert: string | null;
  canRetry: boolean;
  onChange: (member: HostCoHostMemberView) => void;
  onRefresh: () => void;
  onRetryCommand: () => void;
}) {
  return (
    <section className="surface-quiet stack rm-host-editorial-ledger__panel" aria-labelledby="co-host-title" data-settings-revision={settingsRevision}>
      <div className="cluster">
        <h2 id="co-host-title">공동 호스트 관리</h2>
      </div>
      <p className="small muted">현재 멤버 원장의 공개 가능한 신원과 역할만 표시합니다.</p>
      {alert ? (
        <div role="alert" className="stack">
          <p>{alert}</p>
          <button type="button" onClick={onRefresh}>최신 운영 상태 확인</button>
          {canRetry ? <button disabled={busy} type="button" onClick={onRetryCommand}>같은 권한 변경 요청 다시 확인</button> : null}
        </div>
      ) : null}
      <div className="stack">
        {members.map((member) => (
          <article className="surface cluster" key={member.membershipId}>
            <AvatarChip avatarKey={member.avatarKey} name={member.displayName} label="" sizeRole="member" />
            <span><strong>{member.displayName}</strong> <span className="small muted">{member.status} · {member.role}</span></span>
            <button
              className="btn-quiet"
              type="button"
              disabled={busy || member.status !== "ACTIVE"}
              aria-label={`${member.displayName} 공동 호스트 ${member.role === "HOST" ? "해제" : "지정"}`}
              onClick={() => onChange(member)}
            >
              {member.role === "HOST" ? "호스트 해제 요청" : "공동 호스트 지정"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
