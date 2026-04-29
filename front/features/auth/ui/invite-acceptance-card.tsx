"use client";

import { Link } from "@/features/auth/ui/auth-link";
import type { InvitationPreviewView, InvitationStatus } from "@/features/auth/model/auth-model";
import { googleInviteHref } from "@/features/auth/model/invite-oauth";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

const statusCopy: Record<InvitationStatus, { title: string; body: string; badgeClass: string; badge: string }> = {
  PENDING: {
    title: "읽는사이 초대",
    body: "초대 대상 Gmail 계정과 이름을 확인한 뒤 같은 Google 계정으로 수락해 주세요.",
    badgeClass: "badge-pending",
    badge: "초대 대기",
  },
  ACCEPTED: {
    title: "이미 사용된 초대입니다.",
    body: "이미 수락된 링크입니다. 멤버라면 로그인해서 내 공간으로 이동해 주세요.",
    badgeClass: "badge-success",
    badge: "수락 완료",
  },
  EXPIRED: {
    title: "초대가 만료되었습니다.",
    body: "호스트에게 새 초대 링크를 요청해 주세요.",
    badgeClass: "badge-warning",
    badge: "만료",
  },
  REVOKED: {
    title: "사용할 수 없는 초대입니다.",
    body: "취소된 초대 링크입니다. 호스트에게 확인해 주세요.",
    badgeClass: "badge-locked",
    badge: "취소됨",
  },
};

function membershipStatusLabel(status: InvitationStatus) {
  if (status === "PENDING") return "정식 멤버 초대 대기";
  if (status === "ACCEPTED") return "정식 멤버 연결 완료";
  if (status === "EXPIRED") return "만료되어 수락 불가";
  return "취소되어 수락 불가";
}

export type InvitePreviewState = {
  clubSlug: string | null;
  token: string;
  preview: InvitationPreviewView | null;
  error: string | null;
  isLoading: boolean;
};

export default function InviteAcceptanceCard({
  clubSlug,
  token,
  previewState,
}: {
  clubSlug?: string;
  token: string;
  previewState: InvitePreviewState;
}) {
  const currentClubSlug = clubSlug ?? null;
  const isCurrentPreview = previewState.token === token && previewState.clubSlug === currentClubSlug;
  const preview = isCurrentPreview ? previewState.preview : null;
  const error = isCurrentPreview ? previewState.error : null;
  const isLoading = !isCurrentPreview || previewState.isLoading;
  const copy = preview ? statusCopy[preview.status] : null;
  const title = preview?.status === "PENDING" ? `${preview.clubName} 초대` : copy?.title;
  const heading = title ?? "초대장을 확인하는 중입니다.";
  const canAccept = preview?.canAccept === true;
  const isAccepted = preview?.status === "ACCEPTED";
  const acceptHref = googleInviteHref(token, preview);

  return (
    <section className="auth-shell">
      <div className="container" style={{ maxWidth: 520 }}>
        <Link to="/" className="btn btn-quiet btn-sm auth-back-link">
          ← 공개 화면으로
        </Link>
        <div className="surface auth-card auth-card--boundary" aria-busy={isLoading}>
          <div className="row-between auth-card__kicker">
            <div className="eyebrow">초대 확인</div>
            {copy ? <span className={`badge badge-dot ${copy.badgeClass}`}>{copy.badge}</span> : null}
          </div>
          <h1 className="h2 editorial auth-card__title">{heading}</h1>
          {copy ? (
            <p className="body auth-card__lede">
              {copy.body}
            </p>
          ) : isLoading ? (
            <p className="body auth-card__lede" role="status" aria-live="polite">
              초대를 확인하는 중입니다. 이전 초대 정보는 지우고 새 링크 상태를 확인하고 있어요.
            </p>
          ) : null}
          {error ? (
            <p className="small auth-card__error" role="alert">
              {error}
            </p>
          ) : null}
          {preview ? (
            <div className="auth-boundary-list" aria-label="초대 경계 정보">
              <div className="auth-boundary-row">
                <span>클럽</span>
                <strong>{preview.clubName}</strong>
              </div>
              <div className="auth-boundary-row">
                <span>초대 대상</span>
                <strong>{preview.name}</strong>
                <em>{preview.email}</em>
              </div>
              <div className="auth-boundary-row">
                <span>Google 계정</span>
                <strong>{preview.emailHint}</strong>
                <em>로그인 계정은 초대 이메일과 일치해야 합니다.</em>
              </div>
              <div className="auth-boundary-row">
                <span>멤버십</span>
                <strong>{membershipStatusLabel(preview.status)}</strong>
                <em>만료 {formatDateOnlyLabel(preview.expiresAt)}</em>
              </div>
            </div>
          ) : null}
          {canAccept ? (
            <>
              <p className="small auth-card__next-step">
                Google 인증이 끝나면 정식 멤버로 연결되고 현재 세션, RSVP, 질문과 서평 작성 권한이 열립니다.
              </p>
              <div className="auth-card__actions auth-card__actions--primary">
                <a className="btn btn-primary btn-lg" href={acceptHref}>
                  Google로 초대 수락
                </a>
              </div>
            </>
          ) : null}
          {isAccepted ? (
            <div className="auth-card__actions auth-card__actions--primary">
              <Link className="btn btn-primary btn-lg" to="/login">
                로그인하기
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
