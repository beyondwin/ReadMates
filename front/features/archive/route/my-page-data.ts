import { loadMyPageRouteData, type MyPageRouteData } from "@/features/archive/api/archive-api";

export async function myPageLoader(): Promise<MyPageRouteData> {
  return loadMyPageRouteData();
}
