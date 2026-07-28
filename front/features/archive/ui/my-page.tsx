import type { ReactNode } from "react";
import type { ParticipationJourneyViewModel } from "@/features/archive/model/my-reading-shelf-model";
import { MyReadingShelf } from "./my-page/my-reading-shelf";

type MyPageProps = {
  viewModel: ParticipationJourneyViewModel;
  logoutControl: ReactNode;
};

export default function MyPage({ viewModel, logoutControl }: MyPageProps) {
  return <MyReadingShelf viewModel={viewModel} logoutControl={logoutControl} />;
}
