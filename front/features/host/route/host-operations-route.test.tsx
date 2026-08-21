import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PropsWithChildren } from "react";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HostSessionLedgerItem } from "@/features/host/model/host-session-ledger-model";
import type { HostClubOperationsSnapshot } from "@/shared/model/club-operations";

vi.mock("@/features/host/api/host-api", () => ({
  fetchHostClubOperations: vi.fn(),
  fetchHostNotificationSummary: vi.fn(),
}));

vi.mock("@/features/host/api/host-session-record-api", () => ({
  fetchHostSessionRecordLedger: vi.fn(),
}));

vi.mock("@/features/host/aigen/api/aigen-api", () => ({
  getAiGenerationCapabilities: vi.fn(),
  getClubAiDefault: vi.fn(),
  putClubAiDefault: vi.fn(),
}));

const observabilityMocks = vi.hoisted(() => ({
  recordHostOperationsCardLoad: vi.fn(),
  recordHostAttentionResult: vi.fn(),
}));

vi.mock("@/shared/observability/frontend-observability", () => observabilityMocks);

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useLoaderData: () => ({
      auth: {
        authenticated: true,
        currentMembership: { clubSlug: "reading-sai" },
      },
      clubSlug: "reading-sai",
    }),
    useParams: () => ({ clubSlug: "reading-sai" }),
  };
});

import { fetchHostClubOperations, fetchHostNotificationSummary } from "@/features/host/api/host-api";
import { fetchHostSessionRecordLedger } from "@/features/host/api/host-session-record-api";
import {
  getAiGenerationCapabilities,
  getClubAiDefault,
} from "@/features/host/aigen/api/aigen-api";
import { HostOperationsRoute } from "./host-operations-route";

const mockedClubOperations = vi.mocked(fetchHostClubOperations);
const mockedNotificationSummary = vi.mocked(fetchHostNotificationSummary);
const mockedAttention = vi.mocked(fetchHostSessionRecordLedger);
const mockedCapabilities = vi.mocked(getAiGenerationCapabilities);
const mockedAiDefault = vi.mocked(getClubAiDefault);

function attentionItem(overrides: Partial<HostSessionLedgerItem> = {}): HostSessionLedgerItem {
  return {
    sessionId: "closed-1",
    sessionNumber: 12,
    title: "12회차",
    bookTitle: "닫힌 책",
    bookAuthor: "저자",
    bookImageUrl: null,
    date: "2026-04-15",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    state: "CLOSED",
    visibility: "MEMBER",
    recordStatus: "INCOMPLETE",
    needsAttention: true,
    hasDraft: false,
    liveRevision: 1,
    draftRevision: null,
    lastModifiedAt: "2026-04-16T00:00:00Z",
    ...overrides,
  };
}

function snapshot(): HostClubOperationsSnapshot {
  return {
    schema: "host.club_operations_snapshot.v1",
    generatedAt: "2026-05-31T00:00:00Z",
    club: { clubId: "club-1", slug: "reading-sai", name: "읽는사이" },
    readiness: { state: "READY", blockingReasons: [], nextAction: null },
    sessionProgress: {
      upcomingCount: 1,
      currentOpenCount: 0,
      closedCount: 4,
      publishedRecordCount: 3,
      incompleteRecordCount: 0,
    },
    aiUsage: {
      activeJobs: 0,
      failedRecentJobs: 0,
      staleCandidates: 0,
      costEstimateUsd: "0.5000",
      state: "READY",
      priorFailedJobs7d: 0,
    },
  };
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={["/app/host/operations"]}>
          {children}
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { client, Wrapper };
}

