import { useState } from "react";

export type LoadMoreCallback = () => Promise<void>;

export function LoadMoreButton({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMoreCallback }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!visible || !onLoadMore) {
    return null;
  }

  return (
    <div style={{ display: "grid", justifyItems: "center", gap: "12px", paddingTop: "24px" }}>
      {failed ? (
        <p role="status" className="small" style={{ color: "var(--text-2)", margin: 0 }}>
          기록을 더 불러오지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-quiet"
        disabled={pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          setFailed(false);
          try {
            await onLoadMore();
          } catch {
            setFailed(true);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "불러오는 중" : failed ? "다시 시도" : "더 보기"}
      </button>
    </div>
  );
}

export function MobileLoadMoreButton({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMoreCallback }) {
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  if (!visible || !onLoadMore) {
    return null;
  }

  return (
    <section className="m-sec" style={{ paddingTop: 0 }}>
      {failed ? (
        <p role="status" className="small" style={{ color: "var(--text-2)", margin: "0 0 12px" }}>
          기록을 더 불러오지 못했습니다. 다시 시도해 주세요.
        </p>
      ) : null}
      <button
        type="button"
        className="btn btn-quiet"
        style={{ width: "100%", minHeight: 44 }}
        disabled={pending}
        aria-busy={pending}
        onClick={async () => {
          setPending(true);
          setFailed(false);
          try {
            await onLoadMore();
          } catch {
            setFailed(true);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "불러오는 중" : failed ? "다시 시도" : "더 보기"}
      </button>
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rm-empty-state" style={{ margin: "36px 0 0", padding: "28px" }}>
      <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
        {message}
      </p>
    </div>
  );
}

export function MobileEmptyState({ message }: { message: string }) {
  return (
    <section className="m-sec">
      <div className="m-card-quiet">
        <p className="small" style={{ color: "var(--text-2)", margin: 0 }}>
          {message}
        </p>
      </div>
    </section>
  );
}
