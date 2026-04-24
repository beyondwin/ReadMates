import { Link } from "@/features/auth/ui/auth-link";
import type { ApprovalState, AuthMeView, MembershipStatus } from "@/features/auth/model/auth-model";

type PendingStateCopy = {
  eyebrow: string;
  title: string;
  body: string;
  badge: string;
  badgeClass: string;
  primary: { label: string; to: string };
  secondary?: { label: string; to: string };
  note: string;
};

function blockedStateBody(approvalState: ApprovalState, membershipStatus: MembershipStatus | null) {
  if (membershipStatus === "INVITED") {
    return "초대는 생성되었지만 아직 Google 계정 수락이 끝나지 않았습니다. 초대 메일의 개인 링크에서 같은 Gmail 계정으로 수락해 주세요.";
  }

  if (membershipStatus === "INACTIVE" || approvalState === "INACTIVE") {
    return "호스트가 이 멤버십을 비활성 상태로 전환했습니다. 공개 기록은 계속 읽을 수 있지만 멤버 앱은 열리지 않습니다.";
  }

  if (membershipStatus === "LEFT") {
    return "이전 멤버십이 종료된 계정입니다. 다시 참여하려면 호스트의 새 초대가 필요합니다.";
  }

  return "현재 승인 상태로는 멤버 앱을 열 수 없습니다. 초대 수락 또는 호스트 전환이 완료되어야 합니다.";
}

function copyForAuth(auth: AuthMeView): PendingStateCopy {
  const membershipStatus = auth.membershipStatus;
  const approvalState = auth.approvalState;

  if (approvalState === "ACTIVE") {
    return {
      eyebrow: "정식 멤버",
      title: "이미 멤버 공간이 열려 있습니다.",
      body: "현재 계정은 정식 멤버 상태입니다. 홈으로 돌아가 이번 세션 준비와 개인 기록을 이어갈 수 있습니다.",
      badge: "승인 완료",
      badgeClass: "badge-success",
      primary: { label: "멤버 홈으로", to: "/app" },
      secondary: { label: "이번 세션 보기", to: "/app/session/current" },
      note: "이 화면이 계속 보인다면 새로고침 후 다시 확인해 주세요.",
    };
  }

  if (approvalState === "SUSPENDED" || membershipStatus === "SUSPENDED") {
    return {
      eyebrow: "멤버십 제한",
      title: "현재 계정은 참여 기능이 잠시 닫혀 있습니다.",
      body: "세션 기록은 읽을 수 있지만 RSVP, 체크인, 질문과 서평 작성은 호스트가 멤버십을 복구한 뒤 다시 열립니다.",
      badge: "제한됨",
      badgeClass: "badge-warning",
      primary: { label: "아카이브 둘러보기", to: "/app/archive" },
      secondary: { label: "내 공간 확인", to: "/app/me" },
      note: "권한 상태에 대한 확인이 필요하면 호스트에게 문의해 주세요.",
    };
  }

  if (approvalState === "VIEWER" || membershipStatus === "VIEWER") {
    return {
      eyebrow: "둘러보기 멤버",
      title: "기록은 읽을 수 있고, 참여 기능은 승인 뒤 열립니다.",
      body: "초대 없이 Google로 로그인한 계정은 둘러보기 멤버로 시작합니다. 호스트가 정식 멤버로 전환하면 RSVP, 체크인, 질문과 서평 작성이 열립니다.",
      badge: "승인 대기",
      badgeClass: "badge-pending",
      primary: { label: "아카이브 둘러보기", to: "/app/archive" },
      secondary: { label: "이번 세션 보기", to: "/app/session/current" },
      note: "초대 링크를 받았다면 해당 링크에서 같은 Google 계정으로 수락해 주세요.",
    };
  }

  return {
    eyebrow: "승인 필요",
    title: "이 계정은 멤버 공간에 들어갈 수 없는 상태입니다.",
    body: blockedStateBody(approvalState, membershipStatus),
    badge: "접근 보류",
    badgeClass: "badge-locked",
    primary: { label: "공개 기록 보기", to: "/records" },
    secondary: { label: "공개 홈으로", to: "/" },
    note: "멤버십이 비활성화되었거나 초대 수락이 완료되지 않은 계정은 정식 멤버 공간에 접근할 수 없습니다.",
  };
}

export function PendingApprovalPage({ auth }: { auth: AuthMeView }) {
  const copy = copyForAuth(auth);
  const email = auth.email ?? "Google 계정";

  return (
    <main className="auth-pending-content">
      <section className="auth-pending-section">
        <div className="container">
          <div className="surface auth-card auth-card--pending">
            <div className="row-between auth-card__kicker">
              <p className="eyebrow">{copy.eyebrow}</p>
              <span className={`badge badge-dot ${copy.badgeClass}`}>{copy.badge}</span>
            </div>
            <h1 className="h1 editorial auth-card__title">{copy.title}</h1>
            <p className="body auth-card__lede">{copy.body}</p>
            <div className="auth-boundary-list" aria-label="현재 계정 승인 상태">
              <div className="auth-boundary-row">
                <span>계정</span>
                <strong>{email}</strong>
              </div>
              <div className="auth-boundary-row">
                <span>멤버 상태</span>
                <strong>{auth.membershipStatus ?? "확인 필요"}</strong>
              </div>
              <div className="auth-boundary-row">
                <span>승인 상태</span>
                <strong>{auth.approvalState}</strong>
                <em>{copy.note}</em>
              </div>
            </div>
            <div className="auth-card__actions auth-card__actions--primary">
              <Link to={copy.primary.to} className="btn btn-primary">
                {copy.primary.label}
              </Link>
              {copy.secondary ? (
                <Link to={copy.secondary.to} className="btn btn-ghost">
                  {copy.secondary.label}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
