#!/usr/bin/env python3
"""Build all artboards, embed a Pretendard subset, write canvas.json.

Usage: <venv>/bin/python gen/build.py   (needs fontTools + brotli for the subset)
Output: ../*.dc.html, ../canvas.json
"""
from __future__ import annotations

import base64
import io
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import admin  # noqa: E402
import extra  # noqa: E402
import host_desktop  # noqa: E402
import host_mobile  # noqa: E402
import mobile_more  # noqa: E402
from lib import wrap  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
FONT = pathlib.Path(__file__).resolve().parents[4] / "front/node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2"


def render_all() -> dict[str, str]:
    out: dict[str, str] = {}
    for name, _title, fn, *_ in host_desktop.ARTBOARDS + extra.DESKTOP:
        out[f"{name}.dc.html"] = fn()
    for name, _title, fn in host_mobile.ARTBOARDS + mobile_more.HOST_MORE + extra.MOBILE:
        out[f"{name}.dc.html"] = fn()
    for name, _title, fn, *_ in admin.ARTBOARDS:
        out[f"{name}.dc.html"] = fn()
    for name, _title, fn in admin.MOBILE + mobile_more.ADMIN_MORE:
        out[f"{name}.dc.html"] = fn()
    return out


def font_face(texts: list[str]) -> str:
    """Subset PretendardVariable to the glyphs used and return an @font-face rule (data URI)."""
    try:
        from fontTools import subset
        from fontTools.ttLib import TTFont
        from fontTools.varLib import instancer
    except ImportError:
        print("fonttools missing: shipping without embedded font", file=sys.stderr)
        return ""
    chars = set("".join(texts))
    chars.update("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz .,:;!?()[]{}<>/\\-–—·‘’“”%&+=@#_|→←↔…①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳")
    # Keep the variable axis but only the 400-700 range the mockups use; drop unused layout features and names.
    font = instancer.instantiateVariableFont(TTFont(str(FONT)), {"wght": (400, 700)}, inplace=False)
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt"]
    opts.name_IDs = []
    opts.notdef_outline = True
    opts.hinting = False
    subsetter = subset.Subsetter(opts)
    subsetter.populate(text="".join(sorted(chars)))
    subsetter.subset(font)
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    data = base64.b64encode(buf.getvalue()).decode("ascii")
    print(f"font subset: {len(chars)} chars, {len(buf.getvalue()) // 1024} KB woff2, {len(data) // 1024} KB base64", file=sys.stderr)
    return (
        "@font-face { font-family: 'Pretendard Variable'; font-weight: 400 700; font-style: normal; font-display: block; "
        f"src: url(data:font/woff2;base64,{data}) format('woff2'); }}\n"
    )


