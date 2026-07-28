import type { ReactNode } from "react";
import type { ParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MemberSpaceAccountActions } from "./member-space-account-actions";
import { ParticipationJourney } from "./participation-journey";

export type MyReadingShelfProps = {
  viewModel: ParticipationJourneyViewModel;
  logoutControl: ReactNode;
};

export function MyReadingShelf({ viewModel, logoutControl }: MyReadingShelfProps) {
  return (
    <main className="rm-my-shelf">
      <header className="rm-my-shelf-header">
        <div>
          <p className="rm-my-shelf-kicker">내 공간</p>
          <h1>나의 서재</h1>
          <p>함께 읽어 온 시간과 나의 참여 흐름을 돌아보세요.</p>
        </div>
      </header>
      <ParticipationJourney viewModel={viewModel} />
      <MemberSpaceAccountActions logoutControl={logoutControl} />
    </main>
  );
}
