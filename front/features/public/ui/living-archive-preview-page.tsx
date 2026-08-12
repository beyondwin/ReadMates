import type { LivingArchivePreviewModel } from "@/features/public/model/living-archive-preview-model";
import { formatDateLabel, getPublicSessionListItemDisplay } from "@/features/public/model/public-display-model";
import { publicRecordsHref, publicSessionHref } from "@/features/public/model/public-paths";
import { Link } from "@/features/public/ui/public-link";
import type { PublicSessionListItem } from "@/features/public/api/public-contracts";
import { bookClubAvatarSrc } from "@/shared/ui/book-club-avatar";

type LivingArchivePreviewPageProps = {
  model: LivingArchivePreviewModel;
  publicBasePath: string;
};

function folioNumber(value: number) {
  return String(value).padStart(2, "0");
}

function splitArchiveDate(value: string) {
  const [year = value, month = ""] = formatDateLabel(value).split(".");

  return { year, month };
}

function HistoricalSpine({
  index,
  publicBasePath,
  session,
}: {
  index: number;
  publicBasePath: string;
  session: PublicSessionListItem;
}) {
  const display = getPublicSessionListItemDisplay(session);
  const date = splitArchiveDate(session.date);

  return (
    <li className={`lap-spine lap-spine--${index % 5}`} data-testid="archive-spine">
      <Link
        className="lap-spine__link"
        to={publicSessionHref(session, publicBasePath)}
        aria-label={`공개 기록 ${session.sessionNumber}: ${display.title}`}
      >
        <span className="lap-spine__folio">{folioNumber(session.sessionNumber)}</span>
        <span className="lap-spine__date">
          <span>{date.year}</span>
          <span>{date.month}</span>
        </span>
        <span className="lap-spine__title">{display.title}</span>
        <span className="lap-spine__press-mark" aria-hidden="true" />
      </Link>
    </li>
  );
}

function ReaderTraces({ model }: { model: LivingArchivePreviewModel }) {
  if (!model.latestDetail) {
    return null;
  }

  return (
    <div className="lap-reader-traces" aria-label="최근 공개 기록에 남은 독자 문장">
      {model.readerTraces.map((trace) => (
        <article
          className={`lap-reader-trace lap-reader-trace--${trace.index + 1}`}
          data-testid="reader-trace"
          key={trace.id}
        >
          <span className="lap-reader-trace__portrait" aria-hidden="true">
            <img src={bookClubAvatarSrc(trace.avatarKey)} alt="" />
          </span>
          <span className="lap-reader-trace__copy">
            <strong>{trace.authorName}</strong>
            <span>{trace.text}</span>
          </span>
          <span className="lap-reader-trace__line" aria-hidden="true" />
        </article>
      ))}
    </div>
  );
}

function FeaturedVolume({
  model,
  publicBasePath,
}: {
  model: LivingArchivePreviewModel;
  publicBasePath: string;
}) {
  const session = model.latest;

  if (!session) {
    return null;
  }

  const display = getPublicSessionListItemDisplay(session);
  const date = splitArchiveDate(session.date);
  const excerpt = model.latestDetail && model.readerTraces[0]
    ? model.readerTraces[0].text
    : display.summary;

  return (
    <li className="lap-featured-volume" data-testid="archive-spine">
      <Link
        className="lap-featured-volume__link"
        to={publicSessionHref(session, publicBasePath)}
        aria-label={`최근 대화 펼치기: ${display.title}`}
      >
        <span className="lap-featured-volume__cover">
          <span className="lap-featured-volume__number">{folioNumber(session.sessionNumber)}</span>
          <span className="lap-featured-volume__date">
            {date.year}<br />{date.month}
          </span>
          <span className="lap-featured-volume__title">{display.title}</span>
          <span className="lap-featured-volume__press-mark" aria-hidden="true" />
        </span>
        <span className="lap-featured-volume__page">
          <span className="lap-featured-volume__quote-mark" aria-hidden="true">“</span>
          <span className="lap-featured-volume__excerpt">{excerpt}</span>
          <span className="lap-featured-volume__author">{display.author}</span>
          {model.readerTraces.length > 0 ? (
            <span className="lap-featured-volume__participants" aria-hidden="true">
              {model.readerTraces.map((trace) => (
                <span key={trace.id}>
                  <img src={bookClubAvatarSrc(trace.avatarKey)} alt="" />
                </span>
              ))}
            </span>
          ) : null}
          <span className="lap-featured-volume__promise">기록은 대화에서 시작되고, 문장은 책장을 넘어 이어집니다.</span>
        </span>
      </Link>
    </li>
  );
}

