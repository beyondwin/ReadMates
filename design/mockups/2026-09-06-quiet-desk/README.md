# Quiet Desk — 호스트·어드민 코드 네이티브 시안

호스트·어드민 리디자인의 시각 권위 소스입니다. 스펙과 구현 계획은
`docs/superpowers/specs/2026-09-06-quiet-desk-host-admin-redesign-design.md`,
`docs/superpowers/plans/2026-09-06-quiet-desk-host-admin-redesign.md`를 따릅니다.

- `gen/*.py`: 아트보드 생성기. 화면 함수 하나 = 아트보드 하나. 손으로 `.dc.html`을 고치지 않습니다.
- `*.dc.html` 71장, `canvas.json`: 생성기 출력물. 데스크톱 1440, 모바일 390.
- 데이터는 전부 가상(을지로 북살롱, 지구 끝의 온실, 가상 인물)입니다. 실제 멤버 데이터·비밀·사설 도메인은 넣지 않습니다.

빌드(리뷰 캔버스용 Pretendard 서브셋 포함):

```bash
python3 -m venv .venv && .venv/bin/pip install fonttools brotli
.venv/bin/python gen/build.py
```

계약 추출·게이트·CSS 단일 소스 이관은 구현 계획 슬라이스 0에서 진행합니다. 현재 `gen/lib.py`는 토큰·문법 CSS를 문자열로 들고 있으며 Task 0.1에서 런타임 파일 읽기로 바뀝니다.
