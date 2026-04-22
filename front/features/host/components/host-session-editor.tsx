"use client";
import {
  type ChangeEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useRef,
  useState,
} from "react";
import type {
  AttendanceStatus,
  FeedbackDocumentResponse,
  HostSessionDeletionPreviewResponse,
  HostSessionDetailResponse,
} from "@/features/host/api/host-contracts";
import {
  buildHostSessionRequest,
  buildPublicationRequest,
  getDestructiveActionAvailability,
  hydrateHostSessionFormValues,
  initialAttendanceStatuses,
  initialFeedbackDocumentStatus,
  initialPublicationMode,
  initialPublicationSummary,
  questionDeadlineLabelForForm,
  type HostSessionPublicationAction,
  type HostSessionPublicationMode,
  type HostSessionPublicationRequest,
  type HostSessionRequest,
} from "@/features/host/model/host-session-editor-model";
import { BookCover } from "@/shared/ui/book-cover";
import { SessionIdentity } from "@/shared/ui/session-identity";
import {
  hostDashboardReturnTarget,
  readmatesReturnState,
  type ReadmatesReturnTarget,
} from "@/src/app/route-continuity";
import { Link } from "@/src/app/router-link";
import { HostSessionAttendanceEditor } from "./host-session-attendance-editor";
import { HostSessionDeletionPreviewDialog } from "./host-session-deletion-preview";
import { HostSessionFeedbackUpload } from "./host-session-feedback-upload";

const emptyManagementMessage = "세션을 만든 뒤 참석과 피드백 문서를 관리할 수 있습니다.";

const operationOrder = [
  "기본 정보 → 일정 확정",
  "모임 종료 후 출석 확정",
  "공개 요약 작성 → 공개 설정",
  "회차 피드백 문서 등록",
];

type MobileEditorSection = "basic" | "publish" | "attendance" | "report";
type PublicationMode = HostSessionPublicationMode;
type PublicationAction = HostSessionPublicationAction;
type SaveState = "idle" | "saving" | "saved" | "error";

type PublicationFeedback = {
  tone: "success" | "error";
  message: string;
};

const mobileEditorSections: { key: MobileEditorSection; label: string; tabId: string; panelIds: string[] }[] = [
  {
    key: "basic",
    label: "기본",
    tabId: "host-editor-tab-basic",
    panelIds: ["host-editor-panel-basic-info", "host-editor-panel-basic-schedule"],
  },
  {
    key: "publish",
    label: "공개",
    tabId: "host-editor-tab-publish",
    panelIds: ["host-editor-panel-publish"],
  },
  {
    key: "attendance",
    label: "출석",
    tabId: "host-editor-tab-attendance",
    panelIds: ["host-editor-panel-attendance"],
  },
  {
    key: "report",
    label: "문서",
    tabId: "host-editor-tab-report",
    panelIds: ["host-editor-panel-report"],
  },
];

function mobileEditorSectionConfig(section: MobileEditorSection) {
  return mobileEditorSections.find((item) => item.key === section) ?? mobileEditorSections[0];
}

function focusMobileEditorSection(section: MobileEditorSection) {
  globalThis.setTimeout(() => {
    document.getElementById(mobileEditorSectionConfig(section).tabId)?.focus();
  }, 0);
}

function handleMobileEditorSectionKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  activeSection: MobileEditorSection,
  onSectionChange: (section: MobileEditorSection) => void,
) {
  const keys = mobileEditorSections.map((section) => section.key);
  const currentIndex = keys.indexOf(activeSection);
  const lastIndex = keys.length - 1;
  const nextIndex =
    event.key === "ArrowRight"
      ? (currentIndex + 1) % keys.length
      : event.key === "ArrowLeft"
        ? (currentIndex - 1 + keys.length) % keys.length
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? lastIndex
            : -1;

  if (nextIndex < 0) {
    return;
  }

  event.preventDefault();
  const nextSection = keys[nextIndex];
  onSectionChange(nextSection);
  focusMobileEditorSection(nextSection);
}

type AttendanceWriteState = {
  inFlight: boolean;
  inFlightStatus: AttendanceStatus | null;
  queuedStatus: AttendanceStatus | null;
};

type JsonResponse<T> = Response & { json(): Promise<T> };

