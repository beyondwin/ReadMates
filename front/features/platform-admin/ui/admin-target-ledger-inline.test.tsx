import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AdminTargetLedgerInline } from "./admin-target-ledger-inline";

const LEDGER_CSS = readFileSync(
  path.resolve("features/platform-admin/ui/admin-editorial-ledger.css"),
  "utf8",
);

const ENTRIES = [
  { at: "8.26 19:40", sentence: "신호가 처음 감지됨 · 미확인" },
  { at: "8.26 20:02", sentence: "운영자가 확인함 · 확인됨" },
  { at: "8.26 21:15", sentence: "운영자가 보류함 · 보류됨" },
] as const;

function renderInline(
  props: {
    entries: ReadonlyArray<{ at: string; sentence: string }>;
    moreHref: string;
  } = {
    entries: ENTRIES,
    moreHref: "/admin/audit?target=club-reading-sai",
  },
) {
  return render(
    <MemoryRouter>
      <AdminTargetLedgerInline {...props} />
    </MemoryRouter>,
  );
}

describe("AdminTargetLedgerInline", () => {
  it("renders three sentence rows, mono times, and the more-ledger href", () => {
    const { container } = renderInline();

    const root = container.querySelector(".ledger-inline");
    expect(root).not.toBeNull();
    const rows = [...root!.querySelectorAll(":scope > .li")];
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.querySelector("time")?.textContent)).toEqual([
      "8.26 19:40",
      "8.26 20:02",
      "8.26 21:15",
    ]);
    expect(rows.map((row) => row.querySelector("span")?.textContent)).toEqual([
      "신호가 처음 감지됨 · 미확인",
      "운영자가 확인함 · 확인됨",
      "운영자가 보류함 · 보류됨",
    ]);
    expect(LEDGER_CSS).toMatch(/\.ledger-inline[\s\S]*\.li time[\s\S]*font-family:\s*var\(--f-mono\)/);
    expect(screen.getByRole("link", { name: "전체 처리 기록 보기" })).toHaveAttribute(
      "href",
      "/admin/audit?target=club-reading-sai",
    );
  });

  it("caps at three rows and does not invent entries when empty", () => {
    const { container, rerender } = renderInline({
      entries: [
        ...ENTRIES,
        { at: "8.26 22:00", sentence: "운영자가 해결 확인함 · 해결됨" },
      ],
      moreHref: "/admin/audit?target=case-notification",
    });

    expect(container.querySelectorAll(".ledger-inline .li")).toHaveLength(3);
    expect(screen.queryByText("운영자가 해결 확인함 · 해결됨")).not.toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <AdminTargetLedgerInline entries={[]} moreHref="/admin/audit?target=case-notification" />
      </MemoryRouter>,
    );

    expect(container.querySelectorAll(".ledger-inline .li")).toHaveLength(0);
    expect(screen.queryByText("신호가 처음 감지됨 · 미확인")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "전체 처리 기록 보기" })).toHaveAttribute(
      "href",
      "/admin/audit?target=case-notification",
    );
  });
});
