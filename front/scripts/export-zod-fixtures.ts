/**
 * Writes sample valid JSON fixture files representing the key shapes
 * of zod-validated frontend API response schemas.
 *
 * Run via: pnpm zod:export-fixtures
 *
 * The fixtures are the source of truth for the server-side
 * FrontendZodSchemaContractTest, which verifies that server MockMvc responses
 * contain the same recursive object keys and representative array element
 * shapes as these fixtures.
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "../tests/unit/__fixtures__/zod-schemas");

mkdirSync(fixturesDir, { recursive: true });

// ---------------------------------------------------------------------------
// HostSessionDetailResponseSchema top-level keys
// ---------------------------------------------------------------------------
const hostSessionDetail = {
  sessionId: "00000000-0000-0000-0000-000000000301",
  sessionNumber: 1,
  title: "1회차 · 팩트풀니스",
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookLink: null,
  bookImageUrl: null,
  locationLabel: "온라인",
  meetingUrl: null,
  meetingPasscode: null,
  date: "2025-11-26",
  startTime: "19:30",
  endTime: "21:30",
  questionDeadlineAt: "2025-11-25T14:59:00Z",
  visibility: "PUBLIC",
  publication: null,
  state: "PUBLISHED",
  attendees: [],
  feedbackDocument: {
    uploaded: false,
    fileName: null,
    uploadedAt: null,
  },
};

// ---------------------------------------------------------------------------
// HostNotificationDeliveryListResponseSchema top-level keys
// ---------------------------------------------------------------------------
const hostNotificationDeliveryList = {
  items: [],
  nextCursor: null,
};

// ---------------------------------------------------------------------------
// HostInvitationListPageSchema top-level keys
// ---------------------------------------------------------------------------
const hostInvitationList = {
  items: [],
  nextCursor: null,
};

// ---------------------------------------------------------------------------
// AdminAnalyticsOverviewSchema top-level keys
// ---------------------------------------------------------------------------
const adminAnalyticsOverview = {
  schema: "admin.analytics_overview.v2",
  generatedAt: "2026-05-30T00:00:00Z",
  window: "30d",
  kpis: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      availability: "AVAILABLE",
      current: 80,
      prior: 60,
      deltaDirection: "UP",
    },
  ],
  clubBenchmark: {
    availability: "AVAILABLE",
    rows: [
      {
        clubId: "00000000-0000-0000-0000-000000000001",
        slug: "reading-sai",
        name: "Reading Sai",
        activeMembers: 6,
        sessionCompletionRate: 83,
        rsvpRate: 75,
        aiCostUsd: "1.2500",
        notificationDeliveryRate: 96,
      },
    ],
  },
  series: [
    {
      key: "SESSION_COMPLETION",
      unit: "PERCENT",
      points: [{ bucketStart: "2026-05-01", availability: "AVAILABLE", value: 80 }],
    },
  ],
};

// ---------------------------------------------------------------------------
// CurrentSessionResponseSchema top-level keys
// ---------------------------------------------------------------------------
const currentSession = {
  currentSession: {
    sessionId: "00000000-0000-0000-0000-000000000301",
    sessionNumber: 1,
    title: "1회차 · 팩트풀니스",
    bookTitle: "팩트풀니스",
    bookAuthor: "한스 로슬링",
    bookLink: null,
    bookImageUrl: null,
    date: "2025-11-26",
    startTime: "19:30",
    endTime: "21:30",
    locationLabel: "온라인",
    meetingUrl: null,
    meetingPasscode: null,
    questionDeadlineAt: "2025-11-25T14:59:00Z",
    myRsvpStatus: "GOING",
    myCheckin: { readingProgress: 100 },
    myQuestions: [
      {
        priority: 1,
        text: "계약 테스트 질문",
        draftThought: "계약 테스트 초안",
        authorName: "멤버5",
        authorShortName: "멤버5",
      },
    ],
    myOneLineReview: {
      text: "계약 테스트 한줄평",
    },
    myLongReview: {
      body: "계약 테스트 내 서평",
    },
    board: {
      questions: [
        {
          priority: 1,
          text: "계약 테스트 질문",
          draftThought: "계약 테스트 초안",
          authorName: "멤버5",
          authorShortName: "멤버5",
        },
      ],
      longReviews: [
        {
          authorName: "멤버5",
          authorShortName: "멤버5",
          body: "계약 테스트 내 서평",
        },
      ],
    },
    attendees: [
      {
        membershipId: "00000000-0000-0000-0000-000000000201",
        displayName: "호스트",
        accountName: "김호스트",
        role: "HOST",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
      },
    ],
  },
};

function write(filename: string, data: unknown): void {
  const path = join(fixturesDir, filename);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

write("host-session-detail.json", hostSessionDetail);
write("host-notification-delivery-list.json", hostNotificationDeliveryList);
write("host-invitation-list.json", hostInvitationList);
write("admin-analytics-overview.json", adminAnalyticsOverview);
write("current-session.json", currentSession);
