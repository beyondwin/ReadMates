import { useCallback } from "react";
import MemberHome from "@/features/member-home/components/member-home";
import { useAuth } from "@/src/app/auth-state";
import type { CurrentSessionResponse, MyPageResponse, NoteFeedItem } from "@/shared/api/readmates";
import { readmatesFetch } from "@/shared/api/readmates";
import { useReadmatesData } from "./readmates-page-data";
import { ReadmatesPageState, ReadmatesRouteLoading } from "./readmates-page";

type AppHomeData = {
  current: CurrentSessionResponse;
  noteFeedItems: NoteFeedItem[];
  myPage: MyPageResponse;
};

export default function AppHomePage() {
  const authState = useAuth();
  const state = useReadmatesData(
    useCallback(
      async (): Promise<AppHomeData> => {
        const [current, noteFeedItems, myPage] = await Promise.all([
          readmatesFetch<CurrentSessionResponse>("/api/sessions/current"),
          readmatesFetch<NoteFeedItem[]>("/api/notes/feed"),
          readmatesFetch<MyPageResponse>("/api/app/me"),
        ]);

        return { current, noteFeedItems, myPage };
      },
      [],
  ),
  );

  if (authState.status !== "ready") {
    return <ReadmatesRouteLoading label="계정 상태를 확인하는 중" variant="member" />;
  }

  return (
    <ReadmatesPageState state={state} loadingLabel="멤버 홈을 불러오는 중">
      {(data) => (
        <MemberHome
          auth={authState.auth}
          current={data.current}
          noteFeedItems={data.noteFeedItems}
          myPage={data.myPage}
        />
      )}
    </ReadmatesPageState>
  );
}
