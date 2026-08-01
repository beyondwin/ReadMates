import type { CSSProperties } from "react";
import type { SessionState } from "@/shared/model/readmates-types";
import {
  sessionExposureCopy,
  type PublicSiteVisibility,
  type SessionAccessScope,
} from "@/features/host/model/session-exposure-model";

export function SessionExposureControls({
  state,
  accessScope,
  siteVisibility,
  onAccessScopeChange,
  onSiteVisibilityChange,
  disabled = false,
}: {
  state: SessionState;
  accessScope: SessionAccessScope;
  siteVisibility: PublicSiteVisibility;
  onAccessScopeChange: (accessScope: SessionAccessScope) => void;
  onSiteVisibilityChange: (siteVisibility: PublicSiteVisibility) => void;
  disabled?: boolean;
}) {
  const canPlaceOnPublicSite = state === "CLOSED" || state === "PUBLISHED";

  return (
    <div className="stack" style={{ "--stack": "10px" } as CSSProperties}>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label">게스트 접근</legend>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          {(["HOST_ONLY", "GUEST_READABLE"] as const).map((value) => (
            <label className="small" key={value}>
              <input
                type="radio"
                name="session-access-scope"
                checked={accessScope === value}
                disabled={disabled}
                onChange={() => onAccessScopeChange(value)}
              />{" "}
              {sessionExposureCopy(value, siteVisibility).accessLabel}
            </label>
          ))}
        </div>
      </fieldset>
      {canPlaceOnPublicSite ? (
        <label className="small">
          <input
            type="checkbox"
            checked={siteVisibility === "PUBLIC_RECORD"}
            disabled={disabled || accessScope === "HOST_ONLY"}
            onChange={(event) => onSiteVisibilityChange(event.target.checked ? "PUBLIC_RECORD" : "HIDDEN")}
          />{" "}
          공개 기록에 게시
        </label>
      ) : null}
    </div>
  );
}
