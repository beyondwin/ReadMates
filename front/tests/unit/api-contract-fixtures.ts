import type { CurrentSessionResponse } from "@/features/current-session/api/current-session-contracts";
import type { FeedbackDocumentResponse } from "@/features/feedback/api/feedback-contracts";
import type { MemberArchiveSessionDetailResponse } from "@/features/archive/api/archive-contracts";
import type { AuthMeResponse } from "@/shared/auth/auth-contracts";
import type {
  CurrentSessionResponse as HostCurrentSessionResponse,
  HostInvitationListItem,
  HostMemberListItem,
  HostSessionDetailResponse,
  HostSessionPublication,
} from "@/features/host/api/host-contracts";

export const authMeContractFixture = {
  authenticated: true,
  userId: "user-1",
  membershipId: "membership-1",
  clubId: "club-1",
  email: "member@example.com",
  displayName: "이멤버5",
  shortName: "멤버5",
  role: "MEMBER",
  membershipStatus: "ACTIVE",
  approvalState: "ACTIVE",
} satisfies AuthMeResponse;

export const anonymousAuthMeContractFixture = {
  authenticated: false,
  userId: null,
  membershipId: null,
  clubId: null,
  email: null,
  displayName: null,
  shortName: null,
  role: null,
  membershipStatus: null,
  approvalState: "ANONYMOUS",
} satisfies AuthMeResponse;

export const hostInvitationContractFixture = {
  invitationId: "invite-1",
  email: "invited@example.com",
  name: "초대 멤버",
  role: "MEMBER",
  status: "PENDING",
  effectiveStatus: "PENDING",
  expiresAt: "2026-05-20T12:00:00Z",
  acceptedAt: null,
  createdAt: "2026-04-20T12:00:00Z",
  applyToCurrentSession: true,
  canRevoke: true,
  canReissue: true,
} satisfies HostInvitationListItem;

export const hostMemberContractFixture = {
  membershipId: "membership-1",
  userId: "user-1",
  email: "member@example.com",
  displayName: "이멤버5",
  shortName: "멤버5",
  profileImageUrl: null,
  role: "MEMBER",
  status: "ACTIVE",
  joinedAt: "2026-04-20T12:00:00Z",
  createdAt: "2026-04-20T12:00:00Z",
  currentSessionParticipationStatus: "ACTIVE",
  canSuspend: true,
  canRestore: false,
  canDeactivate: true,
  canAddToCurrentSession: false,
  canRemoveFromCurrentSession: true,
} satisfies HostMemberListItem;

export const currentSessionContractFixture = {
  currentSession: {
    sessionId: "session-7",
    sessionNumber: 7,
    title: "7회차 모임 · 테스트 책",
    bookTitle: "테스트 책",
    bookAuthor: "테스트 저자",
    bookLink: "https://example.com/books/test-book",
    bookImageUrl: "https://example.com/covers/test-book.jpg",
    date: "2026-05-20",
    startTime: "20:00",
    endTime: "22:00",
    locationLabel: "온라인",
    meetingUrl: "https://meet.google.com/readmates-current",
    meetingPasscode: "currentpass",
    questionDeadlineAt: "2026-05-19T14:59:00Z",
    myRsvpStatus: "NO_RESPONSE",
    myCheckin: {
      readingProgress: 72,
    },
    myQuestions: [
      {
        priority: 3,
        text: "API에서 온 내 질문",
        draftThought: "API에서 온 내 초안",
        authorName: "이멤버5",
        authorShortName: "수",
      },
      {
        priority: 4,
        text: "API에서 온 내 질문 2",
        draftThought: "API에서 온 내 초안 2",
        authorName: "이멤버5",
        authorShortName: "수",
      },
    ],
    myOneLineReview: {
      text: "API에서 온 한줄평",
    },
    myLongReview: {
      body: "API에서 온 장문 서평",
    },
    board: {
      questions: [
        {
          priority: 2,
          text: "API에서 온 질문",
          draftThought: "API에서 온 질문 초안",
          authorName: "김호스트",
          authorShortName: "우",
        },
      ],
      oneLineReviews: [
        {
          authorName: "김호스트",
          authorShortName: "우",
          text: "API에서 온 공동 한줄평",
        },
      ],
      highlights: [
        {
          text: "API에서 온 하이라이트",
          sortOrder: 1,
        },
      ],
    },
    attendees: [
      {
        membershipId: "member-host",
        displayName: "김호스트",
        shortName: "우",
        role: "HOST",
        rsvpStatus: "GOING",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
      },
      {
        membershipId: "member-guest",
        displayName: "이멤버5",
        shortName: "수",
        role: "MEMBER",
        rsvpStatus: "NO_RESPONSE",
        attendanceStatus: "UNKNOWN",
        participationStatus: "ACTIVE",
      },
    ],
  },
} satisfies CurrentSessionResponse;

