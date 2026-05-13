import { useState } from "react";

export type LoadMoreCallback = () => Promise<void>;

export function LoadMoreButton({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMoreCallback }) {
  const [pending, setPending] = useState(false);

  if (!visible || !onLoadMore) {
    return null;
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", paddingTop: "24px" }}>
      <button
        type="button"
        className="btn btn-quiet"
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

export function MobileLoadMoreButton({ visible, onLoadMore }: { visible: boolean; onLoadMore?: LoadMoreCallback }) {
  const [pending, setPending] = useState(false);

  if (!visible || !onLoadMore) {
    return null;
  }

  return (
    <section className="m-sec" style={{ paddingTop: 0 }}>
      <button
        type="button"
        className="btn btn-quiet"
        style={{ width: "100%", minHeight: 42 }}
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
