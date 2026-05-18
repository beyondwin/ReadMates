import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BookCover } from "./book-cover";

describe("BookCover", () => {
  it("derives an accessible label combining title and author for the fallback cover", () => {
    render(<BookCover title="조용한 페이지들" author="가상의 저자" />);

    expect(screen.getByLabelText("조용한 페이지들, 가상의 저자")).toBeInTheDocument();
    expect(screen.getByText("조용한 페이지들")).toBeInTheDocument();
    expect(screen.getByText("가상의 저자")).toBeInTheDocument();
  });

  it("renders an image cover with the provided src and alt", () => {
    render(<BookCover title="Archive Notes" imageSrc="/covers/archive-notes.png" imageAlt="Archive Notes cover" />);

    expect(screen.getByRole("img", { name: "Archive Notes cover" })).toHaveAttribute(
      "src",
      "/covers/archive-notes.png",
    );
  });
});