function NextSlot() {
  return (
    <div className="lap-next-slot" role="img" aria-label="다음 자리">
      <span>다음 자리</span>
      <span className="lap-next-slot__mark" aria-hidden="true" />
    </div>
  );
}

function EditorialStrip({
  model,
  publicBasePath,
}: {
  model: LivingArchivePreviewModel;
  publicBasePath: string;
}) {
  const latest = model.latest;
  const latestDisplay = latest ? getPublicSessionListItemDisplay(latest) : null;

  return (
    <section className="lap-editorial-strip" aria-label="공개 기록 안내">
      <div className="lap-editorial-strip__archive">
        <div className="lap-archive-index">
          <p>기록 아카이브</p>
          <strong>{model.sessions.length > 0 ? `${model.sessions.length}권의 공개 기록` : "비어 있는 첫 서가"}</strong>
          <Link to={publicRecordsHref(publicBasePath)}>공개 기록 보기</Link>
        </div>

        {latest && latestDisplay ? (
          <article className="lap-latest-meeting">
            <div className="lap-latest-meeting__folio" aria-hidden="true">
              <span>{folioNumber(latest.sessionNumber)}</span>
              <span>{splitArchiveDate(latest.date).year}</span>
            </div>
            <div className="lap-latest-meeting__body">
              <h2>최근 대화 펼치기</h2>
              <strong>{latestDisplay.title}</strong>
              <p>{latestDisplay.summary}</p>
              <Link to={publicSessionHref(latest, publicBasePath)}>기록 펼치기</Link>
            </div>
          </article>
        ) : (
          <div className="lap-empty-record" role="status">
            <h2>첫 기록을 준비하고 있습니다</h2>
            <p>공개 가능한 대화가 정리되면 이 서가의 첫 자리에 차분히 놓입니다.</p>
          </div>
        )}
      </div>

      <aside className="lap-invitation-boundary">
        <span className="lap-invitation-boundary__label">다음 자리</span>
        <h2>기록은 누구나 읽고, 참여는 초대받은 멤버와 이어갑니다</h2>
        <span className="lap-invitation-boundary__line" aria-hidden="true" />
        <span className="lap-invitation-boundary__mark" aria-hidden="true" />
      </aside>
    </section>
  );
}

export function LivingArchivePreviewPage({ model, publicBasePath }: LivingArchivePreviewPageProps) {
  const historicalSessions = model.latest
    ? model.sessions.filter((session) => session.sessionId !== model.latest?.sessionId)
    : [];

  return (
    <main
      className="living-archive-preview"
      aria-labelledby="living-archive-preview-title"
      data-public-base-path={publicBasePath}
      data-club-name={model.clubName}
    >
      <header className="living-archive-preview__header">
        <div className="living-archive-preview__identity">
          <span className="living-archive-preview__wordmark">ReadMates</span>
          <span className="living-archive-preview__club-name">{model.clubName}</span>
        </div>
        <div className="living-archive-preview__navigation">
          <Link to={publicRecordsHref(publicBasePath)}>공개 기록 보기</Link>
          <span className="living-archive-preview__menu" role="img" aria-label="메뉴">
            <span aria-hidden="true" />
            <span aria-hidden="true" />
          </span>
        </div>
      </header>

      <section className="living-archive-preview__statement">
        <h1 id="living-archive-preview-title">책 사이에<br />사람이 남습니다</h1>
        <p>서로 다른 문장이 한 권의 기억이 됩니다</p>
      </section>

      <section className="lap-shelf" aria-label="공개 기록 서가">
        <ReaderTraces model={model} />
        <ol className="lap-shelf__history" aria-label="지난 공개 기록">
          {historicalSessions.map((session, index) => (
            <HistoricalSpine
              index={index}
              key={session.sessionId}
              publicBasePath={publicBasePath}
              session={session}
            />
          ))}
        </ol>
        <ol className="lap-shelf__featured" aria-label="최근 공개 기록">
          <FeaturedVolume model={model} publicBasePath={publicBasePath} />
        </ol>
        <NextSlot />
        <div className="lap-shelf__ledge" aria-hidden="true" />
      </section>

      <EditorialStrip model={model} publicBasePath={publicBasePath} />
    </main>
  );
}