beforeEach(() => {
  observabilityMocks.recordHostOperationsCardLoad.mockReset();
  observabilityMocks.recordHostAttentionResult.mockReset();
  mockedClubOperations.mockReset();
  mockedNotificationSummary.mockReset();
  mockedAttention.mockReset();
  mockedCapabilities.mockReset();
  mockedAiDefault.mockReset();
  mockedCapabilities.mockResolvedValue({ enabled: true });
  mockedAiDefault.mockResolvedValue({ defaultModel: "gpt-5.4" });
  mockedClubOperations.mockResolvedValue(snapshot());
  mockedNotificationSummary.mockResolvedValue({
    pending: 2,
    failed: 1,
    dead: 0,
    sentLast24h: 4,
    latestFailures: [
      {
        id: "note-1",
        eventType: "FEEDBACK_DOCUMENT_PUBLISHED",
        recipientEmail: "member@example.com",
        attemptCount: 3,
        updatedAt: "2026-04-28T10:30:00Z",
      },
    ],
  });
});

describe("HostOperationsRoute", () => {
  it("paginates the full attention list including PUBLISHED and deep-links to meetings", async () => {
    const user = userEvent.setup();
    mockedAttention
      .mockResolvedValueOnce({
        items: [
          attentionItem({ sessionId: "att-1", sessionNumber: 1, bookTitle: "첫 번째 책" }),
          attentionItem({ sessionId: "att-2", sessionNumber: 2, bookTitle: "두 번째 책" }),
        ],
        nextCursor: "page-2",
        summary: { needsAttentionCount: 4, incompletePublishedCount: 1, draftCount: 0 },
      })
      .mockResolvedValueOnce({
        items: [
          attentionItem({ sessionId: "att-3", sessionNumber: 3, bookTitle: "세 번째 책" }),
          attentionItem({
            sessionId: "att-4",
            sessionNumber: 4,
            bookTitle: "공개된 책",
            state: "PUBLISHED",
          }),
        ],
        nextCursor: null,
        summary: { needsAttentionCount: 4, incompletePublishedCount: 1, draftCount: 0 },
      });
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <HostOperationsRoute />
      </Wrapper>,
    );

    const attention = await screen.findByRole("region", { name: "확인 필요" });
    expect(await within(attention).findByText("첫 번째 책")).toBeInTheDocument();
    expect(within(attention).getByText("두 번째 책")).toBeInTheDocument();
    expect(within(attention).queryByText("공개된 책")).not.toBeInTheDocument();
    expect(within(attention).getByRole("link", { name: "1회차 기록 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/att-1",
    );

    await user.click(within(attention).getByRole("button", { name: "더 보기" }));

    expect(await within(attention).findByText("공개된 책")).toBeInTheDocument();
    expect(within(attention).getByText("세 번째 책")).toBeInTheDocument();
    expect(within(attention).getByRole("link", { name: "4회차 기록 열기" })).toHaveAttribute(
      "href",
      "/app/host/sessions/att-4",
    );
  });

  it("keeps successful cards when club readiness fails and retries only that card", async () => {
    const user = userEvent.setup();
    mockedAttention.mockResolvedValue({
      items: [attentionItem({ bookTitle: "남은 기록" })],
      nextCursor: null,
      summary: { needsAttentionCount: 1, incompletePublishedCount: 0, draftCount: 0 },
    });
    mockedClubOperations.mockRejectedValueOnce(new Error("ops down")).mockResolvedValueOnce(snapshot());
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <HostOperationsRoute />
      </Wrapper>,
    );

    expect(await screen.findByText("남은 기록")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "AI 기본 모델" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "알림 발송 장부 열기" })).toHaveAttribute(
      "href",
      "/app/host/notifications",
    );
    expect(screen.queryByText("열린 세션")).not.toBeInTheDocument();

    const readiness = screen.getByRole("region", { name: "클럽 준비도" });
    expect(within(readiness).getByRole("heading", { name: "운영 신호" })).toBeInTheDocument();
    expect(within(readiness).getByRole("alert")).toHaveTextContent("클럽 준비도를 불러오지 못했습니다.");
    await user.click(within(readiness).getByRole("button", { name: "다시 시도" }));

    expect(await screen.findByText("열린 세션")).toBeInTheDocument();
    expect(screen.getByText("남은 기록")).toBeInTheDocument();
  });

  it("keeps stale notification data usable while a refresh fails", async () => {
    mockedAttention.mockResolvedValue({
      items: [],
      nextCursor: null,
      summary: { needsAttentionCount: 0, incompletePublishedCount: 0, draftCount: 0 },
    });
    mockedNotificationSummary
      .mockResolvedValueOnce({
        pending: 2,
        failed: 1,
        dead: 0,
        sentLast24h: 4,
        latestFailures: [],
      })
      .mockRejectedValueOnce(new Error("summary down"));
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <HostOperationsRoute />
      </Wrapper>,
    );

    const notifications = await screen.findByRole("region", { name: "알림 발송" });
    expect(await within(notifications).findByText(/대기 2/)).toBeInTheDocument();
    expect(screen.queryByText("member@example.com")).not.toBeInTheDocument();

    await userEvent.click(within(notifications).getByRole("button", { name: "다시 불러오기" }));

    await waitFor(() => {
      expect(within(notifications).getByRole("alert")).toHaveTextContent(
        "알림 상태를 새로고치지 못했습니다.",
      );
    });
    expect(within(notifications).getByText(/대기 2/)).toBeInTheDocument();
  });

  it("stacks the four cards in ledger order inside a 320px frame and keeps retry keyboard-reachable", async () => {
    const user = userEvent.setup();
    mockedAttention.mockResolvedValue({
      items: [attentionItem()],
      nextCursor: null,
      summary: { needsAttentionCount: 1, incompletePublishedCount: 0, draftCount: 0 },
    });
    mockedClubOperations.mockRejectedValue(new Error("ops down"));
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <div style={{ width: 320 }}>
          <HostOperationsRoute />
        </div>
      </Wrapper>,
    );

    expect(await screen.findByRole("heading", { name: "AI 기본 모델" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "확인 필요",
      "AI 기본 모델",
      "운영 신호",
      "알림 발송",
    ]);

    await user.tab();
    const retry = screen.getByRole("button", { name: "다시 시도" });
    retry.focus();
    expect(retry).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(mockedClubOperations).toHaveBeenCalledTimes(2));
  });

  it("records bounded card-load outcomes once each request settles", async () => {
    mockedAttention.mockResolvedValue({
      items: [attentionItem()],
      nextCursor: null,
      summary: { needsAttentionCount: 1, incompletePublishedCount: 0, draftCount: 0 },
    });
    mockedClubOperations.mockRejectedValue(new Error("ops down"));
    const { Wrapper } = createWrapper();

    render(
      <Wrapper>
        <HostOperationsRoute />
      </Wrapper>,
    );

    await waitFor(() => {
      const cards = observabilityMocks.recordHostOperationsCardLoad.mock.calls.map(
        (call) => call[0].card,
      );
      expect(cards).toEqual(expect.arrayContaining([
        "attention",
        "ai_defaults",
        "club_readiness",
        "notifications",
      ]));
    });
    expect(observabilityMocks.recordHostOperationsCardLoad).toHaveBeenCalledWith(
      expect.objectContaining({ card: "attention", outcome: "success" }),
    );
    expect(observabilityMocks.recordHostOperationsCardLoad).toHaveBeenCalledWith(
      expect.objectContaining({ card: "club_readiness", outcome: "error" }),
    );
    expect(observabilityMocks.recordHostOperationsCardLoad).toHaveBeenCalledWith(
      expect.objectContaining({ card: "notifications", outcome: "success" }),
    );
    expect(observabilityMocks.recordHostAttentionResult).toHaveBeenCalledWith({ size: 1 });
    expect(
      observabilityMocks.recordHostOperationsCardLoad.mock.calls.every(
        (call) => call[0].hasPasscode === undefined && call[0].clubId === undefined,
      ),
    ).toBe(true);
  });
});
