import { buildHostMeetingUrl } from "./host-session-workspace-navigation";
import type {
  HostFocusFact,
  HostMeetingTask,
  HostMeetingWorkspaceView,
} from "./host-session-workspace-model";

export type DiaryStepId =
  | "create"
  | "prepare"
  | "responses"
  | "meetingDay"
  | "records"
  | "publish";

export type DiaryStep = {
  id: DiaryStepId;
  label: string;
  state: "done" | "current" | "upcoming";
  detail: string | null;
  href: string | null;
};

export type HostMeetingDiaryView = {
  steps: readonly DiaryStep[];
  currentStep: DiaryStepId;
};

const DIARY_STEPS = [
  { id: "create", label: "모임 만들기", task: "overview" },
  { id: "prepare", label: "멤버와 준비", task: "overview" },
  { id: "responses", label: "응답 모으는 중", task: "responses" },
  { id: "meetingDay", label: "모임 당일(출석)", task: "attendance" },
  { id: "records", label: "기록 정리", task: "records" },
  { id: "publish", label: "기록 게시", task: "records" },
] as const satisfies ReadonlyArray<{
  id: DiaryStepId;
  label: string;
  task: HostMeetingTask;
}>;

const STEP_FACT_ID: Partial<Record<DiaryStepId, HostFocusFact["id"]>> = {
  create: "identity",
  prepare: "identity",
  responses: "responses",
  meetingDay: "attendance",
  records: "record",
  publish: "publication",
};

export function buildHostMeetingDiary(input: {
  workspace: HostMeetingWorkspaceView;
  meetingDate: string;
  today: string;
  currentUrl: string | URL;
}): HostMeetingDiaryView {
  const currentStep = resolveCurrentStep(input);
  const currentIndex = DIARY_STEPS.findIndex((step) => step.id === currentStep);
  const publishedAllDone = input.workspace.lifecycle === "PUBLISHED";

  const steps = DIARY_STEPS.map((step, index): DiaryStep => ({
    id: step.id,
    label: step.label,
    state: stepState(index, currentIndex, publishedAllDone),
    detail: stepDetail(step.id, input.workspace),
    href: buildHostMeetingUrl(input.currentUrl, {
      task: step.task,
      overviewEditOpen: false,
      recordSource: "manual",
    }),
  }));

  return { steps, currentStep };
}

function resolveCurrentStep(input: {
  workspace: HostMeetingWorkspaceView;
  meetingDate: string;
  today: string;
}): DiaryStepId {
  const { lifecycle } = input.workspace;
  switch (lifecycle) {
    case "DRAFT":
      return "create";
    case "CLOSED":
      return "records";
    case "PUBLISHED":
      return "publish";
    case "OPEN": {
      if (input.today < input.meetingDate) {
        return hasUnansweredResponses(input.workspace) ? "responses" : "prepare";
      }
      return "meetingDay";
    }
  }
}

function hasUnansweredResponses(workspace: HostMeetingWorkspaceView): boolean {
  const responses = workspace.facts.find((fact) => fact.id === "responses");
  return responses?.tone === "attention";
}

function stepState(
  index: number,
  currentIndex: number,
  publishedAllDone: boolean,
): DiaryStep["state"] {
  if (publishedAllDone) return "done";
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "upcoming";
}

function stepDetail(id: DiaryStepId, workspace: HostMeetingWorkspaceView): string | null {
  const factId = STEP_FACT_ID[id];
  if (!factId) return null;
  return workspace.facts.find((fact) => fact.id === factId)?.label ?? null;
}
