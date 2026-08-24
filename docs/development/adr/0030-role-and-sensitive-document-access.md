# ADR-0030: 역할 권한과 민감 문서 접근 권한을 분리

- 상태: Accepted
- 결정일: 2026-08-22
- 작성자: 서버·제품·보안
- 관련: `server/src/main/kotlin/com/readmates/feedback/application/service/FeedbackDocumentService.kt:38`

## 컨텍스트

Club의 public/guest/member/host route 접근과 피드백 문서 같은 민감 자산 접근은 같은 권한 질문이 아니다. 로그인 또는 제한된 member read가 가능하더라도 private feedback document를 읽을 근거가 되지 않는다.

## 결정

Route/API의 역할별 capability와 민감 문서 접근 capability를 별도로 검사한다. 피드백 문서 member read는 active membership을, host preview는 host authority를 요구한다(`FeedbackDocumentService.kt:38-42`, `FeedbackDocumentService.kt:77-81`, `FeedbackDocumentService.kt:106-119`). Suspended/inactive/cross-club actor에게는 민감 문서를 반환하지 않는다.

## 근거

- 일반 화면 노출과 민감 자산의 privacy boundary를 분리한다.
- UI guard와 server authorization을 각각 검증할 수 있다.

## 대안

| 대안 | 기각 이유 |
| --- | --- |
| 로그인만 하면 문서 허용 | Membership 상태와 club scope를 무시한다. |
| UI에서만 버튼 숨김 | Direct API access를 막지 못한다. |

## 결과

긍정적:
- 민감 문서가 명시적 capability 아래에 놓인다.

부정적/감수한 비용:
- Route loader와 server authorization matrix를 함께 유지해야 한다.

## 검증

- guest/viewer/active member/host/suspended/inactive와 cross-club matrix를 API/E2E test한다.

## 후속 작업

- 새 민감 문서 유형은 같은 capability 원칙으로 별도 정책을 정의한다.