export const hostCurrentSessionContractFixture = currentSessionContractFixture satisfies HostCurrentSessionResponse;

export const archiveSessionDetailContractFixture = {
  sessionId: "00000000-0000-0000-0000-000000000301",
  sessionNumber: 1,
  title: "1회차 모임 · 팩트풀니스",
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
  date: "2025-11-26",
  state: "CLOSED",
  locationLabel: "읽는사이 서재",
  attendance: 5,
  total: 6,
  myAttendanceStatus: "ATTENDED",
  isHost: false,
  publicSummary: "데이터로 세상을 더 정확하게 보는 태도를 이야기했습니다.",
  publicHighlights: [
    {
      text: "세계는 생각보다 나아지고 있지만, 우리의 감각은 느리게 따라온다.",
      sortOrder: 1,
      authorName: "안멤버1",
      authorShortName: "멤버1",
    },
  ],
  clubQuestions: [
    {
      priority: 1,
      text: "10가지 본능 중에서 본인에게 가장 강하게 작용한다고 느낀 것은 무엇인가요?",
      draftThought: "데이터 기반 사고가 일상 판단과 멀어지는 순간을 묻는다.",
      authorName: "이멤버5",
      authorShortName: "수",
    },
  ],
  clubOneLiners: [
    {
      authorName: "김호스트",
      authorShortName: "우",
      text: "낙관이 아니라 정확함의 문제였다.",
    },
  ],
  publicOneLiners: [
    {
      authorName: "김호스트",
      authorShortName: "우",
      text: "낙관이 아니라 정확함의 문제였다.",
    },
  ],
  myQuestions: [
    {
      priority: 1,
      text: "내 판단의 출처를 어떻게 표시할 수 있을까요?",
      draftThought: null,
      authorName: "이멤버5",
      authorShortName: "수",
    },
  ],
  myCheckin: {
    readingProgress: 100,
  },
  myOneLineReview: {
    text: "정확하게 보는 태도도 꾸준한 연습이 필요했다.",
  },
  myLongReview: {
    body: "팩트풀니스는 낙관을 말하는 책이라기보다 판단의 절차를 다시 묻는 책이었다.",
  },
  feedbackDocument: {
    available: true,
    readable: true,
    lockedReason: null,
    title: "독서모임 1차 피드백",
    uploadedAt: "2026-04-20T09:00:00Z",
  },
} satisfies MemberArchiveSessionDetailResponse;

export const hostSessionPublicationContractFixture = {
  publicSummary: "데이터를 읽는 태도와 대화의 균형을 공개 요약으로 남겼습니다.",
  isPublic: true,
} satisfies HostSessionPublication;

export const hostSessionDetailContractFixture = {
  sessionId: "session-1",
  sessionNumber: 1,
  title: "1회차 모임 · 팩트풀니스",
  bookTitle: "팩트풀니스",
  bookAuthor: "한스 로슬링",
  bookLink: "https://example.com/books/factfulness",
  bookImageUrl: "https://image.aladin.co.kr/product/34538/43/cover500/8934933879_1.jpg",
  date: "2025-11-26",
  startTime: "20:00",
  endTime: "22:00",
  questionDeadlineAt: "2025-11-25T14:59:00Z",
  locationLabel: "온라인",
  meetingUrl: "https://meet.google.com/readmates-factfulness",
  meetingPasscode: "fact",
  publication: hostSessionPublicationContractFixture,
  state: "CLOSED",
  attendees: [
    {
      membershipId: "membership-host",
      displayName: "김호스트",
      shortName: "우",
      rsvpStatus: "GOING",
      attendanceStatus: "ATTENDED",
      participationStatus: "ACTIVE",
    },
    {
      membershipId: "membership-suhan",
      displayName: "이멤버5",
      shortName: "수",
      rsvpStatus: "GOING",
      attendanceStatus: "ATTENDED",
      participationStatus: "ACTIVE",
    },
  ],
  feedbackDocument: {
    uploaded: true,
    fileName: "251126 1차.md",
    uploadedAt: "2026-04-20T09:00:00Z",
  },
} satisfies HostSessionDetailResponse;

