import { Badge, Button, Divider, Surface, TextArea, TextField } from "@readmates/design-system";
import { componentDocs } from "./docs-data";

function StatusBadge({ status }: { status: "stable" | "experimental" | "legacy" | "deprecated" }) {
  const tone =
    status === "stable" ? "success" : status === "legacy" ? "warning" : status === "deprecated" ? "locked" : "accent";

  return <Badge tone={tone}>{status}</Badge>;
}

export function App() {
  return (
    <main className="rm-docs">
      <aside className="rm-docs__sidebar" aria-label="Design system sections">
        <strong>ReadMates DS</strong>
        <a href="#foundations">Foundations</a>
        <a href="#components">Components</a>
        <a href="#responsive">Responsive</a>
        <a href="#migration">Migration</a>
      </aside>

      <section className="rm-docs__content">
        <header className="rm-docs__hero" id="foundations">
          <p className="eyebrow">ReadMates Design System</p>
          <h1 className="h1">조용한 읽는 방과 정밀한 운영 원장을 같은 코드로 유지합니다.</h1>
          <p className="body-lg">
            이 문서 사이트는 실제 `@readmates/design-system` 컴포넌트를 렌더링합니다. 제품 앱도 같은 package를
            import해야 합니다.
          </p>
        </header>

        <section className="rm-docs__section" id="components" aria-labelledby="components-heading">
          <div className="row-between">
            <div>
              <p className="eyebrow">Components</p>
              <h2 className="h2" id="components-heading">
                Primitives
              </h2>
            </div>
            <Badge tone="success" dot>
              first pass
            </Badge>
          </div>

          <Surface tone="documentPanel" className="rm-docs__preview">
            <div className="rm-docs__preview-row">
              <Button variant="primary">저장</Button>
              <Button variant="secondary">취소</Button>
              <Button variant="ghost" size="sm">
                미리보기
              </Button>
              <Button variant="quiet" size="sm">
                자세히
              </Button>
            </div>
            <div className="rm-docs__preview-row">
              <Badge tone="pending" dot>
                준비 중
              </Badge>
              <Badge tone="success" dot>
                발행됨
              </Badge>
              <Badge tone="warning" dot>
                확인 필요
              </Badge>
              <Badge tone="locked">권한 제한</Badge>
            </div>
            <div className="rm-docs__form-grid">
              <TextField label="표시 이름" placeholder="읽는사이 멤버" />
              <TextArea label="세션 메모" placeholder="모임에서 남길 질문이나 메모" />
            </div>
          </Surface>
        </section>

        <section className="rm-docs__section" id="responsive" aria-labelledby="responsive-heading">
          <p className="eyebrow">Responsive</p>
          <h2 className="h2" id="responsive-heading">
            Desktop and mobile preview
          </h2>
          <div className="rm-docs__responsive-grid">
            <Surface className="rm-docs__desktop-preview">
              <p className="small">Desktop</p>
              <div className="rm-docs__preview-row">
                <Button variant="primary">세션 저장</Button>
                <Button variant="secondary">초안 유지</Button>
              </div>
            </Surface>
            <Surface className="rm-docs__mobile-preview">
              <p className="small">Mobile</p>
              <Button variant="primary">세션 저장</Button>
              <Button variant="secondary">초안 유지</Button>
            </Surface>
          </div>
        </section>

        <section className="rm-docs__section" id="migration" aria-labelledby="migration-heading">
          <p className="eyebrow">Migration</p>
          <h2 className="h2" id="migration-heading">
            Component status
          </h2>
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