def canvas(desktop_h: dict[str, int]) -> dict:
    pages = [
        {"id": "host-desktop", "name": "호스트 · 데스크톱"},
        {"id": "host-mobile", "name": "호스트 · 모바일"},
        {"id": "admin-desktop", "name": "어드민 · 데스크톱"},
        {"id": "admin-mobile", "name": "어드민 · 모바일"},
    ]
    boards, notes = [], []
    gap_x, gap_y = 120, 200

    def grid(items, page, w, per_row, row_h):
        for i, (name, title, h) in enumerate(items):
            boards.append({"file": f"{name}.dc.html", "title": title, "page": page,
                           "x": (i % per_row) * (w + gap_x), "y": (i // per_row) * (row_h + gap_y), "w": w, "h": h})

    grid([(n, t, h) for n, t, _f, h in host_desktop.ARTBOARDS + extra.DESKTOP], "host-desktop", 1440, 3, 1040)
    grid([(n, t, 844) for n, t, _f in host_mobile.ARTBOARDS + mobile_more.HOST_MORE + extra.MOBILE], "host-mobile", 390, 6, 844)
    grid([(n, t, h) for n, t, _f, h in admin.ARTBOARDS], "admin-desktop", 1440, 3, 960)
    grid([(n, t, 844) for n, t, _f in admin.MOBILE + mobile_more.ADMIN_MORE], "admin-mobile", 390, 6, 844)

    notes.append({"id": "host-desktop-intro", "page": "host-desktop", "x": 0, "y": -170, "w": 1440, "text":
                  "호스트 · 데스크톱 24장(끝의 ′ 세 장은 게시 확인·새 초대 링크·휴지통). 번호는 실제 사용 순서: ① 첫 로그인 → ② 초대 링크 → ③ 승인 → ④ 새 모임 → ⑤ 준비 중 오늘 → ⑥ 모임 수정 → ⑦ 일정 안내 → ⑧ 멤버 상세 → ⑨ 당일 출석 → ⑩ 기록 작성 → ⑪ 초안 → ⑫ 피드백 문서 → ⑬ 기록 → ⑭ 모임 → ⑮ 지난 모임 상세 → ⑯~⑲ 설정 네 절 → ⑳ 보낸 안내. 마지막은 멤버 시야 헤더와 메뉴.\n"
                  "메뉴 오늘 · 모임 · 멤버 · 기록 + 설정 + 새 모임. 상태 문장 한 줄이 모임 위치를 말하고, 이번 모임 섹션(준비 현황 · 당일 출석 · 모임 기록)은 상태에 맞는 것만 펼침. 할 일은 첫 항목만 펼침.\n"
                  "이번 회차 반영: 체크박스·목차 활성·출석 컨트롤(출석/불참 텍스트) 재설계, 헤더 새 모임 버튼을 오른쪽 그룹 맨 앞으로, 표지 미리보기 복구, 일정 안내 간소화, '휴지통' 용어, 코드에 없는 기능 제거. 폰트는 Pretendard Variable 서브셋을 직접 심었어요. 데이터는 전부 가상."})
    notes.append({"id": "host-desktop-proposals", "page": "host-desktop", "x": 1560, "y": -170, "w": 1440, "text":
                  "코드 근거가 있는 것만 그렸어요. 예외로 '제안' 배지가 붙은 것: 오늘 시작 전 체크리스트(①), 할 일 통합 rail, 상태 문장, 멤버 페이지의 초대 링크 보조 액션, 어드민 클럽 상세의 '이 클럽으로 이동'. 공동 호스트·변경 이력·운영 종료·질문 마감·온라인 링크 불러오기·표지 미리보기·휴지통은 모두 현재 코드에 있는 기능이에요."})
    notes.append({"id": "host-mobile-intro", "page": "host-mobile", "x": 0, "y": -150, "w": 1400, "text":
                  "호스트 · 모바일 24장. 첫 줄은 여정 순서, 둘째·셋째 줄은 목록·상세·설정 각 절·계정 시트. 하단 4탭 오늘 · 모임 · 멤버 · 기록. 오늘은 할 일이 준비 현황보다 먼저(엄지 거리). 당일 출석은 출석/불참 텍스트 컨트롤 + 되돌리기, 하단 고정 '모임 마치기'. 새 모임·일정 안내는 탭바 없는 작업 화면이고 하단 고정 버튼. 설정은 목록 한 장에서 각 절로 들어가요."})
    notes.append({"id": "admin-desktop-intro", "page": "admin-desktop", "x": 0, "y": -150, "w": 1440, "text":
                  "어드민 · 데스크톱 13장. ① 상태 확인 → ② 할 일 → ③ 조치(알림 전달) → ④ 클럽 목록 → ⑤ 새 클럽 → ⑥ 상세 → ⑦ 지원 접근 → ⑧ 서비스 → ⑨ AI 처리 → ⑩ 기록 → ⑪ 분석 → ⑫ 긴급 회수 → ⑬ 계정 메뉴(내 클럽으로).\n"
                  "메뉴 오늘 · 클럽 · 서비스 · 기록 + 긴급 공개 회수. 서비스 안 하위 탭(전체 · 알림 전달 · AI 처리), 클럽 안(전체 · 확인 필요 · 운영 중 · 지원 접근), 기록 안(처리 기록 · 분석). 선택 행은 좌우 12px 여백을 가진 둥근 배경. 체크박스는 18px 잉크블루 + 체크."})
    notes.append({"id": "admin-mobile-intro", "page": "admin-mobile", "x": 0, "y": -150, "w": 1000, "text":
                  "어드민 · 모바일 10장. 하단 4탭 오늘 · 클럽 · 서비스 · 기록. 상태 확인·할 일 상세·클럽 상세·기록·분석까지 모바일에서 보고, 재발송·개설·지원 접근·긴급 회수 같은 조치는 데스크톱으로 안내. 계정 시트에 내 클럽으로·긴급 공개 회수."})
    return {"pages": pages, "artboards": boards, "annotations": notes, "launch": {"view": "canvas", "page": "host-desktop"}}


def main() -> None:
    boards = render_all()
    face = font_face(list(boards.values()))
    for old in ROOT.glob("*.dc.html"):
        if old.name not in boards:
            old.unlink()
    for name, html in boards.items():
        (ROOT / name).write_text(html.replace("<style>", f"<style>{face}", 1) if face else html, encoding="utf-8")
    (ROOT / "canvas.json").write_text(json.dumps(canvas({}), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {len(boards)} artboards + canvas.json")


if __name__ == "__main__":
    main()