export const feedbackDocumentContractFixture = {
  sessionId: "session-1",
  sessionNumber: 1,
  title: "독서모임 1차 피드백",
  subtitle: "팩트풀니스 · 2025.11.26",
  bookTitle: "팩트풀니스",
  date: "2025-11-26",
  fileName: "251126 1차.md",
  uploadedAt: "2026-04-20T09:00:00Z",
  metadata: [
    { label: "도서", value: "팩트풀니스" },
    { label: "회차", value: "1차" },
  ],
  observerNotes: [
    "수치와 경험이 부딪힐 때 각자가 어떤 기준을 붙드는지가 선명하게 드러났다.",
    "좋은 질문은 정답을 찾기보다 자기 판단의 출처를 확인하게 만들었다.",
  ],
  participants: [
    {
      number: 1,
      name: "이멤버5",
      role: "데이터의 빈틈을 먼저 찌르는 사람",
      style: ["가설을 빠르게 세우고 근거를 요구한다."],
      contributions: ["토론 초반에 책의 수치 기준을 다시 확인하게 만들었다."],
      problems: [
        {
          title: "출처 없는 수치로 책의 기준을 바로 흔들었다",
          core: "감각적으로 떠오른 숫자를 검증된 근거처럼 사용했다.",
          evidence: '"우리나라가 70퍼센트쯤은 이미 선진국 기준 아닐까요?" [00:12]',
          interpretation: "문제를 제기하는 힘은 컸지만, 출처 확인이 늦어져 논점이 흐려졌다.",
        },
      ],
      actionItems: ["다음 모임에서는 숫자를 말하기 전에 출처나 산식 중 하나를 함께 적는다."],
      revealingQuote: {
        quote: "저는 일단 숫자로 반박하고 싶은 마음이 먼저 들어요.",
        context: "팩트풀니스의 데이터 해석 방식을 이야기하던 중 · [00:31]",
        note: "숫자를 검증 도구로 쓰려는 장점과 숫자에 기대어 결론을 서두르는 습관이 함께 드러났다.",
      },
    },
    {
      number: 2,
      name: "김호스트",
      role: "대화의 구조를 잡는 진행자",
      style: ["발언을 묶고 다음 질문으로 전환한다."],
      contributions: ["참여자들의 사례를 10가지 본능과 연결했다."],
      problems: [
        {
          title: "정리하려는 속도가 질문의 여지를 줄였다",
          core: "갈등이 생기기 전에 결론 문장으로 먼저 묶었다.",
          evidence: '"그럼 이건 간극 본능으로 정리할 수 있겠네요." [00:47]',
          interpretation: "진행은 안정적이었지만 이견이 더 깊어질 기회가 짧아졌다.",
        },
      ],
      actionItems: ["정리 전에 반대 사례를 한 명에게 더 요청한다."],
      revealingQuote: {
        quote: "제가 빨리 묶어버리면 편하긴 한데 놓치는 게 있네요.",
        context: "토론 마무리 회고 중 · [01:22]",
        note: "진행자의 효율성과 탐색의 여백 사이에서 생기는 긴장을 자각했다.",
      },
    },
    {
      number: 3,
      name: "박민지",
      role: "개인 경험으로 추상 개념을 낮추는 사람",
      style: ["일상 사례로 책의 개념을 번역한다."],
      contributions: ["부정 본능을 뉴스 소비 습관과 연결했다."],
      problems: [
        {
          title: "개인 사례가 보편 결론으로 빨리 커졌다",
          core: "내 경험의 강도를 전체 현상의 크기처럼 말했다.",
          evidence: '"주변을 보면 다들 뉴스 때문에 더 불안해하잖아요." [00:58]',
          interpretation: "공감은 만들었지만 표본의 한계를 스스로 표시하지 않았다.",
        },
      ],
      actionItems: ["경험을 말한 뒤 '내 주변 기준'인지 '자료 기준'인지 구분해서 덧붙인다."],
      revealingQuote: {
        quote: "제 경험으로는 너무 당연해서 자료를 안 찾아봤어요.",
        context: "뉴스 소비 이야기를 나눈 뒤 · [01:06]",
        note: "강한 체감이 검증 과정을 생략하게 만드는 패턴이 드러났다.",
      },
    },
  ],
} satisfies FeedbackDocumentResponse;
