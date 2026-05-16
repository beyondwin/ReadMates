import type { HTMLAttributes } from "react";
import { cx } from "./classnames";

export type BookCoverSize = "sm" | "md" | "lg";

export type BookCoverProps = HTMLAttributes<HTMLDivElement> & {
  title: string;
  author?: string;
  imageSrc?: string;
  imageAlt?: string;
  size?: BookCoverSize;
};

const sizeClassName: Record<BookCoverSize, string> = {
  sm: "rm-book-cover--sm",
  md: "rm-book-cover--md",
  lg: "rm-book-cover--lg",
};

export function BookCover({
  title,
  author,
  imageSrc,
  imageAlt,
  size = "md",
  className,
  ...props
}: BookCoverProps) {
  const coverLabel = author ? `${title}, ${author}` : title;

  return (
    <div {...props} aria-label={coverLabel} className={cx("rm-book-cover", sizeClassName[size], className)}>
      {imageSrc ? (
        <img src={imageSrc} alt={imageAlt ?? `${title} cover`} className="rm-book-cover__image" />
      ) : (
        <div className="rm-book-cover__fallback" aria-hidden="true">
          <span className="tiny">{author ?? "ReadMates"}</span>
          <strong>{title}</strong>
        </div>
      )}
    </div>
  );
}
