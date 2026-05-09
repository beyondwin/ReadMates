/**
 * Writes sample valid JSON fixture files representing the top-level key shapes
 * of the three zod-validated host API schemas from host-contracts.ts.
 *
 * Run via: pnpm zod:export-fixtures
 *
 * The fixtures are the source of truth for the server-side
 * FrontendZodSchemaContractTest, which verifies that server MockMvc responses
 * contain exactly the same top-level keys as these fixtures.
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

function write(filename: string, data: unknown): void {
  const path = join(fixturesDir, filename);
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

write("host-session-detail.json", hostSessionDetail);
write("host-notification-delivery-list.json", hostNotificationDeliveryList);
write("host-invitation-list.json", hostInvitationList);
