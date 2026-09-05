import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookCover } from "@/shared/ui/book-cover";

describe("BookCover", () => {
  it("renders a same-origin cover image with rm-book-cover__image when imageUrl is present", () => {
    render(<BookCover title="지구 끝의 온실" author="김초엽" imageUrl="/covers/x.webp" />);

    const image = screen.getByRole("img", { name: /지구 끝의 온실/ });
    expect(image).toHaveClass("rm-book-cover__image");
    expect(image).toHaveAttribute("src", "/covers/x.webp");
    expect(document.querySelector(".rm-book-cover__fallback")).toBeNull();
  });

  it("rejects a tab-prefixed path that would become protocol-relative", () => {
    render(<BookCover title="지구 끝의 온실" author="김초엽" imageUrl={"/\t/evil.example/x.png"} />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector(".rm-book-cover__fallback")).not.toBeNull();
  });

  it("keeps the text tile when the image URL is not a safe cover source", () => {
    render(<BookCover title="지구 끝의 온실" author="김초엽" imageUrl="javascript:unsafe" />);

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector(".rm-book-cover__fallback")).not.toBeNull();
  });
});
