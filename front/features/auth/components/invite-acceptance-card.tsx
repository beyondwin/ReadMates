"use client";

import { Link } from "@/src/app/router-link";
import { useEffect, useRef, useState } from "react";
import { fetchInvitationPreview, parseInvitationPreview } from "@/features/auth/actions/invitations";
import type { InvitationPreviewResponse, InvitationStatus } from "@/shared/api/readmates";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

const statusCopy: Record<InvitationStatus, { title: string; body: string }> = {
  PENDING: {
    title: "읽는사이 초대",
    body: "초대 대상 Gmail 계정과 이름을 확인한 뒤 Google 로그인으로 수락해 주세요.",
  },
  ACCEPTED: {
    title: "이미 사용된 초대입니다.",
    body: "이미 수락된 링크입니다. 멤버라면 로그인해서 내 공간으로 이동해 주세요.",
  },
  EXPIRED: {
    title: "초대가 만료되었습니다.",
    body: "호스트에게 새 초대 링크를 요청해 주세요.",
  },
  REVOKED: {
    title: "사용할 수 없는 초대입니다.",
    body: "취소된 초대 링크입니다. 호스트에게 확인해 주세요.",
  },
};

export default function InviteAcceptanceCard({ token }: { token: string }) {
  const [preview, setPreview] = useState<InvitationPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchInvitationPreview(token)
      .then(async (previewResponse) => {
        if (!active || !mountedRef.current) {
          return;
        }
        if (!previewResponse.ok) {
          setError("초대 링크를 찾을 수 없습니다.");
          return;
        }
        const parsedPreview = await parseInvitationPreview(previewResponse);
        if (!active || !mountedRef.current) {
          return;
        }
        setPreview(parsedPreview);
      })
      .catch(() => {
        if (active && mountedRef.current) {
          setError("초대 정보를 불러오지 못했습니다.");
        }
      });

    return () => {
      active = false;
    };
  }, [token]);

  const copy = preview ? statusCopy[preview.status] : null;
  const title = preview?.status === "PENDING" ? `${preview.clubName} 초대` : copy?.title;
  const heading = title ?? "초대 확인 중";
  const canAccept = preview?.canAccept === true;
  const isAccepted = preview?.status === "ACCEPTED";
  const googleInviteHref = `/oauth2/authorization/google?inviteToken=${encodeURIComponent(token)}`;

  return (
    <section className="auth-shell">
      <div className="container" style={{ maxWidth: 520 }}>
        <Link to="/" className="btn btn-quiet btn-sm" style={{ marginLeft: "-10px", marginBottom: 24 }}>
          ← 공개 화면으로
        </Link>
        <div className="surface auth-card">
          <div className="eyebrow" style={{ marginBottom: 12 }}>
            초대 확인
          </div>
          <h1 className="h2 editorial" style={{ margin: 0 }}>
            {heading}
          </h1>
          {copy ? (
            <p className="body" style={{ color: "var(--text-2)", marginTop: 16 }}>
              {copy.body}
            </p>
          ) : null}
          {error ? (
            <p className="small" role="alert" style={{ margin: "12px 0 0", color: "var(--danger)" }}>
              {error}
            </p>
          ) : null}
          {preview ? (
            <div className="surface-quiet" style={{ padding: 16, marginTop: 20 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>
                초대 대상
              </div>
              <div className="body" style={{ fontSize: 14, fontWeight: 500 }}>
                {preview.name}
              </div>
              <div className="mono" style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4 }}>
                {preview.email}
              </div>
              <div className="tiny" style={{ marginTop: 8 }}>
                만료 {formatDateOnlyLabel(preview.expiresAt)}
              </div>
            </div>
          ) : null}
          {canAccept ? (
            <>
              <p className="small" style={{ color: "var(--text-2)", marginTop: 18 }}>
                Google로 초대 수락하면 바로 정식 멤버가 됩니다.
              </p>
              <div className="auth-card__actions">
                <a className="btn btn-primary btn-lg" href={googleInviteHref}>
                  Google로 초대 수락
                </a>
              </div>
            </>
          ) : null}
          {isAccepted ? (
            <div className="auth-card__actions">
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
