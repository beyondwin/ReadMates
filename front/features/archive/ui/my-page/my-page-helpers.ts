import type { MyPageProfile } from "@/features/archive/model/archive-model";
import { membershipIdentityLabel } from "@/features/archive/model/archive-model";

export function mobileMembershipStatusLabel(data: Pick<MyPageProfile, "role" | "membershipStatus">) {
  return data.membershipStatus === "ACTIVE" ? "정식 멤버" : membershipIdentityLabel(data);
}
