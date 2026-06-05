import type { HostPrepPace, HostPrepPaceTier } from "@/features/host/model/host-prep-pace";

const HOST_PREP_PACE_ACCENT: Record<HostPrepPaceTier, string> = {
  STEADY: "var(--ok)",
  ON_TRACK: "var(--ok)",
  TIGHT: "var(--accent)",
  URGENT: "var(--warn)",
  OVERDUE: "var(--warn)",
};

export function HostPrepPaceNote({ pace }: { pace: HostPrepPace }) {
  const accent = HOST_PREP_PACE_ACCENT[pace.tier];

  return (
    <div className="row" style={{ gap: "8px", marginTop: "10px", alignItems: "baseline" }}>
      <span
        className="tiny"
        aria-label={`준비 페이스: ${pace.label}`}
        style={{
          flexShrink: 0,
          padding: "2px 8px",
          borderRadius: "999px",
          fontWeight: 600,
          color: accent,
          background: "var(--surface-quiet, var(--bg-sub))",
          border: `1px solid ${accent}`,
        }}
      >
        {pace.label}
      </span>
      <span className="tiny" style={{ color: "var(--text-3)" }}>
        {pace.message}
      </span>
    </div>
  );
}
