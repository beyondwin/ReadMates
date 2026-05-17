import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookCover } from "./book-cover";

describe("BookCover", () => {
  it("renders a public-safe fallback when no image source is provided", () => {
    render(<BookCover title="조용한 페이지들" author="가상의 저자" size="sm" />);

    const cover = screen.getByLabelText("조용한 페이지들, 가상의 저자");
    expect(cover).toHaveClass("rm-book-cover", "rm-book-cover--sm");
    expect(screen.getByText("조용한 페이지들")).toBeInTheDocument();
    expect(screen.getByText("가상의 저자")).toBeInTheDocument();
  });

  it("renders an image cover with stable alt text", () => {
    render(<BookCover title="Archive Notes" imageSrc="/covers/archive-notes.png" imageAlt="Archive Notes cover" />);

    const image = screen.getByRole("img", { name: "Archive Notes cover" });
    expect(image).toHaveAttribute("src", "/covers/archive-notes.png");
    expect(image).toHaveClass("rm-book-cover__image");
  });
});
