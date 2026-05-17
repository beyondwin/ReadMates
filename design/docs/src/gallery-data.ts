export type PatternKey = "public" | "member";

export type GalleryBook = {
  title: string;
  author: string;
};

export type PatternDoc = {
  key: PatternKey;
  eyebrow: string;
  title: string;
  description: string;
  book: GalleryBook;
  states: string[];
  components: string[];
};

export const overviewCopy = {
  eyebrow: "ReadMates Design Language",
  title: "ReadMates should feel calm, editorial, and usable.",
  description:
    "A private reading room, a quiet literary page, and a personal reading desk should share one source of truth without becoming a generic dashboard.",
};

export const patternDocs: PatternDoc[] = [
  {
    key: "public",
    eyebrow: "Public Literary Page",
    title: "Public Literary Page",
    description:
      "외부 방문자가 읽는 클럽 소개와 초대 장면입니다. 넓은 여백, 잡지형 헤드라인, 절제된 CTA를 우선합니다.",
    book: {
      title: "조용한 페이지들",
      author: "가상의 저자",
    },
    states: ["공개 소개", "멤버 전용 경계", "초대 CTA"],
    components: ["DocumentPanel", "BookCover", "EmptyState", "LockedState"],
  },
  {
    key: "member",
    eyebrow: "Member Reading Desk",
    title: "Member Reading Desk",
    description:
      "멤버가 현재 읽는 책, 세션 상태, 다음 액션을 확인하는 개인 책상 장면입니다. 정보 밀도는 높지만 차갑게 보이지 않아야 합니다.",
    book: {
      title: "Archive Notes",
      author: "ReadMates Studio",
    },
    states: ["현재 읽기", "참여 상태", "다음 액션"],
    components: ["BookCover", "AvatarChip", "DocumentPanel", "LockedState"],
  },
];

export const memberSample = {
  name: "민서 독자",
  meta: "이번 달 참여 멤버",
};
