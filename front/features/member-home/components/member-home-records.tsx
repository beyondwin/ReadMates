import { Link } from "@/src/app/router-link";
import { type CSSProperties, type ReactNode } from "react";
import type {
  MemberHomeCurrentSessionResponse as CurrentSessionResponse,
  MemberHomeNoteFeedItem as NoteFeedItem,
} from "@/features/member-home/api/member-home-contracts";
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

export function ClubPulse({ items }: { items: NoteFeedItem[] }) {
  return (
    <section>
      <SectionHeader
        eyebrow="클럽 흐름"
        title="최근 클럽 흐름"
        action={
          <Link to="/app/notes" className="btn btn-quiet btn-sm">
            클럽 노트 →
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
              <div className="row" style={{ gap: "10px", marginBottom: "10px", color: "var(--text-3)" }}>
                {authorName ? (
                  <>
                    <AvatarChip name={authorName} fallbackInitial={item.authorShortName} label={authorName} size={22} />
                    <span className="small" style={{ color: "var(--text-2)" }}>
                      {authorName}
                    </span>
                    <span className="small">·</span>
                  </>
                ) : null}
                <span className="tiny mono">
                  {noteKindLabel(item.kind)} · No.{String(item.sessionNumber).padStart(2, "0")}
                </span>
              </div>
              <div className="body editorial" style={{ fontSize: "17px", lineHeight: 1.55 }}>
                {item.text}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function MobileMemberActivity({ items }: { items: NoteFeedItem[] }) {
  return (
    <section className="m-sec">
      <div className="m-row-between rm-member-activity__header" style={{ alignItems: "center" }}>
        <div className="m-row" style={{ gap: 8, minWidth: 0 }}>
          <div className="eyebrow">멤버 활동</div>
        </div>
        <Link to="/app/notes" className="btn btn-quiet btn-sm">
          클럽 노트 →
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
                    {authorName ? (
                      <AvatarChip name={authorName} fallbackInitial={item.authorShortName} label={authorName} size={26} />
                    ) : (
                      <span className="m-avatar accent rm-member-activity-card__avatar" aria-hidden>
                        H
                      </span>
                    )}
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
                <p className="rm-member-activity-card__text editorial">{item.text}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function RosterSummary({ current }: { current: CurrentSessionResponse }) {
  const session = current.currentSession;

  if (!session) {
    return (
      <section>
        <div className="surface-quiet" style={{ padding: "20px" }}>
          <div className="body editorial" style={{ fontSize: "18px" }}>
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
          <div className="body editorial" style={{ fontSize: "18px" }}>
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
          <div className="body editorial" style={{ fontSize: "18px" }}>
            참석 {goingMembers.length}명
          </div>
          <div className="small mono">미응답 {noResponseCount}</div>
        </div>
        <div className="row" style={{ gap: "6px", marginTop: "14px", flexWrap: "wrap" }}>
          {attendees.map((member) => (
            <AvatarChip
              key={member.membershipId}
              name={member.displayName}
              fallbackInitial={member.displayName}
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
