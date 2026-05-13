import { type CSSProperties, useState } from "react";
import { scopedPublicLinkTarget } from "@/shared/routing/scoped-app-link-target";

export function DangerZone({
  variant = "desktop",
  onLeaveMembership,
}: {
  variant?: "desktop" | "mobile";
  onLeaveMembership: () => Promise<void>;
}) {
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveMessage, setLeaveMessage] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const isMobile = variant === "mobile";
  const actionButtonStyle: CSSProperties = { whiteSpace: "nowrap", flexShrink: 0 };

  const handleLeave = async () => {
    setIsLeaving(true);
    setLeaveError(null);

    try {
      await onLeaveMembership();
      setLeaveMessage("탈퇴 처리되었습니다.");
      globalThis.location.href = scopedPublicLinkTarget(globalThis.location.pathname, "/about");
    } catch {
      setLeaveError("탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setIsLeaving(false);
    }
  };

  return (
    <section className={isMobile ? "m-card-quiet" : "surface-quiet"} style={{ padding: isMobile ? "18px" : "22px" }}>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        계정 경계
      </div>
      <div className={isMobile ? "m-row-between" : "row-between"} style={{ gap: "16px", alignItems: "flex-start" }}>
        <div className="small" style={{ color: "var(--text-2)" }}>
          클럽 탈퇴 · 내 기록은 유지, 내 이름은 비공개 처리됩니다.
        </div>
        <button type="button" className="btn btn-ghost btn-sm" style={actionButtonStyle} onClick={() => setLeaveOpen((current) => !current)}>
          탈퇴
        </button>
      </div>
      {leaveOpen ? (
        <div className={isMobile ? "m-card" : "surface"} style={{ padding: "18px", marginTop: "16px" }}>
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            탈퇴하면 과거 기록은 보존되며, 다른 멤버에게는 작성자가 "탈퇴한 멤버"로 표시됩니다.
          </p>
          <div className={isMobile ? "m-row" : "row"} style={{ justifyContent: "flex-end", gap: "8px", marginTop: "14px" }}>
            <button type="button" className="btn btn-quiet btn-sm" style={actionButtonStyle} disabled={isLeaving} onClick={() => setLeaveOpen(false)}>
              취소
            </button>
            <button type="button" className="btn btn-primary btn-sm" style={actionButtonStyle} disabled={isLeaving} onClick={handleLeave}>
              탈퇴 확인
            </button>
          </div>
        </div>
      ) : null}
      {leaveMessage ? (
        <p role="status" className="small" style={{ color: "var(--ok)", margin: "14px 0 0" }}>
          {leaveMessage}
        </p>
      ) : null}
      {leaveError ? (
        <p role="alert" className="small" style={{ color: "var(--danger)", margin: "14px 0 0" }}>
          {leaveError}
        </p>
      ) : null}
    </section>
  );
}
