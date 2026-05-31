// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { findUnnamedInteractiveElements } from "./accessibility-checks";

function makeContainer(html: string): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el;
}

describe("findUnnamedInteractiveElements", () => {
  it("returns elements that have no accessible name", () => {
    const container = makeContainer(`
      <button>저장</button>
      <button class="icon-only"></button>
      <a href="/x">링크</a>
      <a href="/y" class="icon-only"></a>
    `);
    const unnamed = findUnnamedInteractiveElements(container);
    expect(unnamed).toHaveLength(2);
    expect(unnamed.every((el) => el.classList.contains("icon-only"))).toBe(true);
  });

  it("treats aria-label, aria-labelledby, and title as accessible names", () => {
    const container = makeContainer(`
      <button aria-label="닫기"></button>
      <button title="메뉴"></button>
      <span id="lbl">재시도</span>
      <button aria-labelledby="lbl"></button>
      <span id="first">다시</span>
      <span id="second">시도</span>
      <button aria-labelledby="first second"></button>
    `);
    expect(findUnnamedInteractiveElements(container)).toEqual([]);
  });

  it("does not treat unresolved or empty aria-labelledby references as names", () => {
    const container = makeContainer(`
      <button class="missing-label" aria-labelledby="missing"></button>
      <span id="blank"> </span>
      <button class="blank-label" aria-labelledby="blank"></button>
    `);
    const unnamed = findUnnamedInteractiveElements(container);
    expect(unnamed.map((el) => el.className)).toEqual(["missing-label", "blank-label"]);
  });

  it("does not treat hidden descendant text as a visible name", () => {
    const container = makeContainer(`
      <button class="hidden-copy"><span hidden>저장</span></button>
      <button class="aria-hidden-copy"><span aria-hidden="true">닫기</span></button>
      <button class="style-hidden-copy"><span style="display: none;">메뉴</span></button>
      <button class="visible-copy"><span>열기</span></button>
    `);
    const unnamed = findUnnamedInteractiveElements(container);
    expect(unnamed).toHaveLength(3);
    expect(unnamed.map((el) => el.className)).toEqual([
      "hidden-copy",
      "aria-hidden-copy",
      "style-hidden-copy",
    ]);
  });

  it("returns an empty array when there are no interactive elements", () => {
    expect(findUnnamedInteractiveElements(makeContainer(`<p>본문</p>`))).toEqual([]);
  });
});
