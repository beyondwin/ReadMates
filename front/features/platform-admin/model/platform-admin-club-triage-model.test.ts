import { describe, expect, it } from "vitest";
import type { PlatformAdminClub } from "@/features/platform-admin/model/platform-admin-domain-types";
import {
  buildClubManagementRow,
  CLUB_TRIAGE_LABEL,
  clubTriageReasons,
  clubTriageSeverity,
  filterClubsBySeverity,
  rankClubsByTriage,
} from "./platform-admin-club-triage-model";

function club(overrides: Partial<PlatformAdminClub>): PlatformAdminClub {
  return {
    clubId: "c-1",
    slug: "alpha",
    name: "Alpha",
    tagline: "",
    about: "",
    status: "ACTIVE",
    publicVisibility: "PRIVATE",
    domainCount: 0,
    domainActionRequiredCount: 0,
    notificationFailureCount: 0,
    aiFailureCount: 0,
    firstHostOnboardingState: "ASSIGNED",
    ...overrides,
  };
}

describe("clubTriageSeverity", () => {
  it("is ok for an active club with no blockers", () => {
    expect(clubTriageSeverity(club({}))).toBe("ok");
  });

  it("is critical when a domain needs action", () => {
    expect(clubTriageSeverity(club({ domainActionRequiredCount: 2 }))).toBe("critical");
  });

  it("is critical when suspended or archived", () => {
    expect(clubTriageSeverity(club({ status: "SUSPENDED" }))).toBe("critical");
    expect(clubTriageSeverity(club({ status: "ARCHIVED" }))).toBe("critical");
  });

  it("is attention when setup is incomplete or host is not assigned", () => {
    expect(clubTriageSeverity(club({ status: "SETUP_REQUIRED" }))).toBe("attention");
    expect(clubTriageSeverity(club({ firstHostOnboardingState: "MISSING" }))).toBe("attention");
    expect(clubTriageSeverity(club({ firstHostOnboardingState: "INVITED" }))).toBe("attention");
  });

  it("is critical when there are recent notification failures", () => {
    expect(clubTriageSeverity(club({ notificationFailureCount: 1 }))).toBe("critical");
  });

  it("is critical when there are recent ai failures", () => {
    expect(clubTriageSeverity(club({ aiFailureCount: 2 }))).toBe("critical");
  });
});

describe("clubTriageReasons", () => {
  it("lists each active blocker in Korean", () => {
    expect(clubTriageReasons(club({ domainActionRequiredCount: 1, firstHostOnboardingState: "MISSING" }))).toEqual([
      "도메인 조치 필요",
      "호스트 없음",
    ]);
  });

  it("is empty for a healthy club", () => {
    expect(clubTriageReasons(club({}))).toEqual([]);
  });

  it("lists failure counts first, ahead of domain and host reasons", () => {
    expect(
      clubTriageReasons(
        club({ notificationFailureCount: 3, aiFailureCount: 1, domainActionRequiredCount: 1 }),
      ),
    ).toEqual(["알림 실패 3건", "AI 실패 1건", "도메인 조치 필요"]);
  });
});

describe("rankClubsByTriage", () => {
  it("orders critical before attention before ok and is stable within a bucket", () => {
    const ok = club({ clubId: "ok" });
    const attention = club({ clubId: "att", status: "SETUP_REQUIRED" });
    const critical = club({ clubId: "crit", domainActionRequiredCount: 1 });
    const ranked = rankClubsByTriage([ok, attention, critical]);
    expect(ranked.map((c) => c.clubId)).toEqual(["crit", "att", "ok"]);
  });

  it("does not mutate the input array", () => {
    const input = [club({ clubId: "ok" }), club({ clubId: "crit", domainActionRequiredCount: 1 })];
    rankClubsByTriage(input);
    expect(input.map((c) => c.clubId)).toEqual(["ok", "crit"]);
  });
});

describe("filterClubsBySeverity", () => {
  it("returns all clubs for the 'all' filter", () => {
    const clubs = [club({ clubId: "a" }), club({ clubId: "b", status: "SUSPENDED" })];
    expect(filterClubsBySeverity(clubs, "all")).toHaveLength(2);
  });

  it("keeps only clubs matching the selected severity", () => {
    const clubs = [club({ clubId: "ok" }), club({ clubId: "crit", status: "SUSPENDED" })];
    expect(filterClubsBySeverity(clubs, "critical").map((c) => c.clubId)).toEqual(["crit"]);
  });
});

describe("CLUB_TRIAGE_LABEL", () => {
  it("maps every severity to a Korean label", () => {
    expect(CLUB_TRIAGE_LABEL).toEqual({ critical: "긴급", attention: "주의", ok: "정상" });
  });
});

describe("buildClubManagementRow", () => {
  it("puts the translated state before a required action and recent signal", () => {
    expect(
      buildClubManagementRow(
        club({
          notificationFailureCount: 2,
          publicVisibility: "PUBLIC",
        }),
      ),
    ).toMatchObject({
      name: "Alpha",
      currentState: "활성 · 공개",
      requiredAction: "실패 신호 확인",
      recentSignal: "알림 실패 2건",
      emphasis: "actionable",
    });
  });

  it("keeps a normal club quiet without inventing a last-checked timestamp", () => {
    const row = buildClubManagementRow(club({}));

    expect(row).toMatchObject({
      name: "Alpha",
      currentState: "활성 · 비공개",
      requiredAction: null,
      recentSignal: null,
      emphasis: "quiet",
    });
    expect(JSON.stringify(row)).not.toContain("마지막 확인");
  });

  it("uses the centralized unknown language while preserving raw values for technical disclosure", () => {
    const row = buildClubManagementRow(
      club({ status: "FUTURE_STATUS" as PlatformAdminClub["status"] }),
    );

    expect(row.currentState).toContain("확인 필요");
    expect(row.requiredAction).toBe("상태 확인");
    expect(row.technicalDisclosure).toEqual(
      expect.arrayContaining([
        { label: "클럽 ID", value: "c-1" },
        { label: "Slug", value: "alpha" },
        { label: "수명주기 값", value: "FUTURE_STATUS" },
      ]),
    );
  });
});