export type HostSessionEditorActions = {
  loadDeletionPreview: (sessionId: string) => Promise<JsonResponse<HostSessionDeletionPreviewResponse>>;
  deleteSession: (sessionId: string) => Promise<Response>;
  saveSession: (sessionId: string | null, request: HostSessionRequest) => Promise<Response>;
  savePublication: (sessionId: string, request: HostSessionPublicationRequest) => Promise<Response>;
  updateAttendance: (
    sessionId: string,
    attendance: Array<{ membershipId: string; attendanceStatus: AttendanceStatus }>,
  ) => Promise<Response>;
  uploadFeedbackDocument: (sessionId: string, formData: FormData) => Promise<JsonResponse<FeedbackDocumentResponse>>;
};

export default function HostSessionEditor({
  session,
  returnTarget = hostDashboardReturnTarget,
  actions,
}: {
  session?: HostSessionDetailResponse | null;
  returnTarget?: ReadmatesReturnTarget;
  actions: HostSessionEditorActions;
}) {
  const [formDefaults] = useState(() => hydrateHostSessionFormValues(session));
  const [title, setTitle] = useState(formDefaults.title);
  const [bookTitle, setBookTitle] = useState(formDefaults.bookTitle);
  const [bookAuthor, setBookAuthor] = useState(formDefaults.bookAuthor);
  const [bookLink, setBookLink] = useState(formDefaults.bookLink);
  const [bookImageUrl, setBookImageUrl] = useState(formDefaults.bookImageUrl);
  const [date, setDate] = useState(formDefaults.date);
  const [time, setTime] = useState(formDefaults.startTime);
  const [locationLabel, setLocationLabel] = useState(formDefaults.locationLabel);
  const [meetingUrl, setMeetingUrl] = useState(formDefaults.meetingUrl);
  const [meetingPasscode, setMeetingPasscode] = useState(formDefaults.meetingPasscode);
  const [publicationMode, setPublicationMode] = useState<PublicationMode>(() => initialPublicationMode(session));
  const [summary, setSummary] = useState(() => initialPublicationSummary(session));
  const [publicationActionInFlight, setPublicationActionInFlight] = useState<PublicationAction | null>(null);
  const [publicationFeedback, setPublicationFeedback] = useState<PublicationFeedback | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [activeMobileSection, setActiveMobileSection] = useState<MobileEditorSection>("basic");
  const [attendanceStatuses, setAttendanceStatuses] =
    useState<Record<string, AttendanceStatus>>(() => initialAttendanceStatuses(session?.attendees));
  const [feedbackDocument, setFeedbackDocument] = useState(
    () => initialFeedbackDocumentStatus(session),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePreview, setDeletePreview] = useState<HostSessionDeletionPreviewResponse | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletePreviewLoading, setDeletePreviewLoading] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const feedbackDocumentInputRef = useRef<HTMLInputElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  const deleteRestoreFocusRef = useRef<HTMLElement | null>(null);
  const committedAttendanceStatusesRef = useRef<Record<string, AttendanceStatus>>(
    initialAttendanceStatuses(session?.attendees),
  );
  const attendanceWriteStatesRef = useRef<Record<string, AttendanceWriteState>>({});
  const deadline = questionDeadlineLabelForForm(session, date);
  const isNewSession = session === null || session === undefined;
  const editorTitle = isNewSession ? "새 세션 만들기" : "이번 세션 편집";
  const primarySaveLabel = isNewSession ? "새 세션 만들기" : "변경 사항 저장";
  const saveButtonLabel = saveState === "saving" ? "변경사항을 저장하는 중" : primarySaveLabel;
  const saveGuidance = isNewSession
    ? "세션 기본 정보는 새 세션 만들기로, 공개 설정과 피드백 문서는 각 섹션의 버튼으로 따로 저장합니다."
    : "세션 기본 정보는 변경 사항 저장으로, 공개 설정과 피드백 문서는 각 섹션의 버튼으로 따로 저장합니다.";
  const feedbackPreviewState = session
    ? readmatesReturnState({
        href: `/app/host/sessions/${encodeURIComponent(session.sessionId)}/edit`,
        label: "세션 편집으로",
        state: readmatesReturnState(returnTarget),
      })
    : undefined;
  const destructiveActionAvailability = getDestructiveActionAvailability(session);

  const flash = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1600);
  };

  const deletionErrorMessage = (status?: number) => {
    if (status === 404) {
      return "세션을 찾을 수 없습니다.";
    }
    if (status === 409) {
      return "이미 닫히거나 공개된 세션은 삭제할 수 없습니다.";
    }
    return "세션 삭제에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.";
  };

  const closeDeleteModal = () => {
    if (deleteSubmitting) {
      return;
    }

    setDeleteModalOpen(false);
  };

  const openDeleteModal = async () => {
    if (!session || !destructiveActionAvailability.canDelete) {
      return;
    }

    deleteRestoreFocusRef.current = deleteTriggerRef.current;
    setDeleteModalOpen(true);
    setDeletePreview(null);
    setDeleteError(null);
    setDeletePreviewLoading(true);

    try {
      const response = await actions.loadDeletionPreview(session.sessionId);

      if (!response.ok) {
        setDeleteError(deletionErrorMessage(response.status));
        return;
      }

      setDeletePreview((await response.json()) as HostSessionDeletionPreviewResponse);
    } catch {
      setDeleteError(deletionErrorMessage());
    } finally {
      setDeletePreviewLoading(false);
    }
  };

  const confirmDeleteSession = async () => {
    if (!session || !deletePreview || deleteSubmitting) {
      return;
    }

    setDeleteError(null);
    setDeleteSubmitting(true);

    try {
      const response = await actions.deleteSession(session.sessionId);

      if (!response.ok) {
        setDeleteError(deletionErrorMessage(response.status));
        return;
      }

      globalThis.location.href = "/app/host/sessions/new";
    } catch {
      setDeleteError(deletionErrorMessage());
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saveState === "saving") {
      return;
    }

    setSaveState("saving");
    const payload = buildHostSessionRequest({
      title,
      bookTitle,
      bookAuthor,
      bookLink,
      bookImageUrl,
      locationLabel,
      meetingUrl,
      meetingPasscode,
      date,
      startTime: time,
    }, session ?? undefined);
    try {
      const response = await actions.saveSession(session?.sessionId ?? null, payload);

      if (response.ok) {
        setSaveState("saved");
        globalThis.location.href = "/app/session/current";
        return;
      }

      setSaveState("error");
      flash("저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도하세요");
    } catch {
      setSaveState("error");
      flash("저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도하세요");
    }
  };

  const savePublication = async (action: PublicationAction) => {
    if (!session || publicationActionInFlight) {
      return;
    }

    const publicationRequest = buildPublicationRequest(summary, action);

    if (!publicationRequest) {
      setPublicationFeedback({
        tone: "error",
        message: "공개 요약을 입력한 뒤 저장해주세요.",
      });
      return;
    }

    setPublicationActionInFlight(action);
    setPublicationFeedback(null);

    try {
      const response = await actions.savePublication(session.sessionId, publicationRequest);

      if (!response.ok) {
        setPublicationFeedback({
          tone: "error",
          message:
            response.status === 400
              ? "공개 요약을 입력한 뒤 저장해주세요."
              : "공개 설정 저장에 실패했습니다. 요약 내용을 확인한 뒤 다시 시도해 주세요.",
        });
        return;
      }

      setSummary(publicationRequest.publicSummary);
      setPublicationMode(publicationRequest.isPublic ? "public" : "draft");
      setPublicationFeedback({
        tone: "success",
        message: publicationRequest.isPublic ? "공개 기록을 발행했습니다." : "요약 초안을 저장했습니다.",
      });
    } catch {
      setPublicationFeedback({
        tone: "error",
        message: "공개 설정 저장에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도해 주세요.",
      });
    } finally {
      setPublicationActionInFlight(null);
    }
  };

  const updateAttendance = async (membershipId: string, attendanceStatus: AttendanceStatus) => {
    if (!session) {
      return;
    }

    setAttendanceStatuses((current) => ({ ...current, [membershipId]: attendanceStatus }));

    const writeState = attendanceWriteStatesRef.current[membershipId] ?? {
      inFlight: false,
      inFlightStatus: null,
      queuedStatus: null,
    };
    attendanceWriteStatesRef.current[membershipId] = writeState;

    if (writeState.inFlight) {
      writeState.queuedStatus = writeState.inFlightStatus === attendanceStatus ? null : attendanceStatus;
      return;
    }

    const sendAttendanceWrite = async (status: AttendanceStatus) => {
      const currentWriteState = attendanceWriteStatesRef.current[membershipId] ?? {
        inFlight: false,
        inFlightStatus: null,
        queuedStatus: null,
      };
      attendanceWriteStatesRef.current[membershipId] = currentWriteState;
      currentWriteState.inFlight = true;
      currentWriteState.inFlightStatus = status;

      let writeSucceeded = false;

      const rollbackToCommittedStatus = () => {
        const committedStatus = committedAttendanceStatusesRef.current[membershipId] ?? "UNKNOWN";

        setAttendanceStatuses((current) => {
          if (currentWriteState.queuedStatus !== null) {
            return current;
          }

          return { ...current, [membershipId]: committedStatus };
        });
      };

      try {
        const response = await actions.updateAttendance(session.sessionId, [{ membershipId, attendanceStatus: status }]);

        writeSucceeded = response.ok;

        if (response.ok) {
          committedAttendanceStatusesRef.current[membershipId] = status;

          if (currentWriteState.queuedStatus === null || currentWriteState.queuedStatus === status) {
            currentWriteState.queuedStatus = null;
          }
        } else if (currentWriteState.queuedStatus === null) {
          rollbackToCommittedStatus();
          flash("출석 저장에 실패했습니다. 다시 선택해 주세요");
        }
      } catch {
        if (currentWriteState.queuedStatus === null) {
          rollbackToCommittedStatus();
          flash("출석 저장에 실패했습니다. 다시 선택해 주세요");
        }
      } finally {
        const nextStatus = currentWriteState.queuedStatus;
        currentWriteState.inFlight = false;
        currentWriteState.inFlightStatus = null;
        currentWriteState.queuedStatus = null;

        if (nextStatus !== null) {
          void sendAttendanceWrite(nextStatus);
        } else if (!writeSucceeded) {
          delete attendanceWriteStatesRef.current[membershipId];
        }
      }
    };

    void sendAttendanceWrite(attendanceStatus);
  };

  const uploadFeedbackDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!session) {
      input.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await actions.uploadFeedbackDocument(session.sessionId, formData);

      if (!response.ok) {
        flash("피드백 문서 업로드에 실패했습니다. 파일 형식과 권한을 확인해 주세요");
        return;
      }

      const uploaded = (await response.json()) as FeedbackDocumentResponse;
      setFeedbackDocument({
        uploaded: true,
        fileName: uploaded.fileName,
        uploadedAt: uploaded.uploadedAt,
      });
      flash("피드백 문서가 업로드되었습니다");
    } catch {
      flash("피드백 문서 업로드에 실패했습니다. 네트워크 연결을 확인한 뒤 다시 시도하세요");
    } finally {
      input.value = "";
    }
  };

  return (
    <main className="rm-host-session-editor">
      <section className="page-header-compact">
        <div className="container">
          <div className="row-between" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <div>
                <Link to={returnTarget.href} state={returnTarget.state} className="btn btn-quiet btn-sm" style={{ marginBottom: 14 }}>
                  {returnTarget.label}
                </Link>
              <div className="eyebrow">세션 운영 문서 · {isNewSession ? "새 세션" : `No.${session.sessionNumber}`}</div>
              <h1 className="h1 editorial" style={{ margin: "6px 0 4px" }}>
                {editorTitle}
              </h1>
              <div style={{ marginTop: "10px" }}>
                {session ? (
                  <SessionIdentity
                    sessionNumber={session.sessionNumber}
                    state={session.state}
                    date={session.date}
                    published={session.publication?.isPublic ?? false}
                    feedbackDocumentAvailable={session.feedbackDocument.uploaded}
                  />
                ) : (
                  <div className="rm-session-identity">
                    <span className="rm-session-identity__chip">새 세션 초안</span>
                    <span className="rm-session-identity__chip">비공개</span>
                  </div>
                )}
              </div>
              <div className="small" style={{ marginTop: "8px" }}>
                {session
                  ? `${session.title}의 책, 일정, 링크, 출석, 공개 설정, 피드백 문서를 한 문서에서 관리합니다.`
                  : "새 세션의 책, 일정, 장소, 링크를 먼저 등록합니다."}
              </div>
              <div
                className="tiny"
                id="host-session-save-state"
                role={saveState === "idle" ? undefined : saveState === "error" ? "alert" : "status"}
                style={{ marginTop: "8px", color: saveState === "error" ? "var(--danger)" : "var(--text-3)" }}
              >
                {saveState === "saving"
                  ? "기본 정보를 저장하고 있습니다."
                  : saveState === "saved"
                    ? "저장되었습니다. 현재 세션으로 이동합니다."
                    : saveState === "error"
                      ? "저장에 실패했습니다. 입력값을 확인한 뒤 다시 시도하세요."
                      : "기본 정보 저장, 공개 발행, 피드백 문서 업로드는 각각 별도로 처리됩니다."}
              </div>
            </div>
            <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
              <button
                className="btn btn-primary"
                type="submit"
                form="host-session-editor"
                disabled={saveState === "saving"}
                aria-describedby="host-session-save-state"
              >
                {saveButtonLabel}
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="mobile-only rm-host-session-editor__segments">
        <div
          className="m-hscroll"
          role="tablist"
          aria-label="호스트 편집 섹션"
          data-testid="host-editor-mobile-segments"
          onKeyDown={(event) =>
            handleMobileEditorSectionKeyDown(event, activeMobileSection, setActiveMobileSection)
          }
          style={{ padding: 0, gap: 6 }}
        >
          {mobileEditorSections.map((section) => {
            const selected = activeMobileSection === section.key;

            return (
              <button
                key={section.key}
                id={section.tabId}
                type="button"
                role="tab"
                className={`m-chip${selected ? " is-on" : ""}`}
                aria-selected={selected}
                aria-controls={section.panelIds.join(" ")}
                tabIndex={selected ? 0 : -1}
                onClick={() => setActiveMobileSection(section.key)}
                style={{ height: 34, padding: "0 14px" }}
              >
                {section.label}
              </button>
            );
          })}
        </div>
      </div>

      <section className="rm-host-session-editor__content">
        <div className="container">
          <div className="rm-host-session-editor__layout">
            <form
              id="host-session-editor"
              onSubmit={handleSubmit}
              className="stack"
              style={{ "--stack": "28px" } as CSSProperties}
            >
              <Panel
                eyebrow="책 · 세션 identity"
                title="책과 세션 이름"
                mobileSection="basic"
                panelId="host-editor-panel-basic-info"
                activeMobileSection={activeMobileSection}
              >
                <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
                  <div>
                    <label className="label" htmlFor="session-title">
                      세션 제목
                    </label>
                    <input
                      id="session-title"
                      className="input"
                      value={title}
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </div>
                  <div className="grid-2">
                    <div>
                      <label className="label" htmlFor="book-title">
                        책 제목
                      </label>
                      <input
                        id="book-title"
                        className="input"
                        value={bookTitle}
                        onChange={(event) => setBookTitle(event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="book-author">
                        저자
                      </label>
                      <input
                        id="book-author"
                        className="input"
                        value={bookAuthor}
                        onChange={(event) => setBookAuthor(event.target.value)}
                      />
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "18px", alignItems: "end" }}>
                    <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
                      <div>
                        <label className="label" htmlFor="book-link">
                          책 링크
                        </label>
                        <input
                          id="book-link"
                          className="input"
                          value={bookLink}
                          onChange={(event) => setBookLink(event.target.value)}
                          placeholder="https://product.kyobobook.co.kr/..."
                        />
                        <div className="tiny" style={{ marginTop: "6px", color: "var(--text-3)" }}>
                          교보·알라딘·예스24·출판사 페이지 등 어디든 괜찮아요. 공개/멤버 페이지에 “책 정보 보기”로
                          노출돼요.
                        </div>
                      </div>
                      <div>
                        <label className="label" htmlFor="book-image-url">
                          책 이미지 URL
                        </label>
                        <input
                          id="book-image-url"
                          className="input"
                          value={bookImageUrl}
                          onChange={(event) => setBookImageUrl(event.target.value)}
                          placeholder="https://image.example.com/book-cover.jpg"
                        />
                      </div>
                    </div>
                    <BookCover title={bookTitle} author={bookAuthor} imageUrl={bookImageUrl} width={96} />
                  </div>
                </div>
              </Panel>

              <Panel
                eyebrow="일정 · 장소 · 링크"
                title="일정과 참여 링크"
                mobileSection="basic"
                panelId="host-editor-panel-basic-schedule"
                activeMobileSection={activeMobileSection}
              >
                <div className="grid-3">
                  <div>
                    <label className="label" htmlFor="session-date">
                      모임 날짜
                    </label>
                    <input
                      id="session-date"
                      className="input"
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="session-time">
                      시작 시간
                    </label>
                    <input
                      id="session-time"
                      className="input"
                      type="time"
                      value={time}
                      onChange={(event) => setTime(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="question-deadline">
                      질문 제출 마감
                    </label>
                    <input
                      id="question-deadline"
                      className="input"
                      value={deadline}
                      readOnly
                    />
                  </div>
                </div>
                <div style={{ marginTop: "14px" }}>
                  <label className="label" htmlFor="session-location">
                    장소
                  </label>
                  <input
                    id="session-location"
                    className="input"
                    value={locationLabel}
                    onChange={(event) => setLocationLabel(event.target.value)}
                  />
                </div>
                <div className="grid-2" style={{ marginTop: "14px" }}>
                  <div>
                    <label className="label" htmlFor="meeting-url">
                      미팅 URL
                    </label>
                    <input
                      id="meeting-url"
                      className="input"
                      value={meetingUrl}
                      onChange={(event) => setMeetingUrl(event.target.value)}
                      placeholder="https://meet.google.com/..."
                    />
                    <div className="tiny" style={{ marginTop: "6px" }}>
                      저장 즉시 멤버의 홈과 세션 화면에 링크가 노출됩니다.
                    </div>
                  </div>
                  <div>
                    <label className="label" htmlFor="meeting-passcode">
                      Passcode · 선택
                    </label>
                    <input
                      id="meeting-passcode"
                      className="input"
                      value={meetingPasscode}
                      onChange={(event) => setMeetingPasscode(event.target.value)}
                      placeholder="선택 사항"
                    />
                  </div>
                </div>
                <div className="marginalia" style={{ marginTop: "12px" }}>
                  일정과 링크는 저장 즉시 멤버 홈과 현재 세션 화면에 반영됩니다. 자동 안내 발송은 아직 연결되지 않았습니다.
                </div>
              </Panel>

              <Panel
                eyebrow="공개 · 발행 controls"
                title="공개 기록 발행"
                tone="warn"
                mobileSection="publish"
                panelId="host-editor-panel-publish"
                activeMobileSection={activeMobileSection}
              >
                <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
                  <div>
                    <label className="label">공개 상태</label>
                    <div className="row" style={{ gap: "8px", flexWrap: "wrap" }}>
                      {[
                        { key: "internal", label: "내부 공개", description: "공개 기록이 저장되지 않은 기본 상태" },
                        { key: "draft", label: "요약 초안 저장", description: "공개 요약을 서버에 초안으로 저장" },
                        { key: "public", label: "공개 기록 발행", description: "공개 클럽 페이지에 노출" },
                      ].map((option) => {
                        const selected = publicationMode === option.key;

                        return (
                          <div
                            key={option.key}
                            aria-current={selected ? "step" : undefined}
                            style={{
                              padding: "10px 14px",
                              borderRadius: "8px",
                              textAlign: "left",
                              border: `1px solid ${selected ? "var(--accent)" : "var(--line)"}`,
                              background: selected ? "var(--accent-soft)" : "var(--bg)",
                              minWidth: "170px",
                            }}
                          >
                            <div
                              className="body"
                              style={{
                                fontSize: "13.5px",
                                fontWeight: 500,
                                color: selected ? "var(--accent)" : "var(--text)",
                              }}
                            >
                              {option.label}
                            </div>
                            <div className="tiny" style={{ color: "var(--text-3)" }}>
                              {option.description}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {!session ? (
                    <div id="publication-disabled-reason" className="marginalia">
                      세션을 만든 뒤 공개 요약 초안 저장과 공개 기록 발행을 사용할 수 있습니다.
                    </div>
                  ) : null}
                </div>
                <hr className="divider-soft" style={{ margin: "20px 0" }} />
                <div>
                  <label className="label" htmlFor="public-summary">
                    공개 요약
                  </label>
                  <textarea
                    id="public-summary"
                    className="textarea"
                    rows={3}
                    value={summary}
                    onChange={(event) => {
                      setSummary(event.target.value);
                      if (publicationFeedback?.tone === "error") {
                        setPublicationFeedback(null);
                      }
                    }}
                    placeholder="모임의 분위기와 대화의 결을 2~3문장으로 짧게."
                    aria-describedby="publication-summary-help publication-feedback"
                  />
                  <div id="publication-summary-help" className="tiny" style={{ marginTop: "6px", color: "var(--text-3)" }}>
                    요약 초안은 공개 페이지에 노출되지 않고, 공개 기록 발행 후에만 노출됩니다.
                  </div>
                </div>
                <div className="row" style={{ gap: "8px", flexWrap: "wrap", marginTop: "16px" }}>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={!session || publicationActionInFlight !== null}
                    aria-describedby={!session ? "publication-disabled-reason" : undefined}
                    onClick={() => void savePublication("draft")}
                  >
                    {publicationActionInFlight === "draft" ? "변경사항을 저장하는 중" : "요약 초안 저장"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!session || publicationActionInFlight !== null}
                    aria-describedby={!session ? "publication-disabled-reason" : undefined}
                    onClick={() => void savePublication("public")}
                  >
                    {publicationActionInFlight === "public" ? "공개 기록을 발행하는 중" : "공개 기록 발행"}
                  </button>
                </div>
                {publicationFeedback ? (
                  <div
                    id="publication-feedback"
                    role={publicationFeedback.tone === "error" ? "alert" : "status"}
                    className={publicationFeedback.tone === "error" ? "marginalia" : "small"}
                    style={{
                      marginTop: "12px",
                      color: publicationFeedback.tone === "error" ? "var(--danger)" : "var(--accent)",
                    }}
                  >
                    {publicationFeedback.message}
                  </div>
                ) : (
                  <div id="publication-feedback" />
                )}
              </Panel>

              <Panel
                eyebrow="참석 roster"
                title="출석 확정 roster"
                mobileSection="attendance"
                panelId="host-editor-panel-attendance"
                activeMobileSection={activeMobileSection}
              >
                <HostSessionAttendanceEditor
                  hasSession={Boolean(session)}
                  attendees={session?.attendees}
                  attendanceStatuses={attendanceStatuses}
                  emptyMessage={emptyManagementMessage}
                  onUpdateAttendance={updateAttendance}
                />
              </Panel>

              <Panel
                eyebrow="피드백 문서 · 민감"
                title="피드백 문서"
                tone="warn"
                mobileSection="report"
                panelId="host-editor-panel-report"
                activeMobileSection={activeMobileSection}
              >
                <HostSessionFeedbackUpload
                  sessionId={session?.sessionId}
                  feedbackDocument={{ uploaded: feedbackDocument.uploaded, fileName: feedbackDocument.fileName }}
                  inputRef={feedbackDocumentInputRef}
                  emptyMessage={emptyManagementMessage}
                  previewState={feedbackPreviewState}
                  onUploadFeedbackDocument={uploadFeedbackDocument}
                />
              </Panel>
            </form>

            <aside className="stack rm-host-session-editor__aside" style={{ "--stack": "20px" } as CSSProperties}>
              <DocumentStatePanel
                session={session}
                saveState={saveState}
                publicationMode={publicationMode}
                feedbackDocumentUploaded={feedbackDocument.uploaded}
              />

              <div className="surface" style={{ padding: "22px" }}>
                <div className="eyebrow" style={{ marginBottom: "10px" }}>
                  저장 안내
                </div>
                <p className="small" style={{ margin: 0, color: "var(--text-2)" }}>
                  {saveGuidance}
                </p>
              </div>

              <div className="surface-quiet" style={{ padding: "22px" }}>
                <div className="eyebrow" style={{ marginBottom: "10px" }}>
                  운영 순서
                </div>
                <ol className="small" style={{ margin: 0, paddingLeft: "16px" }}>
                  {operationOrder.map((item) => (
                    <li key={item} style={{ marginBottom: "6px" }}>
                      {item}
                    </li>
                  ))}
                </ol>
              </div>

              {session ? (
                <div className="surface" style={{ padding: "22px" }}>
                  <div className="eyebrow" style={{ marginBottom: "10px" }}>
                    위험 작업
                  </div>
                  <button
                    ref={deleteTriggerRef}
                    className="btn btn-ghost btn-sm u-w-full"
                    type="button"
                    disabled={!destructiveActionAvailability.canDelete}
                    onClick={openDeleteModal}
                    style={{ justifyContent: "flex-start", color: "var(--danger)" }}
                  >
                    세션 삭제
                  </button>
                  <div className="tiny" style={{ marginTop: "8px" }}>
                    {destructiveActionAvailability.guidance}
                  </div>
                </div>
              ) : null}
            </aside>
          </div>
        </div>
      </section>

      {deleteModalOpen ? (
        <HostSessionDeletionPreviewDialog
          preview={deletePreview}
          previewLoading={deletePreviewLoading}
          error={deleteError}
          submitting={deleteSubmitting}
          restoreFocusRef={deleteRestoreFocusRef}
          onClose={closeDeleteModal}
          onConfirm={confirmDeleteSession}
        />
      ) : null}

      {toast ? (
        <div role="status" className="m-toast is-on">
          ✓ {toast}
        </div>
      ) : null}
    </main>
  );
}

function Panel({
  eyebrow,
  title,
  children,
  tone,
  mobileSection,
  panelId,
  activeMobileSection,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  tone?: "warn";
  mobileSection: MobileEditorSection;
  panelId: string;
  activeMobileSection: MobileEditorSection;
}) {
  const warn = tone === "warn";
  const isMobileActive = mobileSection === activeMobileSection;
  const sectionConfig = mobileEditorSectionConfig(mobileSection);

  return (
    <section
      id={panelId}
      role="tabpanel"
      aria-labelledby={sectionConfig.tabId}
      className={`surface rm-host-session-editor__section${isMobileActive ? " is-mobile-active" : ""}`}
      data-mobile-editor-section={mobileSection}
      style={{
        padding: "28px",
        borderColor: warn ? "color-mix(in oklch, var(--warn), var(--line) 70%)" : "var(--line)",
      }}
    >
      <div className="row-between" style={{ marginBottom: "18px" }}>
        <div>
          <div className="eyebrow" style={{ color: warn ? "var(--warn)" : "var(--text-3)" }}>
            {eyebrow}
          </div>
          <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>
            {title}
          </h2>
        </div>
      </div>
      {children}
    </section>
  );
}

function DocumentStatePanel({
  session,
  saveState,
  publicationMode,
  feedbackDocumentUploaded,
}: {
  session?: HostSessionDetailResponse | null;
  saveState: SaveState;
  publicationMode: PublicationMode;
  feedbackDocumentUploaded: boolean;
}) {
  const rows = [
    {
      label: "문서 상태",
      value: session ? sessionStateLabel(session.state) : "새 세션 초안",
      className: sessionStateBadgeClass(session?.state),
    },
    {
      label: "기본 정보",
      value: saveState === "saving" ? "기본 정보 저장 중" : saveState === "error" ? "저장 실패" : session ? "저장됨" : "저장 전",
      className: saveState === "error" ? "badge badge-warn badge-dot" : saveState === "saving" ? "badge badge-accent badge-dot" : "badge",
    },
    {
      label: "공개 기록",
      value: publicationMode === "public" ? "발행됨" : publicationMode === "draft" ? "초안 저장" : "미공개",
      className: publicationMode === "public" ? "badge badge-ok badge-dot" : publicationMode === "draft" ? "badge badge-accent badge-dot" : "badge",
    },
    {
      label: "피드백",
      value: feedbackDocumentUploaded ? "문서 등록" : "미등록",
      className: feedbackDocumentUploaded ? "badge badge-ok badge-dot" : "badge",
    },
    {
      label: "참석 roster",
      value: session ? `${session.attendees.length}명` : "세션 저장 후",
      className: session?.attendees.length ? "badge badge-ok badge-dot" : "badge",
    },
  ];

  return (
    <div className="rm-document-panel" style={{ padding: "22px" }}>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        문서 상태
      </div>
      <div className="stack" style={{ "--stack": "9px" } as CSSProperties}>
        {rows.map((row) => (
          <div key={row.label} className="row-between" style={{ gap: 12 }}>
            <span className="small" style={{ color: "var(--text-2)" }}>
              {row.label}
            </span>
            <span className={row.className}>{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function sessionStateLabel(state?: HostSessionDetailResponse["state"]) {
  if (state === "OPEN") {
    return "열림";
  }

  if (state === "PUBLISHED") {
    return "공개됨";
  }

  if (state === "CLOSED") {
    return "닫힘";
  }

  if (state === "DRAFT") {
    return "초안";
  }

  return "저장 전";
}

function sessionStateBadgeClass(state?: HostSessionDetailResponse["state"]) {
  if (state === "OPEN") {
    return "badge badge-accent badge-dot";
  }

  if (state === "PUBLISHED") {
    return "badge badge-ok badge-dot";
  }

  if (state === "CLOSED") {
    return "badge badge-warn badge-dot";
  }

  return "badge";
}
