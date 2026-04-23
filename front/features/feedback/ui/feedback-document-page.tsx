"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { FeedbackDocumentView, FeedbackUnavailableReason } from "@/features/feedback/model/feedback-document-model";
import {
  appFeedbackHref,
  archiveReportReturnTarget,
  feedbackUnavailableCopy,
  readmatesReturnState,
  type ReadmatesReturnTarget,
} from "@/features/feedback/model/feedback-document-model";
import { Link } from "@/features/feedback/ui/feedback-link";

const singlePagePrintStyleId = "rm-feedback-document-single-page-print-style";
const printPageExtraMinHeightPx = 520;
const printPageExtraHeightRatio = 0.12;
const printStyleCleanupDelayMs = 30_000;

type FeedbackDocumentPageProps = {
  document: FeedbackDocumentView;
  printMode?: boolean;
  returnTarget?: ReadmatesReturnTarget;
};

type FeedbackDocumentUnavailablePageProps = {
  reason: FeedbackUnavailableReason;
  printMode?: boolean;
  returnTarget?: ReadmatesReturnTarget;
};

export default function FeedbackDocumentPage({
  document,
  printMode = false,
  returnTarget = archiveReportReturnTarget,
}: FeedbackDocumentPageProps) {
  const feedbackHref = appFeedbackHref(document.sessionId);
  const returnState = readmatesReturnState(returnTarget);
  const showHeaderActions = printMode;

  return (
    <main className={`rm-feedback-document-page${printMode ? " rm-feedback-document-page--print" : ""}`}>
      {printMode ? <PrintOnFirstRender /> : null}
      <FeedbackDocumentStyles />
      <section className="page-header-compact">
        <div className="container">
          <div className="row-between" style={{ alignItems: "flex-end", gap: 18, flexWrap: "wrap" }}>
            <div className="rm-feedback-document-heading">
              <p className="eyebrow rm-feedback-document-kicker" style={{ margin: 0 }}>
                <FeedbackReturnLink returnTarget={returnTarget} className="rm-feedback-document-return-action" />
                {shouldShowFeedbackReturnLink(returnTarget) ? (
                  <span className="rm-feedback-document-kicker__divider">·</span>
                ) : null}
                <span>피드백 문서</span>
              </p>
              <h1 className="h1 editorial" style={{ margin: "6px 0 6px" }}>
                {document.title}
              </h1>
              <div className="rm-feedback-document-meta-row">
                <div className="rm-feedback-document-meta-copy">
                  <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                    {document.subtitle}
                  </p>
                  <p className="tiny mono" style={{ color: "var(--text-3)", margin: "8px 0 0" }}>
                    보존 문서 · 참석자 열람본
                  </p>
                </div>
                {!printMode ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm rm-feedback-document-pdf-action"
                    onClick={printFeedbackDocumentAsSinglePage}
                  >
                    PDF로 저장
                  </button>
                ) : null}
              </div>
            </div>
            {showHeaderActions ? (
              <div className="row rm-feedback-document-actions rm-feedback-document-header-actions" style={{ gap: 8, flexWrap: "wrap" }}>
                {printMode ? (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={printFeedbackDocumentAsSinglePage}>
                      인쇄
                    </button>
                    <Link className="btn btn-quiet btn-sm" to={feedbackHref} state={returnState}>
                      문서로 돌아가기
                    </Link>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section style={{ padding: "32px 0 84px" }}>
        <div className="container">
          <div className="stack" style={{ "--stack": "40px", maxWidth: 920, margin: "0 auto" } as CSSProperties}>
            <DocumentMeta document={document} />
            <ObserverNotes notes={document.observerNotes} />
            <ParticipantSections participants={document.participants} />
          </div>
        </div>
      </section>
    </main>
  );
}

function shouldShowFeedbackReturnLink(returnTarget: ReadmatesReturnTarget) {
  return !(returnTarget.href === "/app/me" && returnTarget.label === "내 공간으로 돌아가기");
}

function returnLinkAriaLabel(label: string) {
  if (!label) {
    return "돌아가기";
  }

  return label.includes("돌아가기") ? label : `${label} 돌아가기`;
}

function feedbackBackLabel(returnTarget: ReadmatesReturnTarget) {
  if (returnTarget.href === "/app/me") {
    return "내 공간";
  }

  if (returnTarget.href.startsWith("/app/sessions/")) {
    return "세션";
  }

  if (returnTarget.href.startsWith("/app/archive")) {
    return "아카이브";
  }

  return "이전 화면";
}

function FeedbackReturnLink({ returnTarget, className }: { returnTarget: ReadmatesReturnTarget; className: string }) {
  if (!shouldShowFeedbackReturnLink(returnTarget)) {
    return null;
  }

  return (
    <Link className={className} to={returnTarget.href} state={returnTarget.state} aria-label={returnLinkAriaLabel(returnTarget.label)}>
      ← {feedbackBackLabel(returnTarget)}
    </Link>
  );
}

function PrintOnFirstRender() {
  const hasPrinted = useRef(false);

  useEffect(() => {
    if (hasPrinted.current || typeof globalThis.print !== "function") {
      return;
    }

    hasPrinted.current = true;
    printFeedbackDocumentAsSinglePage();
  }, []);

  return null;
}

function printFeedbackDocumentAsSinglePage() {
  if (typeof document === "undefined" || typeof globalThis.print !== "function") {
    return;
  }

  const page = document.querySelector<HTMLElement>(".rm-feedback-document-page");

  if (!page) {
    globalThis.print();
    return;
  }

  document.getElementById(singlePagePrintStyleId)?.remove();

  const size = measureFeedbackDocumentPrintSize(page);
  const style = document.createElement("style");
  style.id = singlePagePrintStyleId;
  style.textContent = `
    @page {
      size: ${size.width}px ${size.height}px;
      margin: 0;
    }

    @media print {
      html,
      body {
        width: ${size.width}px !important;
        min-width: ${size.width}px !important;
        margin: 0 !important;
        overflow: visible !important;
      }

      .rm-route-reveal {
        animation: none !important;
        opacity: 1 !important;
        transform: none !important;
      }

      .rm-feedback-document-page {
        width: ${size.width}px !important;
      }

      .rm-feedback-document-page section,
      .rm-feedback-document-page article,
      .rm-feedback-document-page blockquote {
        break-inside: auto !important;
        page-break-inside: auto !important;
      }
    }
  `;
  (document.body ?? document.documentElement).appendChild(style);

  const cleanup = () => {
    globalThis.clearTimeout(cleanupTimeout);
    style.remove();
    if (typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("afterprint", cleanup);
    }
  };

  if (typeof globalThis.addEventListener === "function") {
    globalThis.addEventListener("afterprint", cleanup, { once: true });
  }

  const cleanupTimeout = globalThis.setTimeout(cleanup, printStyleCleanupDelayMs);
  globalThis.print();
}

function measureFeedbackDocumentPrintSize(page: HTMLElement) {
  const rect = page.getBoundingClientRect();
  const documentElement = document.documentElement;
  const body = document.body;
  const measuredWidth = Math.max(Math.ceil(rect.width), page.scrollWidth);
  const measuredHeight = Math.max(Math.ceil(rect.height), page.scrollHeight);
  const fallbackWidth = Math.max(
    documentElement.clientWidth,
    body?.clientWidth ?? 0,
    Math.ceil(globalThis.innerWidth || 0),
  );
  const fallbackHeight = Math.max(documentElement.scrollHeight, body?.scrollHeight ?? 0);
  const width = Math.max(1, measuredWidth || fallbackWidth);
  const height = Math.max(1, measuredHeight || fallbackHeight);

  return {
    width,
    height: height + Math.max(printPageExtraMinHeightPx, Math.ceil(height * printPageExtraHeightRatio)),
  };
}

export function FeedbackDocumentUnavailablePage({
  reason,
  printMode = false,
  returnTarget = archiveReportReturnTarget,
}: FeedbackDocumentUnavailablePageProps) {
  const copy = feedbackUnavailableCopy(reason);

  return (
    <main className={`rm-feedback-document-page${printMode ? " rm-feedback-document-page--print" : ""}`}>
      <FeedbackDocumentStyles />
      <section className="page-header-compact">
        <div className="container">
          <div className="rm-feedback-locked-document stack" style={{ "--stack": "14px", maxWidth: 720 } as CSSProperties}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {copy.eyebrow}
            </p>
            <h1 className="h1 editorial" style={{ margin: 0 }}>
              {copy.title}
            </h1>
            <p className="body" style={{ color: "var(--text-2)", margin: 0, maxWidth: 560 }}>
              {copy.body}
            </p>
            <div className={reason === "forbidden" ? "rm-locked-state" : "rm-empty-state"} role="note" style={{ padding: "18px 20px" }}>
              <div className="eyebrow">열람 규칙</div>
              <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
                {reason === "forbidden"
                  ? "정식 멤버이며 해당 회차 참석 기록이 있는 계정만 문서 본문과 PDF 저장을 사용할 수 있습니다."
                  : "문서가 등록되지 않은 회차는 본문과 PDF 저장 버튼을 표시하지 않습니다."}
              </p>
            </div>
            <div className="row rm-feedback-document-actions" style={{ gap: 8, flexWrap: "wrap" }}>
              <FeedbackReturnLink returnTarget={returnTarget} className="btn btn-ghost rm-feedback-document-return-action" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function DocumentMeta({ document }: { document: FeedbackDocumentView }) {
  if (document.metadata.length === 0) {
    return null;
  }

  return (
    <section className="surface rm-feedback-document-meta" style={{ padding: 24 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 16,
        }}
      >
        {document.metadata.map((item) => (
          <div key={`${item.label}-${item.value}`}>
            <div className="eyebrow">{item.label}</div>
            <div className="body" style={{ fontSize: 14, marginTop: 4 }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ObserverNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <section className="surface-quiet rm-feedback-observer-notes" style={{ padding: 26 }}>
      <div className="eyebrow" style={{ marginBottom: 14 }}>
        관찰 메모
      </div>
      <div className="stack" style={{ "--stack": "12px" } as CSSProperties}>
        {notes.map((note) => (
          <p key={note} className="body editorial" style={{ fontSize: 16, lineHeight: 1.65, margin: 0 }}>
            {note}
          </p>
        ))}
      </div>
    </section>
  );
}

function ParticipantSections({ participants }: { participants: FeedbackDocumentView["participants"] }) {
  return (
    <div className="stack" style={{ "--stack": "32px" } as CSSProperties}>
      {participants.map((participant) => (
        <section
          key={`${participant.number}-${participant.name}`}
          className="surface rm-feedback-participant-document"
          style={{ padding: 30 }}
        >
          <div className="row-between" style={{ alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
            <div>
              <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                참여자 {String(participant.number).padStart(2, "0")}
              </div>
              <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>
                {participant.name}
              </h2>
              <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
                {participant.role}
              </p>
            </div>
          </div>

          <div className="grid-2" style={{ gap: 18, marginTop: 24 }}>
            <BulletSection title="발화 스타일" items={participant.style} />
            <BulletSection title="기여" items={participant.contributions} />
          </div>

          <ProblemBlocks problems={participant.problems} />
          <ActionItems items={participant.actionItems} />
          <QuoteBlock quote={participant.revealingQuote} />
        </section>
      ))}
    </div>
  );
}

function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="surface-quiet" style={{ padding: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 10 }}>
        {title}
      </div>
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {items.map((item) => (
          <li key={item} className="small" style={{ color: "var(--text-2)", marginTop: 6 }}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProblemBlocks({ problems }: { problems: FeedbackDocumentView["participants"][number]["problems"] }) {
  if (problems.length === 0) {
    return null;
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        문제
      </div>
      <div className="stack" style={{ "--stack": "14px" } as CSSProperties}>
        {problems.map((problem) => (
          <article key={problem.title} className="surface-quiet" style={{ padding: 20 }}>
            <h3 className="body editorial" style={{ fontSize: 17, margin: 0 }}>
              {problem.title}
            </h3>
            <dl className="rm-feedback-problem-fields" style={{ margin: "16px 0 0" }}>
              <ProblemField label="핵심" value={problem.core} />
              <ProblemField label="근거" value={problem.evidence} />
              <ProblemField label="해석" value={problem.interpretation} />
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}

function ProblemField({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="eyebrow">{label}</dt>
      <dd className="small" style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
        {value}
      </dd>
    </>
  );
}

function ActionItems({ items }: { items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section style={{ marginTop: 28 }}>
      <div className="eyebrow" style={{ marginBottom: 12 }}>
        다음 액션
      </div>
      <div className="stack" style={{ "--stack": "8px" } as CSSProperties}>
        {items.map((item) => (
          <div key={item} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
            <span className="badge" style={{ flexShrink: 0 }}>
              다음
            </span>
            <p className="small" style={{ color: "var(--text-2)", margin: 0, lineHeight: 1.6 }}>
              {item}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuoteBlock({ quote }: { quote: FeedbackDocumentView["participants"][number]["revealingQuote"] }) {
  return (
    <blockquote
      className="surface-quiet"
      style={{
        margin: "28px 0 0",
        padding: "20px 22px",
        borderLeft: "3px solid var(--accent)",
      }}
    >
      <p className="editorial" style={{ fontSize: 18, lineHeight: 1.6, margin: 0 }}>
        {quote.quote}
      </p>
      <p className="tiny mono" style={{ color: "var(--text-3)", margin: "12px 0 0" }}>
        {quote.context}
      </p>
      <p className="small" style={{ color: "var(--text-2)", margin: "10px 0 0", lineHeight: 1.6 }}>
        {quote.note}
      </p>
    </blockquote>
  );
}

function FeedbackDocumentStyles() {
  return (
    <style>{`
      .rm-feedback-problem-fields {
        display: grid;
        grid-template-columns: minmax(34px, max-content) minmax(0, 1fr);
        gap: 10px 22px;
      }

      .rm-feedback-problem-fields dt,
      .rm-feedback-problem-fields dd {
        align-self: center;
      }

      .rm-feedback-document-meta {
        border-top: 3px solid var(--text);
      }

      .rm-feedback-document-heading {
        flex: 1 1 100%;
        min-width: 0;
      }

      .rm-feedback-document-kicker {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .rm-feedback-document-page .rm-feedback-document-return-action {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        color: var(--text-2);
        font-family: var(--f-sans);
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 0;
        line-height: 1.35;
        text-decoration: none;
        text-transform: none;
        transition:
          color var(--motion-fast) var(--ease-standard-refined),
          background var(--motion-fast) var(--ease-standard-refined);
      }

      .rm-feedback-document-page .rm-feedback-document-return-action:hover {
        color: var(--text);
      }

      .rm-feedback-document-kicker__divider {
        color: var(--text-3);
      }

      .rm-feedback-document-meta-row {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        flex-wrap: nowrap;
        justify-content: space-between;
        max-width: 100%;
        width: 100%;
      }

      .rm-feedback-document-meta-copy {
        flex: 1 1 auto;
        min-width: 0;
      }

      .rm-feedback-document-page .rm-feedback-document-pdf-action {
        flex: 0 0 auto;
        margin-left: auto;
        white-space: nowrap;
        word-break: keep-all;
        overflow-wrap: normal;
      }

      .rm-feedback-document-header-actions {
        margin-left: auto;
        justify-content: flex-end;
      }

      .rm-feedback-observer-notes,
      .rm-feedback-participant-document {
        border-radius: var(--r-2);
      }

      .rm-feedback-participant-document {
        position: relative;
      }

      .rm-feedback-participant-document::before {
        content: "";
        position: absolute;
        top: 18px;
        bottom: 18px;
        left: 0;
        width: 3px;
        background: var(--line-strong);
      }

      .rm-feedback-locked-document {
        padding: 26px 0;
        border-top: 3px solid var(--text);
        border-bottom: 1px solid var(--line);
      }

      @media (max-width: 560px) {
        .rm-feedback-problem-fields {
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 8px 14px;
        }

        .rm-feedback-problem-fields dt,
        .rm-feedback-problem-fields dd {
          align-self: start;
        }
      }

      @media (max-width: 768px) {
        .rm-feedback-document-meta-row {
          gap: 10px;
        }

        .rm-feedback-document-page .rm-feedback-document-return-action {
          display: none;
        }

        .rm-feedback-document-page .rm-feedback-document-pdf-action {
          min-height: 38px;
          height: 38px;
          padding-right: 12px;
          padding-left: 12px;
        }
      }

      @page {
        size: A4;
        margin: 14mm;
      }

      @media print {
        html,
        body {
          background: var(--bg) !important;
          color: var(--text) !important;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .topnav,
        .public-footer,
        .m-hdr,
        .m-tabbar,
        .rm-feedback-document-pdf-action,
        .rm-feedback-document-actions {
          display: none !important;
        }

        .app-shell,
        .app-content {
          min-height: auto !important;
          background: var(--bg) !important;
        }

        .app-content {
          padding-bottom: 0 !important;
        }

        .rm-feedback-document-page {
          background: var(--bg) !important;
          color: var(--text) !important;
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .rm-feedback-document-page .page-header-compact {
          padding: 28px 0 20px !important;
        }

        .rm-feedback-document-page .container {
          max-width: 920px !important;
          margin-left: auto !important;
          margin-right: auto !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        .rm-feedback-document-page > section:last-child {
          padding: 32px 0 56px !important;
        }

        .rm-feedback-document-page .surface,
        .rm-feedback-document-page .surface-quiet,
        .rm-feedback-document-page .badge {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }

        .rm-feedback-document-page .surface,
        .rm-feedback-document-page .surface-quiet {
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }

        .rm-feedback-document-page section,
        .rm-feedback-document-page article,
        .rm-feedback-document-page blockquote {
          break-inside: avoid;
        }
      }
    `}</style>
  );
}
