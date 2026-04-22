"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import type { FeedbackDocumentResponse } from "@/shared/api/readmates";

type FeedbackDocumentPageProps = {
  document: FeedbackDocumentResponse;
  printMode?: boolean;
};

type FeedbackDocumentUnavailablePageProps = {
  reason: "forbidden" | "missing";
  printMode?: boolean;
};

export default function FeedbackDocumentPage({ document, printMode = false }: FeedbackDocumentPageProps) {
  return (
    <main className={`rm-feedback-document-page${printMode ? " rm-feedback-document-page--print" : ""}`}>
      {printMode ? <PrintOnFirstRender /> : null}
      <FeedbackDocumentStyles />
      <section className="page-header-compact">
        <div className="container">
          <div className="row-between" style={{ alignItems: "flex-end", gap: 18, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                피드백 문서
              </p>
              <h1 className="h1 editorial" style={{ margin: "6px 0 6px" }}>
                {document.title}
              </h1>
              <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
                {document.subtitle}
              </p>
            </div>
            <div className="row rm-feedback-document-actions" style={{ gap: 8, flexWrap: "wrap" }}>
              {printMode ? (
                <>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => globalThis.print()}>
                    인쇄
                  </button>
                  <a className="btn btn-quiet btn-sm" href={`/app/feedback/${document.sessionId}`}>
                    문서로 돌아가기
                  </a>
                </>
              ) : (
                <a className="btn btn-ghost btn-sm" href={`/app/feedback/${document.sessionId}/print`}>
                  PDF로 저장
                </a>
              )}
            </div>
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

function PrintOnFirstRender() {
  const hasPrinted = useRef(false);

  useEffect(() => {
    if (hasPrinted.current || typeof globalThis.print !== "function") {
      return;
    }

    hasPrinted.current = true;
    globalThis.print();
  }, []);

  return null;
}

export function FeedbackDocumentUnavailablePage({
  reason,
  printMode = false,
}: FeedbackDocumentUnavailablePageProps) {
  const copy =
    reason === "forbidden"
      ? {
          eyebrow: "열람 제한",
          title: "피드백 문서는 정식 멤버와 참석자에게만 열립니다.",
          body: "둘러보기 멤버는 전체 세션 기록을 읽을 수 있지만, 회차 피드백 문서는 볼 수 없습니다.",
        }
      : {
          eyebrow: "피드백 문서",
          title: "아직 열람 가능한 피드백 문서가 없습니다.",
          body: "호스트가 피드백 문서를 등록하면 이 화면에서 확인할 수 있습니다.",
        };

  return (
    <main className={`rm-feedback-document-page${printMode ? " rm-feedback-document-page--print" : ""}`}>
      <FeedbackDocumentStyles />
      <section className="page-header-compact">
        <div className="container">
          <div className="stack" style={{ "--stack": "14px", maxWidth: 720 } as CSSProperties}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {copy.eyebrow}
            </p>
            <h1 className="h1 editorial" style={{ margin: 0 }}>
              {copy.title}
            </h1>
            <p className="body" style={{ color: "var(--text-2)", margin: 0, maxWidth: 560 }}>
              {copy.body}
            </p>
            <div className="row rm-feedback-document-actions" style={{ gap: 8, flexWrap: "wrap" }}>
              <a className="btn btn-ghost btn-sm" href="/app/archive">
                아카이브로 돌아가기
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function DocumentMeta({ document }: { document: FeedbackDocumentResponse }) {
  if (document.metadata.length === 0) {
    return null;
  }

  return (
    <section className="surface" style={{ padding: 24 }}>
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
    <section className="surface-quiet" style={{ padding: 26 }}>
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

function ParticipantSections({ participants }: { participants: FeedbackDocumentResponse["participants"] }) {
  return (
    <div className="stack" style={{ "--stack": "32px" } as CSSProperties}>
      {participants.map((participant) => (
        <section
          key={`${participant.number}-${participant.name}`}
          className="surface"
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

function ProblemBlocks({ problems }: { problems: FeedbackDocumentResponse["participants"][number]["problems"] }) {
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

function QuoteBlock({ quote }: { quote: FeedbackDocumentResponse["participants"][number]["revealingQuote"] }) {
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
        grid-template-columns: max-content minmax(0, 1fr);
        gap: 10px 22px;
      }

      @media (max-width: 560px) {
        .rm-feedback-problem-fields {
          grid-template-columns: minmax(0, 1fr);
          gap: 4px;
        }

        .rm-feedback-problem-fields dt:not(:first-child) {
          margin-top: 8px;
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
        .m-hdr,
        .m-tabbar,
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
