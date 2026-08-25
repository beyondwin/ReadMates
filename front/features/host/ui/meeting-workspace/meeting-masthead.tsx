import type { RefObject } from "react";

export type MeetingIdentityModel = {
  title: string;
  bookTitle?: string | null;
  number?: number | null;
  lifecycle: "DRAFT" | "OPEN" | "CLOSED" | "PUBLISHED";
  statusLabel: string;
  dateLabel?: string | null;
  locationLabel?: string | null;
};

export function MeetingMasthead({
  identity,
  headingRef,
}: {
  identity: MeetingIdentityModel;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const details = [identity.bookTitle, identity.dateLabel, identity.locationLabel].filter(Boolean);
  return (
    <header className="rm-meeting-folio__masthead">
      <div className="rm-meeting-folio__identity">
        {identity.number ? <span className="rm-meeting-folio__number">No.{identity.number}</span> : null}
        <h1 ref={headingRef} tabIndex={-1} className="h1 editorial rm-meeting-folio__title">
          {identity.title || identity.bookTitle || "모임"}
        </h1>
      </div>
      <p className="rm-meeting-folio__status-line">
        <span className={`badge badge-${identity.lifecycle === "OPEN" ? "ok" : "neutral"}`}>
          {identity.statusLabel}
        </span>
      </p>
      {details.length > 0 ? (
        <p className="rm-meeting-folio__meta">{details.join(" · ")}</p>
      ) : null}
    </header>
  );
}
