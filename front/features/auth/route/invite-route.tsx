import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchInvitationPreview, parseInvitationPreview } from "@/features/auth/api/auth-api";
import InviteAcceptanceCard, { type InvitePreviewState } from "@/features/auth/ui/invite-acceptance-card";

function initialInvitePreviewState(clubSlug: string | undefined, token: string): InvitePreviewState {
  return {
    clubSlug: clubSlug ?? null,
    token,
    preview: null,
    error: null,
    isLoading: true,
  };
}

export function InviteAcceptanceRouteContent({ clubSlug, token }: { clubSlug?: string; token: string }) {
  const [previewState, setPreviewState] = useState<InvitePreviewState>(() => initialInvitePreviewState(clubSlug, token));
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    fetchInvitationPreview(token, clubSlug)
      .then(async (previewResponse) => {
        if (!active || !mountedRef.current) {
          return;
        }
        if (!previewResponse.ok) {
          setPreviewState({
            clubSlug: clubSlug ?? null,
            token,
            preview: null,
            error: "초대 링크를 찾을 수 없습니다. 주소를 다시 확인하거나 호스트에게 새 링크를 요청해 주세요.",
            isLoading: false,
          });
          return;
        }
        const parsedPreview = await parseInvitationPreview(previewResponse);
        if (!active || !mountedRef.current) {
          return;
        }
        setPreviewState({
          clubSlug: clubSlug ?? null,
          token,
          preview: parsedPreview,
          error: null,
          isLoading: false,
        });
      })
      .catch(() => {
        if (active && mountedRef.current) {
          setPreviewState({
            clubSlug: clubSlug ?? null,
            token,
            preview: null,
            error: "초대 정보를 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 새로고침해 주세요.",
            isLoading: false,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [clubSlug, token]);

  return <InviteAcceptanceCard clubSlug={clubSlug} token={token} previewState={previewState} />;
}

export function InviteRoute() {
  const params = useParams();
  const clubSlug = params.clubSlug;
  const token = params.token ?? "";

  return <InviteAcceptanceRouteContent clubSlug={clubSlug} token={token} />;
}
