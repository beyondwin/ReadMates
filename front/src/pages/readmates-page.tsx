import type { ReactNode } from "react";
import type { ReadmatesDataState } from "@/src/pages/readmates-page-data";

export function ReadmatesPageState<T>({
  state,
  loadingLabel = "불러오는 중",
  children,
}: {
  state: ReadmatesDataState<T>;
  loadingLabel?: string;
  children: (data: T) => ReactNode;
}) {
  if (state.status === "loading") {
    return <main className="container">{loadingLabel}</main>;
  }

  if (state.status === "error") {
    return (
      <main className="container">
        <section className="surface" style={{ margin: "48px 0", padding: 28 }}>
          <p className="eyebrow">불러오기 실패</p>
          <h1 className="h2 editorial" style={{ margin: "8px 0 0" }}>
            페이지를 불러오지 못했습니다.
          </h1>
          <p className="body" style={{ color: "var(--text-2)" }}>
            잠시 후 다시 시도해 주세요.
          </p>
        </section>
      </main>
    );
  }

  return <>{children(state.data)}</>;
}
