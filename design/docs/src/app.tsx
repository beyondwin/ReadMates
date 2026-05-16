import {
  AvatarChip,
  Badge,
  BookCover,
  Button,
  Divider,
  DocumentPanel,
  EmptyState,
  LockedState,
} from "@readmates/design-system";
import { componentDocs } from "./docs-data";
import { memberSample, overviewCopy, patternDocs, type PatternDoc } from "./gallery-data";

function StatusBadge({ status }: { status: "stable" | "experimental" | "legacy" | "deprecated" }) {
  const tone =
    status === "stable" ? "success" : status === "legacy" ? "warning" : status === "deprecated" ? "locked" : "accent";

  return <Badge tone={tone}>{status}</Badge>;
}

function SectionNav() {
  return (
    <aside className="rm-docs__sidebar" aria-label="Design system sections">
      <strong>ReadMates DS</strong>
      <a href="#overview">Overview</a>
      <a href="#public">Public</a>
      <a href="#member">Member</a>
      <a href="#components">Components</a>
      <a href="#migration">Migration</a>
    </aside>
  );
}

function PatternPreview({ pattern }: { pattern: PatternDoc }) {
  const isPublic = pattern.key === "public";

  return (
    <section
      className={`rm-docs__pattern rm-docs__pattern--${pattern.key}`}
      id={pattern.key}
      aria-label={pattern.title}
    >
      <div className="rm-docs__pattern-copy">
        <p className="eyebrow">{pattern.eyebrow}</p>
        <h2 className="h2">{pattern.title}</h2>
        <p className="body">{pattern.description}</p>
        <div className="rm-docs__chips" aria-label={`${pattern.title} states`}>
          {pattern.states.map((state) => (
            <Badge key={state} tone={isPublic ? "accent" : "success"} dot>
              {state}
            </Badge>
          ))}
        </div>
      </div>

      <div className="rm-docs__pattern-canvas">
        <BookCover title={pattern.book.title} author={pattern.book.author} size={isPublic ? "lg" : "md"} />
        <DocumentPanel
          eyebrow={isPublic ? "Invitation" : "Reading Desk"}
          title={isPublic ? "읽기를 함께 여는 공개 장면" : "나의 이번 읽기"}
          meta={isPublic ? "Public-safe sample" : "Member sample"}
          divided
        >
          <p>
            {isPublic
              ? "공개 페이지는 분위기를 먼저 전달하고 행동은 절제합니다."
              : "멤버 책상은 책, 상태, 다음 행동을 한 흐름으로 보여줍니다."}
          </p>
          {isPublic ? (
            <LockedState
              title="멤버 전용 콘텐츠"
              description="읽기 노트와 세션 기록은 멤버에게만 공개됩니다."
              reason="memberOnly"
              compact
            />
          ) : (
            <div className="rm-docs__member-row">
              <AvatarChip name={memberSample.name} meta={memberSample.meta} />
              <Button variant="primary">다음 세션 보기</Button>
            </div>
          )}
        </DocumentPanel>
      </div>

      <div className="rm-docs__pattern-components">
        {pattern.components.map((component) => (
          <code key={component}>{component}</code>
        ))}
      </div>
    </section>
  );
}

export function App() {
  const publicPattern = patternDocs.find((pattern) => pattern.key === "public");
  const memberPattern = patternDocs.find((pattern) => pattern.key === "member");

  if (!publicPattern || !memberPattern) {
    throw new Error("Design gallery requires public and member pattern docs.");
  }

  return (
    <main className="rm-docs">
      <SectionNav />

      <section className="rm-docs__content">
        <header className="rm-docs__overview" id="overview">
          <p className="eyebrow">{overviewCopy.eyebrow}</p>
          <h1 className="h1">{overviewCopy.title}</h1>
          <p className="body-lg">{overviewCopy.description}</p>
          <div className="rm-docs__overview-actions">
            <a className="btn btn-primary" href="#public">
              Public 보기
            </a>
            <a className="btn btn-secondary" href="#member">
              Member 보기
            </a>
          </div>
        </header>

        <section className="rm-docs__section" aria-labelledby="patterns-heading">
          <div className="rm-docs__section-heading">
            <p className="eyebrow">Pattern Gallery</p>
            <h2 className="h2" id="patterns-heading">
              Public and member scenes
            </h2>
          </div>
          <div className="rm-docs__pattern-grid">
            <PatternPreview pattern={publicPattern} />
            <PatternPreview pattern={memberPattern} />
          </div>
        </section>

        <section className="rm-docs__section" id="components" aria-labelledby="components-heading">
          <div className="rm-docs__section-heading">
            <p className="eyebrow">Components</p>
            <h2 className="h2" id="components-heading">
              Components used by the gallery
            </h2>
          </div>
          <div className="rm-docs__component-samples">
            <EmptyState
              title="아직 공개된 읽기가 없습니다"
              description="공개 예정 세션이 생기면 이 자리에 표시됩니다."
              action={<Button variant="secondary">초안 보기</Button>}
            />
            <LockedState title="승인 대기 중입니다" description="호스트가 승인하면 멤버 책상이 열립니다." reason="pending" />
          </div>
        </section>

        <section className="rm-docs__section" id="migration" aria-labelledby="migration-heading">
          <div className="rm-docs__section-heading">
            <p className="eyebrow">Migration</p>
            <h2 className="h2" id="migration-heading">
              Component status
            </h2>
          </div>
          <div className="rm-docs__component-list">
            {componentDocs.map((component) => (
              <article key={component.name} className="rm-ledger-row rm-docs__component-row">
                <div>
                  <h3 className="h4">{component.name}</h3>
                  <p className="small">{component.description}</p>
                  <p className="tiny">{component.mobile}</p>
                </div>
                <div className="rm-docs__component-meta">
                  <StatusBadge status={component.status} />
                  <code>{component.source}</code>
                </div>
              </article>
            ))}
          </div>
        </section>

        <Divider soft />
      </section>
    </main>
  );
}
