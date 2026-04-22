import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchInvitationPreview, parseInvitationPreview } from "@/features/auth/api/auth-api";
import InviteAcceptanceCard, { type InvitePreviewState } from "@/features/auth/ui/invite-acceptance-card";

function initialInvitePreviewState(token: string): InvitePreviewState {
  return {
    token,
    preview: null,
    error: null,
    isLoading: true,
  };
}

export function InviteAcceptanceRouteContent({ token }: { token: string }) {
  const [previewState, setPreviewState] = useState<InvitePreviewState>(() => initialInvitePreviewState(token));
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
          setPreviewState({
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
          token,
          preview: parsedPreview,
          error: null,
          isLoading: false,
        });
      })
      .catch(() => {
        if (active && mountedRef.current) {
          setPreviewState({
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
  }, [token]);

  return <InviteAcceptanceCard token={token} previewState={previewState} />;
}

export function InviteRoute() {
  const token = useParams().token ?? "";

  return <InviteAcceptanceRouteContent token={token} />;
}
