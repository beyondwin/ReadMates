export type AdminSupportSearchResult = {
  subjectId: string;
  displayName: string;
  maskedEmail: string;
  kind: string;
  platformAdminRole: "OWNER" | "OPERATOR" | "SUPPORT" | null;
  platformAdminStatus: string | null;
  clubMembershipSummary: Array<{ clubId: string; clubName: string; role: string; status: string }>;
  grantEligible: boolean;
  grantBlockedReason: string | null;
};

export type AdminSupportGrantLedgerItem = {
  grantId: string;
  clubId: string;
  clubName: string;
  granteeUserId: string;
  granteeDisplayName: string;
  granteeMaskedEmail: string;
  scope: "METADATA_READ" | "HOST_SUPPORT_READ";
  reason: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  status: string;
  createdByRole: string;
};

export type AdminSupportGrantRequest = {
  clubId: string;
  granteeSubjectId: string;
  scope: "METADATA_READ" | "HOST_SUPPORT_READ";
  reason: string;
  expiresAt: string;
};

export type SupportGrantRiskStatus = "READY" | "WARNING" | "BLOCKED";
export type SupportGrantRiskItemState = "PASS" | "WARNING" | "BLOCKED";

export type SupportGrantRiskItem = {
  id: string;
  label: string;
  state: SupportGrantRiskItemState;
  detail: string;
};

export type SupportGrantRiskSummary = {
  status: SupportGrantRiskStatus;
  primaryMessage: string;
  items: SupportGrantRiskItem[];
};

export type SupportGrantRiskSummaryInput = {
  selectedResult: AdminSupportSearchResult | null;
  selectedClubId: string | null;
  canCreateGrant: boolean;
  reason: string;
  expiresAt: string;
  now?: Date;
};

export const SUPPORT_REASON_PRESETS = [
  "고객 문의 재현 지원",
  "호스트 온보딩 상태 확인",
  "알림 전달 상태 확인",
  "클럽 공개 준비 지원",
] as const;

const SHORT_SUPPORT_WINDOW_HOURS = 24;

export function isSupportReasonPresetSafe(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized.includes("@")) return false;
  if (normalized.includes("token")) return false;
  if (normalized.includes("secret")) return false;
  if (normalized.includes("http://") || normalized.includes("https://")) return false;
  if (/#\d+/.test(value)) return false;
  return value.trim().length > 0;
}

export function buildSupportGrantRiskSummary(input: SupportGrantRiskSummaryInput): SupportGrantRiskSummary {
  const now = input.now ?? new Date();
  const expiry = new Date(input.expiresAt);
  const expiryValid = input.expiresAt.trim().length > 0 && !Number.isNaN(expiry.getTime());
  const expiresInHours = expiryValid ? (expiry.getTime() - now.getTime()) / (1000 * 60 * 60) : null;
  const expiryState: SupportGrantRiskItemState =
    !expiryValid || (expiresInHours !== null && expiresInHours <= 0)
      ? "BLOCKED"
      : expiresInHours !== null && expiresInHours > SHORT_SUPPORT_WINDOW_HOURS
        ? "WARNING"
        : "PASS";
  const eligibilityBlockedReason =
    input.selectedResult?.grantBlockedReason?.trim() || "지원 접근 권한을 발급할 수 없는 대상입니다.";

  const items: SupportGrantRiskItem[] = [
    {
      id: "subject",
      label: "지원 대상",
      state: input.selectedResult ? "PASS" : "BLOCKED",
      detail: input.selectedResult
        ? `${input.selectedResult.displayName} · ${input.selectedResult.maskedEmail}`
        : "지원 대상을 먼저 선택하세요.",
    },
    {
      id: "club",
      label: "클럽 범위",
      state: input.selectedClubId ? "PASS" : "BLOCKED",
      detail: input.selectedClubId ? "선택한 클럽에만 지원 접근 권한을 발급합니다." : "클럽 선택이 필요합니다.",
    },
    {
      id: "permission",
      label: "발급 권한",
      state: input.canCreateGrant ? "PASS" : "BLOCKED",
      detail: input.canCreateGrant
        ? "OWNER 권한으로 발급합니다."
        : "OWNER만 지원 접근 권한을 발급할 수 있습니다.",
    },
    {
      id: "eligibility",
      label: "대상 적격성",
      state: input.selectedResult?.grantEligible ? "PASS" : "BLOCKED",
      detail: input.selectedResult?.grantEligible
        ? "대상자가 support grant 발급 조건을 만족합니다."
        : eligibilityBlockedReason,
    },
    {
      id: "reason",
      label: "발급 사유",
      state: input.reason.trim() ? "PASS" : "BLOCKED",
      detail: input.reason.trim() ? "사유가 기록됩니다." : "구체적인 지원 사유를 입력하세요.",
    },
    {
      id: "expiry",
      label: "만료 시각",
      state: expiryState,
      detail:
        expiryState === "BLOCKED"
          ? "만료 시각을 다시 확인하세요."
          : expiryState === "WARNING"
            ? "24시간을 넘는 지원 권한입니다. 필요성을 다시 확인하세요."
            : "짧은 지원 권한으로 제한됩니다.",
    },
  ];

  if (items.some((item) => item.state === "BLOCKED")) {
    return { status: "BLOCKED", primaryMessage: firstBlockedMessage(items), items };
  }

  if (items.some((item) => item.state === "WARNING")) {
    return { status: "WARNING", primaryMessage: "발급 가능하지만 만료 시간이 길어 검토가 필요합니다.", items };
  }

  return { status: "READY", primaryMessage: "지원 접근 권한을 발급할 준비가 되었습니다.", items };
}

function firstBlockedMessage(items: SupportGrantRiskItem[]): string {
  const firstBlocked = items.find((item) => item.state === "BLOCKED");
  if (firstBlocked?.id === "subject") return "지원 대상을 먼저 선택하세요.";
  if (firstBlocked?.id === "club") return "클럽을 선택하세요.";
  if (firstBlocked?.id === "permission") return "현재 역할은 지원 접근 권한을 발급할 수 없습니다.";
  if (firstBlocked?.id === "eligibility") return "선택한 대상에게 지원 접근 권한을 발급할 수 없습니다.";
  if (firstBlocked?.id === "reason") return "지원 사유를 입력하세요.";
  return "지원 접근 권한 입력값을 확인하세요.";
}
