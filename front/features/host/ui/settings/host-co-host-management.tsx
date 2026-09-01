import { useState } from "react";
import type {
  HostCoHostChangeRequest,
  HostCoHostMemberView,
} from "@/features/host/model/host-settings-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";

type ChangeFailureKind = "stale" | "permission" | "unknown" | "rejected";

export function HostCoHostManagement({
  settingsRevision,
  members,
  busy,
  onChange,
  onRefresh,
  classifyChangeError = () => "unknown",
}: {
  settingsRevision: number;
  members: HostCoHostMemberView[];
  busy: boolean;
  onChange: (request: HostCoHostChangeRequest) => Promise<unknown>;
  onRefresh: () => Promise<unknown> | void;
  classifyChangeError?: (error: unknown) => ChangeFailureKind;
}) {
  const [pending, setPending] = useState<HostCoHostChangeRequest | null>(null);
  const [alert, setAlert] = useState<string | null>(null);

  async function run(request: HostCoHostChangeRequest) {
    setAlert(null);
    try {
      await onChange(request);
      setPending(null);
      await onRefresh();
    } catch (error) {
      const failure = classifyChangeError(error);
      setPending(failure === "unknown" ? request : null);
      await onRefresh();
      setAlert(failure === "permission"
        ? "서버가 현재 호스트 권한 변경을 허용하지 않았습니다. 최신 운영 상태를 확인해 주세요."
        : failure === "stale"
          ? "설정 revision이 변경되었습니다. 최신 운영 상태에서 새 요청을 만들어 주세요."
          : failure === "unknown"
            ? "권한 변경 결과를 확인할 수 없습니다. 최신 상태를 확인한 뒤 같은 요청으로 다시 확인할 수 있습니다."
            : "서버가 권한 변경 요청을 거절했습니다. 최신 운영 상태에서 새 요청을 만들어 주세요.");
    }
  }

  function requestChange(member: HostCoHostMemberView) {
    void run({
      membershipId: member.membershipId,
      action: member.role === "HOST" ? "demote" : "promote",
      expectedRevision: settingsRevision,
      idempotencyKey: crypto.randomUUID(),
    });
  }

  return (
    <section className="surface-quiet stack rm-host-editorial-ledger__panel" aria-labelledby="co-host-title">
      <div className="cluster">
        <h2 id="co-host-title">공동 호스트 관리</h2>
        <span className="small muted">settings revision {settingsRevision}</span>
      </div>
      <p className="small muted">현재 멤버 원장의 공개 가능한 신원과 역할만 표시합니다.</p>
      {alert ? (
        <div role="alert" className="stack">
          <p>{alert}</p>
          <button type="button" onClick={() => { void onRefresh(); }}>최신 운영 상태 확인</button>
          {pending ? (
            <button disabled={busy} type="button" onClick={() => { void run(pending); }}>
              같은 권한 변경 요청 다시 확인
            </button>
          ) : null}
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
              onClick={() => requestChange(member)}
            >
              {member.role === "HOST" ? "호스트 해제 요청" : "공동 호스트 지정"}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
