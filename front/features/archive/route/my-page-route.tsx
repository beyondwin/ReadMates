import { useLoaderData } from "react-router-dom";
import type { MyPageRouteData } from "@/features/archive/route/my-page-data";
import MyPage from "@/features/archive/ui/my-page";

export function MyPageRoute() {
  const { profile, journey } = useLoaderData() as MyPageRouteData;

  return <MyPage data={profile} journey={journey} />;
}
