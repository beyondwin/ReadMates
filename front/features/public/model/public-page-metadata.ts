import {
  getPublicClubDisplay,
  getPublicRecordsDisplay,
  getPublicSessionDetailDisplay,
  type PublicClubView,
  type PublicSessionDetailView,
} from "@/features/public/model/public-display-model";

export type PublicPageMetadata = {
  title: string;
  description: string;
};

export const DEFAULT_PUBLIC_PAGE_METADATA: PublicPageMetadata = {
  title: "ReadMates",
  description: "ReadMates는 독서 모임의 공개 기록과 클럽 소개를 안전하게 보여주는 읽기 모임 서비스입니다.",
};

export const PUBLIC_MISSING_SESSION_METADATA: PublicPageMetadata = {
  title: "공개 기록을 찾을 수 없습니다 | ReadMates",
  description: "요청한 공개 독서 모임 기록을 찾을 수 없습니다. 공개 기록 목록에서 다시 확인해 주세요.",
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function trimDescription(value: string) {
  const text = compact(value);
  return text.length > 155 ? `${text.slice(0, 154).trimEnd()}…` : text;
}

export function buildPublicClubPageMetadata(
  data: PublicClubView,
  page: "home" | "about",
): PublicPageMetadata {
  const display = getPublicClubDisplay(data);

  if (page === "about") {
    return {
      title: `${display.clubName} 소개 | ReadMates`,
      description: trimDescription(display.about),
    };
  }

  return {
    title: `${display.clubName} | ReadMates`,
    description: trimDescription(display.tagline),
  };
}

export function buildPublicRecordsPageMetadata(data: PublicClubView): PublicPageMetadata {
  const display = getPublicRecordsDisplay(data);

  return {
    title: `${display.clubName} 공개 기록 | ReadMates`,
    description: trimDescription(`${display.clubName}에서 공개한 독서 모임 기록 ${display.countLabel}를 모았습니다.`),
  };
}

export function buildPublicSessionPageMetadata(session: PublicSessionDetailView): PublicPageMetadata {
  const display = getPublicSessionDetailDisplay(session);

  return {
    title: `${display.bookTitle} | 읽는사이 공개 기록`,
    description: trimDescription(`${display.bookAuthor} · ${display.dateLabel} · ${display.summary}`),
  };
}
