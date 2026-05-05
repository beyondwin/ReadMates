import { type CSSProperties, type ReactNode, useState } from "react";
import type { FeedbackDocumentListItem } from "@/features/archive/model/archive-model";
import { feedbackReportActionLabel } from "@/features/archive/model/archive-model";
import { Link } from "@/features/archive/ui/archive-link";
import { appFeedbackHref, readmatesReturnState } from "@/features/archive/ui/archive-route-continuity";
import { feedbackDocumentPdfDownloadsEnabled } from "@/shared/config/readmates-feature-flags";
import type { PagedResponse } from "@/shared/model/paging";
import { formatDateOnlyLabel } from "@/shared/ui/readmates-display";

function feedbackReportTotalLabel(total: number) {
  return `전체 ${total}개`;
}

export function FeedbackReports({
  reports,
  onLoadMoreReports,
}: {
  reports: PagedResponse<FeedbackDocumentListItem>;
  onLoadMoreReports?: () => Promise<void>;
}) {
  const myPageReturnState = readmatesReturnState({ href: "/app/me", label: "내 공간으로 돌아가기" });
  const reportItems = reports.items;

  return (
    <section>
      <SectionHeader
        eyebrow="기록"
        title="피드백 문서"
        eyebrowHelper={
          <span className="tiny" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
            · {feedbackReportTotalLabel(reportItems.length)}
          </span>
        }
        right={
          <Link className="btn btn-quiet btn-sm" to="/app/archive?view=report">
            전체 보기
          </Link>
        }
      />
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {reportItems.length === 0 ? (
          <div className="surface-quiet" style={{ padding: "22px" }}>
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              아직 열람 가능한 피드백 문서가 없습니다.
            </p>
          </div>
        ) : null}
        {reportItems.map((report, index) => (
          <article
            key={report.sessionId}
            style={{
              display: "grid",
              gridTemplateColumns: feedbackDocumentPdfDownloadsEnabled
                ? "28px minmax(0, 1fr) auto auto"
                : "28px minmax(0, 1fr) auto",
              gap: "14px",
              padding: "16px 0",
              borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
              alignItems: "center",
            }}
          >
            <span aria-hidden style={{ color: "var(--text-2)", fontSize: "18px" }}>
              <Icon name="notes" size={18} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h3 className="body" style={{ fontSize: "14px", margin: 0 }}>
                {report.bookTitle}
              </h3>
              <div className="tiny">{formatDateOnlyLabel(report.date)} · 피드백 문서</div>
            </div>
            <Link
              className="btn btn-quiet btn-sm"
              to={appFeedbackHref(report.sessionId)}
              state={myPageReturnState}
              aria-label={feedbackReportActionLabel(report, "읽기")}
              title={feedbackReportActionLabel(report, "읽기")}
            >
              <Icon name="chevron-right" size={12} />
            </Link>
            {feedbackDocumentPdfDownloadsEnabled ? (
              <Link
                className="btn btn-quiet btn-sm"
                to={appFeedbackHref(report.sessionId, true)}
                state={myPageReturnState}
                aria-label={feedbackReportActionLabel(report, "PDF로 저장")}
                title={feedbackReportActionLabel(report, "PDF로 저장")}
              >
                <Icon name="download" size={13} />
              </Link>
            ) : null}
          </article>
        ))}
        <LoadMoreButton visible={Boolean(reports.nextCursor)} onLoadMore={onLoadMoreReports} />
      </div>
    </section>
  );
}

