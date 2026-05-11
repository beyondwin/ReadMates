> 새 post-mortem 작성 시 이 파일을 `YYYY-MM-DD-<short-slug>.md`로 복사한 뒤 채우세요. 인덱스(`README.md`)도 함께 갱신합니다.

# Post-mortem — <짧은 incident 제목>

- 발생일시: YYYY-MM-DD HH:MM (TZ)
- 탐지일시: YYYY-MM-DD HH:MM (TZ)
- 완화일시: YYYY-MM-DD HH:MM (TZ)
- 영구 수정일시: YYYY-MM-DD HH:MM (TZ) (해당 시)
- Severity: SEV1 | SEV2 | SEV3 | SEV4
- 영향 범위: <서비스/사용자/데이터>
- 작성자: <역할>
- 상태: Draft | Reviewed | Closed
- 관련: <ADR/spec/plan/PR/commit 링크>

## TL;DR

(2~3문장. 무엇이, 왜, 어떻게 끝났는지.)

## 영향

- 사용자 영향:
- 데이터 영향:
- 매출/계약/SLA 영향: (해당 시)
- 내부 리소스 (대응 시간):

## Timeline

| 시각 (KST) | 이벤트 |
|-----------|--------|
| HH:MM | ... |
| HH:MM | ... |

## 탐지

- 어떻게 알게 되었나 (사용자 보고 / alert / 본인 시연 등).
- 탐지까지 걸린 시간.
- 더 빨리 탐지할 수 있었는가 (alert/모니터링 gap).

## Root cause

(*5 whys* 또는 동등한 분석. 코드/설정/사람/프로세스 다층 분석.)

### 코드/시스템 차원

(파일 path:line, 데이터 흐름, 잘못된 가정.)

### 프로세스/조직 차원

(이 incident가 *발생할 수 있었던 환경*에 대한 분석. 예: dev/prod parity 검증 부재, 회귀 테스트 누락 등.)

## 완화 (단기 조치)

(완화 단계의 행동들. 영구 수정 전.)

## 영구 수정

(코드/설정 변경. spec/plan/PR 링크.)

## 검증

(영구 수정이 동작함을 어떻게 확인했나. 테스트/manual repro/모니터링.)

## Lessons learned

- 잘 한 것:
- 못 한 것:
- 운이 좋았던 것:

## Action items

| # | 항목 | 우선순위 | 오너 | 상태 | 트래킹 |
|---|------|---------|------|------|-------|
| 1 | ... | P1 | ... | Open / Done | <PR/issue> |

## Severity rationale

(왜 이 severity였는지. boundary case 설명.)
