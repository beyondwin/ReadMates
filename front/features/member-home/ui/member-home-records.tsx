import { type CSSProperties, type ReactNode } from "react";
import { Link, PlainMemberHomeLink, type MemberHomeLinkComponent } from "@/features/member-home/ui/member-home-link";
import type {
  MemberHomeRecentRecordEntry,
} from "@/features/member-home/model/member-home-view-model";
import type { CurrentSessionReadPageData } from "@/shared/model/current-session-read-view";
import type { NoteFeedItem } from "@/shared/model/notes-feed-model";
import { AvatarChip } from "@/shared/ui/avatar-chip";
import { rsvpLabel } from "@/shared/ui/readmates-display";

function noteKindLabel(kind: string) {
  if (kind === "QUESTION") {
    return "질문";
  }

  if (kind === "ONE_LINE_REVIEW") {
    return "한줄평";
  }

  if (kind === "HIGHLIGHT") {
    return "하이라이트";
  }

  return kind;
}

function SectionHeader({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action: ReactNode;
}) {
  return (
    <div className="row-between" style={{ alignItems: "flex-end", marginBottom: "18px" }}>
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2 className="h3 editorial" style={{ margin: "6px 0 0" }}>
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function RecentRecordDestination({
  label,
  description,
  to,
  LinkComponent,
}: {
  label: string;
  description: string;
  to?: string;
  LinkComponent: MemberHomeLinkComponent;
}) {
  const content = (
    <>
      <span className="rm-recent-record__destination-copy">
        <strong>{label}</strong>
        <span>{description}</span>
      </span>
      {to ? (
        <span className="rm-recent-record__destination-chevron" aria-hidden="true">
          ›
        </span>
      ) : null}
    </>
  );

  if (!to) {
    return (
      <div className="rm-recent-record__destination rm-recent-record__destination--static">
        {content}
      </div>
    );
  }

  return (
    <Link to={to} className="rm-recent-record__destination" LinkComponent={LinkComponent}>
      {content}
    </Link>
  );
}

function RecentRecordDocuments({
  entry,
  LinkComponent,
}: {
  entry: MemberHomeRecentRecordEntry;
  LinkComponent: MemberHomeLinkComponent;
}) {
  const canOpenFeedback = entry.feedbackState === "AVAILABLE" || entry.feedbackState === "UNKNOWN";

  return (
    <nav className="rm-recent-record__documents" aria-label="지난 모임 문서">
      <RecentRecordDestination
        label="모임 기록 보기"
        description="질문과 회고를 이어 읽기"
        to={entry.href}
        LinkComponent={LinkComponent}
      />
      <RecentRecordDestination
        label="피드백 문서 보기"
        description={entry.feedbackStatusLabel}
        to={canOpenFeedback ? entry.feedbackHref : undefined}
        LinkComponent={LinkComponent}
      />
    </nav>
  );
}

function RecentRecordCopy({ entry }: { entry: MemberHomeRecentRecordEntry }) {
  return (
    <div className="rm-recent-record__copy">
      <div className="eyebrow">지난 모임 회고</div>
      <h2 className="h3 editorial rm-recent-record__title">
        No.{String(entry.sessionNumber).padStart(2, "0")} · {entry.bookTitle}
      </h2>
      <p className="body rm-recent-record__summary">{entry.summary}</p>
      {entry.kindLabels.length > 0 ? (
        <div className="tiny rm-recent-record__kinds">보존된 내용 · {entry.kindLabels.join(" · ")}</div>
      ) : null}
    </div>
  );
}

export function ClubPulse({
  items,
  LinkComponent = PlainMemberHomeLink,
}: {
  items: NoteFeedItem[];
  LinkComponent?: MemberHomeLinkComponent;
}) {
  return (
    <section>
      <SectionHeader
        eyebrow="클럽 흐름"
        title="최근 클럽 흐름"
        action={
          <Link to="/app/notes" className="btn btn-quiet btn-sm" LinkComponent={LinkComponent}>
            전체 보기
          </Link>
        }
      />
      <div className="stack" style={{ "--stack": "0px" } as CSSProperties}>
        {items.length === 0 ? (
          <div className="surface-quiet" style={{ padding: "20px" }}>
            <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
              아직 표시할 클럽 기록이 없습니다.
            </p>
          </div>
        ) : null}
        {items.map((item, index) => {
          const authorName = item.kind === "HIGHLIGHT" ? null : item.authorName;

          return (
            <article
              key={`${item.sessionNumber}-${item.kind}-${item.authorName ?? "no-author"}-${item.text}`}
              style={{
                padding: "22px 0",
                borderTop: index === 0 ? "1px solid var(--line)" : "1px solid var(--line-soft)",
              }}
            >
              <div className="rm-club-pulse-entry__header">
                <div className="rm-club-pulse-entry__author">
                  {authorName ? (
                    <>
                      <AvatarChip avatarKey={item.avatarKey} name={authorName} label="" size={22} />
                      <span className="small rm-club-pulse-entry__author-name">{authorName}</span>
                    </>
                  ) : null}
                </div>
                <span className="tiny mono rm-club-pulse-entry__meta">
                  No.{String(item.sessionNumber).padStart(2, "0")} · {noteKindLabel(item.kind)}
                </span>
              </div>
              <div className="body-lg editorial" style={{ lineHeight: 1.65 }}>
                {item.text}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function RecentRecordEntry({
  entry,
  LinkComponent = PlainMemberHomeLink,
}: {
  entry: MemberHomeRecentRecordEntry | null;
  LinkComponent?: MemberHomeLinkComponent;
}) {
  if (!entry) {
    return null;
  }

  return (
    <section
      className="surface-quiet rm-recent-record rm-recent-record--desktop"
      aria-label="지난 모임 회고"
    >
      <div className="rm-recent-record__layout">
        <RecentRecordCopy entry={entry} />
        <RecentRecordDocuments entry={entry} LinkComponent={LinkComponent} />
      </div>
    </section>
  );
}

export function MobileRecentRecordEntry({
  entry,
  LinkComponent = PlainMemberHomeLink,
}: {
  entry: MemberHomeRecentRecordEntry | null;
  LinkComponent?: MemberHomeLinkComponent;
}) {
  if (!entry) {
    return null;
  }

  return (
    <section className="m-sec" aria-label="지난 모임 회고">
      <div className="m-card-quiet rm-recent-record rm-recent-record--mobile">
        <RecentRecordCopy entry={entry} />
        <RecentRecordDocuments entry={entry} LinkComponent={LinkComponent} />
      </div>
    </section>
  );
}

export function MobileMemberActivity({
  items,
  LinkComponent = PlainMemberHomeLink,
}: {
  items: NoteFeedItem[];
  LinkComponent?: MemberHomeLinkComponent;
}) {
  return (
    <section className="m-sec">
      <div className="m-row-between rm-member-activity__header" style={{ alignItems: "center" }}>
        <div className="m-row" style={{ gap: 8, minWidth: 0 }}>
          <div className="eyebrow">멤버 활동</div>
        </div>
        <Link to="/app/notes" className="btn btn-quiet btn-sm" LinkComponent={LinkComponent}>
          전체 보기
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="m-card-quiet">
          <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
            아직 표시할 클럽 기록이 없습니다.
          </p>
        </div>
      ) : (
        <div className="rm-member-activity-list">
          {items.map((item) => {
            const authorName = item.kind === "HIGHLIGHT" ? null : item.authorName;
            const kindLabel = noteKindLabel(item.kind);

            return (
              <article
                key={`${item.sessionNumber}-${item.kind}-${item.authorName ?? "no-author"}-${item.text}`}
                className="rm-member-activity-card"
              >
                <div className="rm-member-activity-card__top">
                  <div className="rm-member-activity-card__author">
                    <AvatarChip avatarKey={item.avatarKey} name={authorName} label="" size={26} />
                    <div className="rm-member-activity-card__author-copy">
                      <div className="rm-member-activity-card__author-name">{authorName ?? "회차 하이라이트"}</div>
                      <div className="rm-member-activity-card__book">{item.bookTitle}</div>
                    </div>
                  </div>
                  <div className="rm-member-activity-card__meta">
                    <div className="mono tiny">No.{String(item.sessionNumber).padStart(2, "0")}</div>
                    <div className="tiny">
                      {kindLabel}
                    </div>
                  </div>
                </div>
                <p className="rm-member-activity-card__text body editorial">{item.text}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function RosterSummary({ current }: { current: CurrentSessionReadPageData }) {
  const session = current.currentSession;

  if (!session) {
    return (
      <section>
        <div className="surface-quiet" style={{ padding: "20px" }}>
          <div className="body-lg editorial">
            참석 현황 준비 중
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
            새 세션이 등록되면 RSVP와 참석 명단이 표시됩니다.
          </p>
        </div>
      </section>
    );
  }

  const attendees = session.attendees;

  if (attendees.length === 0) {
    return (
      <section>
        <div className="surface-quiet" style={{ padding: "20px" }}>
          <div className="body-lg editorial">
            참석 현황 준비 중
          </div>
          <p className="small" style={{ color: "var(--text-2)", margin: "8px 0 0" }}>
            참석 명단이 준비되면 RSVP 현황이 표시됩니다.
          </p>
        </div>
      </section>
    );
  }

  const goingMembers = attendees.filter((member) => member.rsvpStatus === "GOING");
  const noResponseCount = attendees.filter((member) => member.rsvpStatus === "NO_RESPONSE").length;

  return (
    <section>
      <div className="eyebrow" style={{ marginBottom: "10px" }}>
        RSVP · 참석 명단
      </div>
      <div className="surface" style={{ padding: "20px" }}>
        <div className="row-between">
          <div className="body-lg editorial">
            참석 {goingMembers.length}명
          </div>
          <div className="small">
            미응답 <span className="ledger-number">{noResponseCount}</span>
          </div>
        </div>
        <div className="row" style={{ gap: "6px", marginTop: "14px", flexWrap: "wrap" }}>
          {attendees.map((member) => (
            <AvatarChip
              key={member.renderKey}
              avatarKey={member.avatarKey}
              name={member.displayName}
              label={`${member.displayName} · ${rsvpLabel(member.rsvpStatus)}`}
              rsvpStatus={member.rsvpStatus}
              size={26}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
