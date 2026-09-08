# ADR-0054: 코드 네이티브 시안 계약을 호스트·어드민 시각 권위로 사용

- 상태: Proposed
- 결정일: 2026-09-06
- 기록일: 2026-09-09
- 작성자: product/design/front
- 관련: ADR-0053, ADR-0045, ADR-0048, ADR-0050, ADR-0051

## 컨텍스트

2026-09-06 승인된 Quiet Desk 설계는 생성 가능한 HTML 시안과 런타임이 CSS·토큰·가상 픽스처를 공유하고, 추출된 계약으로 화면을 검증하는 방향을 정했다. 이 기록은 승인된 결정을 등록하며 구현 완료를 의미하지 않는다.

현재 `design/mockups/2026-09-06-quiet-desk/gen/lib.py:86`의 `CSS`는 생성기 내부 문자열이다. `front/package.json:17`의 `test:e2e:approved-routes`는 Docker helper 내부 비교 명령이며 일반 host에서는 renderer 조건으로 비교 spec이 수집되지 않는다. `front/package.json:18`의 `test:e2e:approved-routes:docker`가 현재 strict PNG 검증 경로다. CSS 공유·계약 추출·새 CI 게이트는 아직 구현되지 않았다.

## 결정

호스트·어드민 시안은 런타임 CSS·토큰·가상 픽스처를 공유하는 `.dc.html` 생성물로 관리한다. 화면별 `data-spec`의 존재·순서·DOM 서명·geometry·typography와 오버플로·접근성 계약을 합격 기준으로 삼고, 픽셀 비교는 보고용으로 남긴다. 생성물과 추출 계약의 신선도를 검사한다.

이 결정은 시각 권위와 검증 방식에 한정한다. 서버·BFF·권한·revision·receipt 계약은 변경하지 않는다. 호스트·어드민 composition, 공유 셸, primitive에 관한 Accepted ADR-0055/0048/0050/0051의 결정 변경은 별도의 focused ADR로 supersede해야 하며 기존 본문을 수정하지 않는다.

## 근거와 대안

공유 원본과 추출 계약은 시안과 런타임 간 차이를 추적하기 쉽게 한다. PNG 단독 기준은 CSS·DOM·픽스처 계약을 제공하지 않고, 런타임 snapshot만 갱신하면 구현의 차이를 기준으로 굳힐 수 있다. 다만 구조 검사가 시각적 품질을 모두 보장하지는 않으므로 사람의 작업 발견성과 보조기술 검증은 계속 필요하다.

## 결과와 전환 조건

- 생성기·추출기·런타임의 공통 계약을 유지하는 비용이 추가된다. 긴 문구·빈 목록·오류·모바일 상태는 별도 stress 검증이 필요하다.
- ADR-0053과 현재 PNG 게이트는 전환 검증이 끝날 때까지 유지한다. 이 문서 등록만으로 CI를 끄거나 임계값을 완화하지 않는다.
- 전체 대상 화면의 구현·계약·흐름 검증과 사람·보조기술 evidence, active docs가 일치한 뒤 ADR-0054를 `Accepted`로 전환하고 ADR-0053을 `Superseded by ADR-0054`로 연결한다.

## 검증과 후속 작업

현재 증거는 승인 설계와 시안 생성기뿐이며 새 계약 게이트는 미구현이다. 구현 작업은 full source checkout에만 포함되는 `docs/superpowers/specs/2026-09-06-quiet-desk-host-admin-redesign-design.md`와 `docs/superpowers/plans/2026-09-06-quiet-desk-host-admin-redesign.md`의 슬라이스 0~8을 따른다. 미구현 명령과 사람·보조기술 검증을 통과로 기록하지 않는다.
