# ReadMates 플랫폼 어드민 운영 제품 재설계 시안

이 폴더는 2026-08-30 승인된 typography·shell 일관 시안 7종을 보존한다. 구현 계약과 화면별 의도는
`docs/development/2026-08-30-readmates-platform-admin-operations-product-redesign-design.md`가 소유한다.

## 고정 시각 계약

- Font direction: 멤버 제품과 같은 `Pretendard Variable`. 실제 구현은 repository font token `--f-sans`를 사용한다.
- Desktop canvas: 모든 화면 `1672 × 941`.
- Mobile canvas: 두 화면 `853 × 1844`.
- Desktop type scale: `36 / 28 / 20 / 17 / 16 / 14 / 12px`.
- Mobile type scale: `28 / 20 / 17 / 16 / 14 / 12px`.
- Surface: warm paper, charcoal ink, deep ink-blue action, muted ochre attention, hairline divider.
- 정상은 조용히, 주의·오래됨·부분 실패·결과 불명만 강조한다.
- 플랫폼 셸에는 특정 클럽 슬로건이나 독서 내용을 넣지 않는다.

각 PNG에는 같은 이름의 JSON sidecar와 embedded generation prompt가 있다. 이 시안은 정보 구조·톤·비율의
권위이지 이미지 모델이 정확한 font file을 렌더했다는 증거가 아니다. 런타임은 bundled Pretendard와 repository
design token을 사용해야 한다.

## 화면

1. `01-today-desktop.png` — 오늘 할 일 desktop
2. `02-clubs-desktop.png` — 클럽 관리 desktop
3. `03-service-status-desktop.png` — 서비스 상태 desktop
4. `04-processing-records-desktop.png` — 처리 기록 desktop
5. `05-space-switcher-desktop.png` — 전역 공간 전환 desktop
6. `06-today-mobile.png` — 오늘 할 일 mobile list
7. `07-work-detail-mobile.png` — 작업 detail·safe action mobile
