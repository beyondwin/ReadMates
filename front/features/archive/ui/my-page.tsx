import type { MyPageProfile } from "@/features/archive/model/archive-model";
import type { MyJourneyPage } from "@/features/archive/model/my-reading-shelf-model";
import { MyReadingShelf } from "./my-page/my-reading-shelf";

type MyPageProps = {
  data: MyPageProfile;
  journey: MyJourneyPage;
};

export default function MyPage({ data, journey }: MyPageProps) {
  return <MyReadingShelf profile={data} journey={journey} />;
}