export function MobileFeedbackReports({
  reports,
  onLoadMoreReports,
}: {
  reports: PagedResponse<FeedbackDocumentListItem>;
  onLoadMoreReports?: () => Promise<void>;
}) {
  const myPageReturnState = readmatesReturnState({ href: "/app/me", label: "내 공간으로 돌아가기" });
  const reportItems = reports.items;

  return (
    <section className="m-sec">
      <div className="m-row-between" style={{ marginBottom: 10, alignItems: "center" }}>
        <div className="m-row" style={{ gap: 8, minWidth: 0 }}>
          <div className="eyebrow">피드백 문서</div>
          <div className="tiny" style={{ color: "var(--text-3)", whiteSpace: "nowrap" }}>
            · {feedbackReportTotalLabel(reportItems.length)}
          </div>
        </div>
        <Link className="btn btn-quiet btn-sm" to="/app/archive?view=report">
          전체 보기
        </Link>
      </div>
      {reportItems.length === 0 ? (
        <div className="m-card-quiet">
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            아직 열람 가능한 피드백 문서가 없습니다.
          </p>
        </div>
      ) : (
        <div className="m-list">
          {reportItems.map((report) => {
            const readHref = appFeedbackHref(report.sessionId);
            const readLabel = feedbackReportActionLabel(report, "읽기");
            const feedbackDocumentLinkStyle: CSSProperties = {
              display: "grid",
              gridTemplateColumns: "32px minmax(0, 1fr) auto",
              gap: 14,
              alignItems: "center",
              minWidth: 0,
              color: "inherit",
              textDecoration: "none",
            };
            const feedbackDocumentLinkContent = (
              <>
                <span aria-hidden style={{ color: "var(--text-2)", fontSize: 18 }}>
                  <Icon name="notes" size={18} />
                </span>
                <div style={{ minWidth: 0 }}>
                  <div className="body" style={{ fontSize: 14 }}>
                    {report.bookTitle}
                  </div>
                  <div className="tiny mono" style={{ color: "var(--text-3)" }}>
                    No.{String(report.sessionNumber).padStart(2, "0")} · {formatDateOnlyLabel(report.date)}
                  </div>
                </div>
                <span className="btn btn-quiet btn-sm" aria-hidden="true">
                  <Icon name="chevron-right" size={12} />
                </span>
              </>
            );

            if (!feedbackDocumentPdfDownloadsEnabled) {
              return (
                <Link
                  key={report.sessionId}
                  className="m-list-row"
                  to={readHref}
                  state={myPageReturnState}
                  aria-label={readLabel}
                  title={readLabel}
                  style={feedbackDocumentLinkStyle}
                >
                  {feedbackDocumentLinkContent}
                </Link>
              );
            }

            return (
              <div
                key={report.sessionId}
                className="m-list-row"
                style={{
                  gridTemplateColumns: feedbackDocumentPdfDownloadsEnabled ? "minmax(0, 1fr) auto" : "minmax(0, 1fr)",
                }}
              >
                <Link
                  to={readHref}
                  state={myPageReturnState}
                  aria-label={readLabel}
                  title={readLabel}
                  style={feedbackDocumentLinkStyle}
                >
                  {feedbackDocumentLinkContent}
                </Link>
                {feedbackDocumentPdfDownloadsEnabled ? (
                  <Link
                    className="btn btn-quiet btn-sm"
                    to={appFeedbackHref(report.sessionId, true)}
                    state={myPageReturnState}
                    aria-label={feedbackReportActionLabel(report, "PDF로 저장")}
                    title={feedbackReportActionLabel(report, "PDF로 저장")}
                  >
                    <Icon name="download" size={13} />
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <LoadMoreButton visible={Boolean(reports.nextCursor)} onLoadMore={onLoadMoreReports} variant="mobile" />
    </section>
  );
}

function LoadMoreButton({
  visible,
  onLoadMore,
  variant = "desktop",
}: {
  visible: boolean;
  onLoadMore?: () => Promise<void>;
  variant?: "desktop" | "mobile";
}) {
  const [pending, setPending] = useState(false);

  if (!visible || !onLoadMore) {
    return null;
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: variant === "mobile" ? 14 : 18 }}>
      <button
        type="button"
        className="btn btn-quiet"
        style={variant === "mobile" ? { width: "100%", minHeight: 42 } : undefined}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await onLoadMore();
          } finally {
            setPending(false);
          }
        }}
      >
        더 보기
      </button>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  eyebrowHelper,
  right,
}: {
  eyebrow: string;
  title: string;
  eyebrowHelper?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "18px", gap: "14px" }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: "8px" }}>
          {eyebrow}
          {eyebrowHelper}
        </div>
        <h2 className="h2 editorial" style={{ margin: 0 }}>
          {title}
        </h2>
      </div>
      {right}
    </div>
  );
}

function Icon({
  name,
  size = 16,
}: {
  name: "chevron-right" | "download" | "notes";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "chevron-right") {
    return (
      <svg {...common}>
        <path d="M8 5l5 5-5 5" />
      </svg>
    );
  }

  if (name === "download") {
    return (
      <svg {...common}>
        <path d="M10 3v9M6 9l4 4 4-4M4 17h12" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M5 3h7l3 3v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
      <path d="M12 3v3h3M7 10h6M7 13h4" />
    </svg>
  );
}
