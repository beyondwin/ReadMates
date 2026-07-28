import { describe, expect, it } from "vitest";
import { accountMembershipLabel } from "./account-menu-model";

describe("accountMembershipLabel", () => {
  it.each([
    ["ACTIVE", "정식 멤버"],
    ["VIEWER", "둘러보기 멤버"],
    ["SUSPENDED", "이용 정지"],
    ["INVITED", "초대 대기"],
    ["LEFT", "탈퇴"],
    ["INACTIVE", "비활성"],
    [null, "멤버"],
  ] as const)("maps %s to %s", (status, label) => {
    expect(accountMembershipLabel(status)).toBe(label);
  });
});
