"""Shared icons, tokens CSS and shell fragments for the quiet-desk artboards.

Token values are copied from design/system/src/styles/tokens.css (light paper theme).
Component rules mirror front/src/styles/globals.css and front/shared/styles/mobile.css
where a runtime rule exists; new grammar (할 일, 상태 문장, 섹션) is defined once here.
All data in artboards is fictional.
"""
from __future__ import annotations

PATHS = {
    "check-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8 12.5 11 15.5 16.5 9"],
    "alert-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7.5v5.5", "M12 16.5h.01"],
    "x-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M9 9l6 6M15 9l-6 6"],
    "question-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7", "M12 17h.01"],
    "info": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 11v6", "M12 7.5h.01"],
    "calendar": ["M4 5h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z", "M8 3v4M16 3v4M3 10h18"],
    "clock": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7.5V12l3 2"],
    "pin": ["M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z", "M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z"],
    "people": ["M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M3.5 20c.8-3.6 3-5.5 5.5-5.5s4.7 1.9 5.5 5.5", "M17 11.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8z", "M16 14.6c2.2.4 3.8 2.1 4.5 5.4"],
    "person": ["M12 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M5 20c1-4.2 3.5-6.5 7-6.5s6 2.3 7 6.5"],
    "person-plus": ["M10 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z", "M3 20c1-4.2 3.5-6.5 7-6.5 1.4 0 2.6.4 3.6 1", "M18 14v6M15 17h6"],
    "eye": ["M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z", "M12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"],
    "bell": ["M6 10a6 6 0 0 1 12 0c0 4 1.5 5 2 6H4c.5-1 2-2 2-6z", "M9.5 19a2.7 2.7 0 0 0 5 0"],
    "mail": ["M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "m3.5 7.5 8.5 6 8.5-6"],
    "link": ["M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2", "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2"],
    "document": ["M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z", "M14 2v4a2 2 0 0 0 2 2h4", "M8 13h8M8 17h6"],
    "notes": ["M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z", "M8 8h8M8 12h8M8 16h5"],
    "shield-check": ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z", "m9 12 2 2 4-4"],
    "search": ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z", "m20 20-3.5-3.5"],
    "history": ["M12 21a8 8 0 1 0-7.5-10.9", "M4 4v5h5", "M12 8v4.5l3 1.8"],
    "edit": ["M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3z", "m13.5 7.5 3 3"],
    "logout": ["M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10", "M10 12h9", "m16 8.5 3.5 3.5-3.5 3.5"],
    "home": ["M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-7H9v7H5a1 1 0 0 1-1-1z"],
    "more": ["M6 12h.01M12 12h.01M18 12h.01"],
    "chevron-right": ["m9 6 6 6-6 6"],
    "chevron-down": ["m6 9 6 6 6-6"],
    "arrow-left": ["M19 12H5", "m11 6-6 6 6 6"],
    "swap": ["M7 4v13", "m3.5 13.5 3.5 3.5 3.5-3.5", "M17 20V7", "m13.5 10.5 3.5-3.5 3.5 3.5"],
    "list": ["M8 6h13M8 12h13M8 18h13", "M4 6h.01M4 12h.01M4 18h.01"],
    "plus": ["M12 5v14", "M5 12h14"],
    "export": ["M12 15V4", "m7.5 8.5 4.5-4.5 4.5 4.5", "M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"],
    "upload": ["M12 16V5", "m7.5 9.5 4.5-4.5 4.5 4.5", "M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"],
    "gear": ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"],
    "copy": ["M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z", "M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"],
    "minus-circle": ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M8 12h8"],
    "grid": ["M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"],
    "check": ["m5 12 4.5 4.5L19 7"],
    "sparkle": ["M12 3v4M12 17v4M3 12h4M17 12h4", "M6.5 6.5l2 2M15.5 15.5l2 2M6.5 17.5l2-2M15.5 8.5l2-2"],
    "undo": ["M9 14 4 9l5-5", "M4 9h10a6 6 0 0 1 0 12h-3"],
    "download": ["M12 4v11", "m7.5 10.5 4.5 4.5 4.5-4.5", "M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"],
    "chart": ["M4 20h16", "M7 16v-5M12 16V6M17 16v-8"],
}


def icon(name: str, size: int = 20, cls: str = "", style: str = "", stroke: str = "1.75") -> str:
    paths = "".join(f'<path d="{d}"></path>' for d in PATHS[name])
    c = f' class="ico {cls}"' if cls else ' class="ico"'
    s = f' style="{style}"' if style else ""
    return (
        f'<svg{c}{s} width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" '
        f'stroke-width="{stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{paths}</svg>'
    )


def brand_mark() -> str:
    return (
        '<span class="brand-mark"><svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">'
        '<path d="M10 4 L3 5.5 L3 16.5 L10 15 Z" fill="var(--paper-50)"></path>'
        '<path d="M10 4 L17 5.5 L17 16.5 L10 15 Z" fill="var(--paper-50)" fill-opacity="0.42"></path></svg></span>'
    )


def avatar(file: str, size: int = 28) -> str:
    return f'<span class="avatar" style="--avatar-size: {size}px;"><img src="{file}" alt=""></span>'


def checkbox(on: bool = True, extra: str = "") -> str:
    return f'<span class="checkbox" data-on="{str(on).lower()}"{extra}>{icon("check", 13, stroke="3") if on else ""}</span>'


AV = ["cloud-green-book.webp", "star-notebook.webp", "banana-green-book.webp", "moon-green-book.webp",
      "toast-brown-book.webp", "envelope-notebook.webp", "dumpling-notebook.webp", "pudding-notebook.webp"]
ME = "candle-green-book.webp"
IMAGES = AV + [ME]

CSS = r"""
:root {
  --paper-50:  oklch(0.988 0.006 85); --paper-100: oklch(0.975 0.008 82); --paper-200: oklch(0.955 0.010 80); --paper-300: oklch(0.915 0.012 78);
  --ink-900: oklch(0.18 0.020 255); --ink-800: oklch(0.26 0.020 255); --ink-700: oklch(0.36 0.018 255); --ink-600: oklch(0.46 0.016 258);
  --ink-500: oklch(0.58 0.014 260); --ink-400: oklch(0.72 0.012 262); --ink-300: oklch(0.84 0.010 264); --ink-200: oklch(0.92 0.008 266);
  --accent: oklch(0.38 0.09 255); --accent-hover: oklch(0.32 0.10 255); --accent-soft: oklch(0.94 0.030 255); --accent-line: oklch(0.80 0.050 255);
  --warn: oklch(0.52 0.10 62); --warn-soft: oklch(0.95 0.035 70); --ok: oklch(0.48 0.08 155); --ok-soft: oklch(0.95 0.025 160);
  --danger: oklch(0.52 0.15 28); --danger-soft: oklch(0.96 0.030 28);
  --focus-ring: color-mix(in oklch, var(--accent), transparent 34%);
  --bg: var(--paper-50); --bg-sub: var(--paper-100); --bg-deep: var(--paper-200);
  --text: var(--ink-900); --text-2: var(--ink-700); --text-3: oklch(0.50 0.014 260); --text-4: oklch(0.55 0.012 262);
  --line: var(--ink-200); --line-soft: var(--paper-300); --line-strong: var(--ink-300);
  --f-sans: 'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
  --f-mono: 'JetBrains Mono', ui-monospace, Menlo, monospace;
  --type-size-h1: 36px; --type-size-h2: 28px; --type-size-h3: 20px; --type-size-h4: 17px;
  --type-size-body: 16px; --type-size-supporting: 14px; --type-size-label: 12px; --type-size-control: 14px;
  --r-1: 4px; --r-2: 6px; --r-3: 8px;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); font-family: var(--f-sans); font-size: 16px; line-height: 1.55; word-break: keep-all; overflow-wrap: break-word; -webkit-font-smoothing: antialiased; font-feature-settings: "ss01", "cv01"; }
a { color: var(--accent); text-decoration: none; } a:hover { color: var(--accent-hover); }
button { font: inherit; color: inherit; background: none; border: 0; cursor: pointer; padding: 0; }
img { max-width: 100%; display: block; }
p { margin: 0; }
.ico { flex-shrink: 0; }
.h1 { font-size: var(--type-size-h1); line-height: 1.15; letter-spacing: -0.02em; font-weight: 600; margin: 0; }
.h2 { font-size: var(--type-size-h2); line-height: 1.2; letter-spacing: -0.015em; font-weight: 600; margin: 0; }
.h3 { font-size: var(--type-size-h3); line-height: 1.3; letter-spacing: -0.01em; font-weight: 600; margin: 0; }
.h4 { font-size: var(--type-size-h4); line-height: 1.4; font-weight: 600; margin: 0; }
.small { font-size: var(--type-size-supporting); line-height: 1.5; color: var(--text-3); }
.tiny { font-size: var(--type-size-label); line-height: 1.4; color: var(--text-4); }
.mono { font-family: var(--f-mono); font-variant-numeric: tabular-nums; }
.muted { color: var(--text-3); }
.nowrap { white-space: nowrap; }

/* buttons / badges (tokens.css) */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 38px; padding: 0 16px; border-radius: var(--r-2); font-size: 14px; font-weight: 500; letter-spacing: -0.005em; border: 1px solid transparent; white-space: nowrap; flex-shrink: 0; color: var(--text); }
.btn-primary { background: var(--accent); color: var(--paper-50); border-color: var(--accent); }
.btn-secondary { background: var(--bg); color: var(--text-2); border-color: var(--line-strong); }
.btn-ghost { background: transparent; color: var(--text); border-color: var(--line); }
.btn-quiet { background: transparent; color: var(--text-2); padding: 0 10px; }
.btn-danger { background: var(--danger); color: var(--paper-50); border-color: var(--danger); }
.btn-lg { height: 46px; padding: 0 20px; font-size: 15px; }
.btn-sm { height: 30px; padding: 0 12px; font-size: 14px; }
.badge { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border-radius: 999px; font-size: var(--type-size-label); font-weight: 500; border: 1px solid var(--line); color: var(--text-2); background: var(--bg); white-space: nowrap; }
.badge-accent { color: var(--accent); border-color: var(--accent-line); background: var(--accent-soft); }
.badge-warn { color: var(--warn); border-color: color-mix(in oklch, var(--warn), transparent 70%); background: var(--warn-soft); }
.badge-ok { color: var(--ok); border-color: color-mix(in oklch, var(--ok), transparent 70%); background: var(--ok-soft); }
.badge-danger { color: var(--danger); border-color: color-mix(in oklch, var(--danger), transparent 70%); background: var(--danger-soft); }
.avatar { width: var(--avatar-size, 24px); height: var(--avatar-size, 24px); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.avatar img { width: 100%; height: 100%; object-fit: contain; }
.brand-mark { width: 32px; height: 32px; border-radius: 6px; background: var(--accent); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.checkbox { width: 20px; height: 20px; border-radius: 4px; border: 1.5px solid var(--ink-500); background: var(--bg); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--paper-50); }
.checkbox[data-on="true"] { background: var(--accent); border-color: var(--accent); }
.checkbox .ico, .cell-icon .checkbox .ico { color: var(--paper-50); }
.radio { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--r-2); }
.radio[data-on="true"] { border-color: var(--accent); background: var(--accent-soft); }
.radio .r { width: 18px; height: 18px; border-radius: 999px; border: 1.5px solid var(--line-strong); margin-top: 3px; flex-shrink: 0; background: var(--bg); }
.radio[data-on="true"] .r { border: 5px solid var(--accent); }

/* shared desktop shell */
.frame { width: 1440px; background: var(--bg); position: relative; }
.topnav { position: relative; background: var(--bg); border-bottom: 1px solid var(--line); }
.topnav[data-role="host"] { border-bottom: 2px solid var(--accent); }
.topnav-inner { display: flex; align-items: center; justify-content: space-between; gap: 24px; height: 64px; padding: 0 32px; }
.topnav-left { display: flex; align-items: center; gap: 18px; min-width: 0; }
.brand { display: inline-flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
.club-name { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px; border-radius: var(--r-2); font-size: 15px; font-weight: 600; color: var(--text); }
.club-name[data-open="true"] { background: var(--bg-sub); }
.club-name .ico { color: var(--text-3); }
.nav-links { display: flex; align-items: center; gap: 4px; }
.nav-link { position: relative; padding: 8px 14px; font-size: 14px; color: var(--text-2); border-radius: var(--r-2); white-space: nowrap; }
.nav-link[aria-current="page"] { color: var(--text); font-weight: 500; }
.nav-link[aria-current="page"]::after { content: ""; position: absolute; left: 14px; right: 14px; bottom: -13px; height: 2px; background: var(--accent); }
.topnav[data-role="host"] .nav-link[aria-current="page"]::after { bottom: -14px; }
.topnav-right { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
.topnav-right .btn-primary { margin-right: 10px; }
.seg { display: inline-flex; height: 36px; border: 1px solid var(--line-strong); border-radius: var(--r-2); overflow: hidden; }
.seg > span { display: inline-flex; align-items: center; gap: 6px; padding: 0 14px; font-size: 14px; font-weight: 500; color: var(--text-2); background: var(--bg); }
.seg > span[data-on="true"] { background: var(--accent); color: var(--paper-50); font-weight: 600; }
.util-link { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 10px; border-radius: var(--r-2); font-size: 14px; color: var(--text-2); }
.util-link[aria-current="page"] { color: var(--text); background: var(--bg-sub); }
.icon-btn { position: relative; width: 40px; height: 40px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--r-3); color: var(--text-2); }
.icon-btn .dot { position: absolute; top: 9px; right: 10px; width: 6px; height: 6px; border-radius: 999px; background: var(--accent); margin: 0; }
.account { display: inline-flex; align-items: center; gap: 7px; height: 44px; padding: 0 8px; border-radius: var(--r-3); }
.account[data-open="true"] { background: var(--bg-sub); }
.menu { position: absolute; width: 300px; padding: 6px; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r-3); box-shadow: 0 2px 12px -4px oklch(0 0 0 / 0.06), 0 12px 32px -12px oklch(0 0 0 / 0.14); z-index: 5; }
.menu-label { padding: 8px 10px 4px; font-size: 12px; color: var(--text-3); font-weight: 600; letter-spacing: 0.02em; }
.menu-item { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 10px; border-radius: var(--r-2); color: var(--text); font-size: 15px; }
.menu-item[aria-current="true"] { background: var(--bg-sub); }
.menu-item .name { font-size: 15px; font-weight: 600; }
.menu-item .meta { font-size: 12px; color: var(--text-3); }
.menu-item .ico.end { margin-left: auto; color: var(--text-3); }
.menu-item .ico.lead { color: var(--text-3); }
.menu-sep { height: 1px; background: var(--line-soft); margin: 6px 4px; }

/* page grammar */
.page { max-width: 1472px; margin: 0 auto; padding: 0 32px; }
.page-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; padding: 28px 0 20px; }
.kicker { font-size: 14px; color: var(--text-3); }
.status-line { font-size: 16px; color: var(--text-2); }
.actions { display: flex; align-items: center; gap: 8px; }
.text-link { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 14px; font-weight: 500; white-space: nowrap; }
.text-link.quiet { color: var(--text-3); font-weight: 400; }
.section-title { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin: 0 0 12px; }
.tabs { display: flex; align-items: center; gap: 4px; border-bottom: 1px solid var(--line); }
.tab { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 14px; font-size: 15px; color: var(--text-2); white-space: nowrap; }
.tab .mono { font-size: 13px; color: var(--text-3); }
.tab[aria-selected="true"] { color: var(--text); font-weight: 600; }
.tab[aria-selected="true"] .mono { color: var(--accent); }
.tab[aria-selected="true"]::after { content: ""; position: absolute; left: 14px; right: 14px; bottom: -1px; height: 2px; background: var(--accent); }
.back-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; height: 48px; border-bottom: 1px solid var(--line-soft); font-size: 14px; }
.back-bar .back { display: inline-flex; align-items: center; gap: 4px; color: var(--text-2); font-weight: 500; }
.back-bar .ctx { display: inline-flex; align-items: center; gap: 8px; color: var(--text-3); }
.back-bar .ctx b { color: var(--text); font-weight: 600; }
.two-col { display: grid; grid-template-columns: 62fr 38fr; }
.two-col > .main { padding-right: 32px; min-width: 0; }
.two-col > .rail { padding-left: 32px; border-left: 1px solid var(--line); min-width: 0; }
table.ledger { width: calc(100% + 24px); margin: 0 -12px; border-collapse: collapse; }
table.ledger th { text-align: left; font-size: 14px; font-weight: 500; color: var(--text-3); padding: 0 12px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
table.ledger td { height: 56px; padding: 0 12px; border-bottom: 1px solid var(--line-soft); font-size: 15px; vertical-align: middle; }
table.ledger th:last-child, table.ledger td:last-child { text-align: right; }
table.ledger tr[aria-selected="true"] td { background: var(--accent-soft); }
table.ledger tr[aria-selected="true"] td:first-child { border-radius: var(--r-2) 0 0 var(--r-2); }
table.ledger tr[aria-selected="true"] td:last-child { border-radius: 0 var(--r-2) var(--r-2) 0; }
.cell-icon { display: inline-flex; align-items: center; gap: 10px; }
.cell-icon .ico { color: var(--text-3); }
.val { font-weight: 600; font-variant-numeric: tabular-nums; }
.tone-ok { color: var(--ok); } .tone-warn { color: var(--warn); } .tone-danger { color: var(--danger); } .tone-accent { color: var(--accent); }
.detail { color: var(--text-2); }
.detail .sep, .sep { color: var(--text-4); padding: 0 6px; }
.dot { display: inline-block; width: 8px; height: 8px; border-radius: 999px; background: var(--text-4); margin-right: 8px; vertical-align: 1px; flex-shrink: 0; }
.dot.ok { background: var(--ok); } .dot.warn { background: var(--warn); } .dot.accent { background: var(--accent); } .dot.danger { background: var(--danger); }
.circ { width: 32px; height: 32px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.info-line { display: flex; align-items: flex-start; gap: 6px; font-size: 14px; color: var(--text-3); }
.info-line .ico { margin-top: 2px; }
.banner { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border: 1px solid color-mix(in oklch, var(--warn), transparent 70%); background: var(--warn-soft); border-radius: var(--r-2); }
.banner .t { font-weight: 600; }
.banner .d { font-size: 14px; color: var(--text-2); }
.kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); column-gap: 24px; row-gap: 10px; font-size: 15px; }
.kv .k { color: var(--text-3); }
.card { border: 1px solid var(--line); border-radius: var(--r-3); padding: 20px; }
.stat { display: grid; gap: 4px; }
.stat .k { font-size: 13px; color: var(--text-3); display: inline-flex; align-items: center; gap: 6px; }
.stat .v { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; line-height: 1.2; }

/* meeting header + state sentence */
.meeting-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; padding: 28px 0 20px; }
.cover { width: 84px; height: 84px; border-radius: var(--r-2); background: linear-gradient(160deg, oklch(0.62 0.10 150), oklch(0.44 0.08 200)); flex-shrink: 0; }
.cover.alt { background: linear-gradient(160deg, oklch(0.70 0.08 60), oklch(0.50 0.10 30)); }
.cover.past { background: linear-gradient(160deg, oklch(0.55 0.06 260), oklch(0.35 0.06 280)); }
.state { display: flex; align-items: center; gap: 8px; font-size: 16px; color: var(--text-2); }
.state b { color: var(--text); font-weight: 600; }
.state .dot { margin: 0; }
.facts { display: inline-flex; align-items: center; gap: 10px; height: 34px; margin-left: -10px; padding: 0 10px; border-radius: var(--r-2); color: var(--text-2); font-size: 15px; }
.facts .ico { color: var(--text-3); }
.facts .edit { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 14px; margin-left: 4px; }

/* 할 일 rail */
.todo-first { padding: 16px 0 18px; border-bottom: 1px solid var(--line); }
.todo-first .t { font-size: 19px; line-height: 1.3; font-weight: 600; letter-spacing: -0.01em; margin-bottom: 6px; }
.todo-first .why { font-size: 14px; color: var(--text-2); margin-bottom: 14px; }
.todo-first .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.todo-row { display: flex; align-items: center; gap: 14px; height: 60px; border-bottom: 1px solid var(--line-soft); color: var(--text); }
.todo-row .t { flex: 1; font-size: 15px; font-weight: 500; min-width: 0; }
.todo-row .m { font-size: 14px; color: var(--text-3); white-space: nowrap; }
.todo-row .chev { color: var(--text-4); }
.rail-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 14px; font-size: 14px; color: var(--text-3); }

/* sections */
.sec { border-bottom: 1px solid var(--line); padding: 20px 0; }
.sec-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.sec-head .n { width: 24px; height: 24px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; background: var(--bg-deep); color: var(--text-3); }
.sec[data-state="current"] .sec-head .n { background: var(--accent); color: var(--paper-50); }
.sec[data-state="done"] .sec-head .n { background: var(--ok-soft); color: var(--ok); }
.sec-head .ttl { display: inline-flex; align-items: center; gap: 10px; }
.sec-head .sum { font-size: 14px; color: var(--text-3); display: inline-flex; align-items: center; gap: 8px; }
.sec[data-state="current"] .sec-head .ttl h3 { font-size: 20px; }
.sec[data-state="todo"] .sec-head .ttl h3, .sec[data-state="done"] .sec-head .ttl h3 { font-size: 16px; color: var(--text-2); }

/* checklist */
.check { display: flex; align-items: center; gap: 16px; min-height: 72px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); }
.check .n { width: 28px; height: 28px; border-radius: 999px; border: 1.5px solid var(--line-strong); display: inline-flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; color: var(--text-3); flex-shrink: 0; }
.check[data-state="done"] .n { background: var(--ok); border-color: var(--ok); color: var(--paper-50); }
.check[data-state="current"] .n { border-color: var(--accent); color: var(--accent); }
.check .txt { flex: 1; min-width: 0; }
.check .txt .a { font-size: 16px; font-weight: 600; }
.check[data-state="done"] .txt .a { color: var(--text-3); font-weight: 500; }
.check .txt .b { font-size: 14px; color: var(--text-3); }

/* forms */
.field { display: grid; gap: 6px; margin-bottom: 18px; align-content: start; }
.field label { font-size: 14px; font-weight: 600; color: var(--text-2); }
.field .hint { font-size: 13px; color: var(--text-3); }
.input { min-height: 44px; padding: 0 12px; border: 1px solid var(--line-strong); border-radius: var(--r-2); background: var(--bg); font-size: 15px; display: flex; align-items: center; gap: 8px; color: var(--text); }
.input.ph { color: var(--text-4); }
.input.area { align-items: flex-start; padding: 10px 12px; display: block; line-height: 1.55; }
.form-sec { padding: 24px 0; border-bottom: 1px solid var(--line); }
.form-sec h2 { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
.side-index { display: grid; gap: 0; align-content: start; align-self: start; }
.side-index a { display: flex; align-items: center; gap: 10px; height: 40px; padding: 0 12px; border-left: 2px solid transparent; font-size: 14px; color: var(--text-2); }
.side-index a[aria-current="true"] { color: var(--text); font-weight: 600; border-left-color: var(--accent); }
.side-index .n { width: 20px; height: 20px; border-radius: 999px; background: var(--bg-deep); font-size: 11px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-3); }
.side-index a[aria-current="true"] .n { background: var(--accent); color: var(--paper-50); }
.summary-card { position: sticky; top: 24px; align-self: start; border: 1px solid var(--line); border-radius: var(--r-3); padding: 20px; }
.summary-card .row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
.summary-card .row .k { color: var(--text-3); }

/* attendance (text pills, explicit unknown) */
.att { display: flex; align-items: center; gap: 12px; min-height: 60px; border-bottom: 1px solid var(--line-soft); }
.att .nm { font-size: 15px; font-weight: 500; }
.att .rsvp { font-size: 12px; color: var(--text-3); }
.pill-seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--r-2); overflow: hidden; flex-shrink: 0; }
.pill-seg span { display: inline-flex; align-items: center; justify-content: center; gap: 4px; width: 64px; height: 36px; padding: 0; font-size: 14px; font-weight: 500; color: var(--text-3); border-right: 1px solid var(--line); background: var(--bg); }
.pill-seg span:last-child { border-right: 0; }
.pill-seg span[data-on="yes"] { background: var(--ok-soft); color: var(--ok); font-weight: 600; }
.pill-seg span[data-on="no"] { background: var(--danger-soft); color: var(--danger); font-weight: 600; }

/* mobile shell */
.m-root { position: relative; width: 390px; height: 844px; overflow: hidden; background: var(--bg); }
.m-hdr { height: 52px; padding: 0 14px; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 10px; border-bottom: 1px solid var(--line-soft); background: var(--bg); }
.m-hdr[data-role="host"] { border-bottom: 2px solid var(--accent); }
.m-hdr[data-back="true"] { grid-template-columns: auto minmax(0, 1fr) auto; }
.m-hdr-kicker { font-size: 12px; line-height: 1.1; color: var(--text-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-hdr-title { font-size: 15px; font-weight: 600; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.m-hdr-right { display: flex; align-items: center; gap: 2px; }
.m-icon { position: relative; width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; color: var(--text-2); }
.m-icon .dot { position: absolute; top: 11px; right: 12px; width: 6px; height: 6px; border-radius: 999px; background: var(--accent); margin: 0; }
.m-back { display: inline-flex; align-items: center; gap: 2px; min-height: 44px; padding-right: 6px; font-size: 14px; font-weight: 600; color: var(--text); }
.m-body { padding: 0 18px 84px; }
.m-tabbar { position: absolute; left: 0; right: 0; bottom: 0; min-height: 64px; padding: 6px 8px 8px; background: color-mix(in oklch, var(--bg-sub) 88%, transparent); border-top: 1px solid var(--line); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
.m-tab { position: relative; min-height: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text-4); border-radius: var(--r-3); padding: 5px 4px 4px; }
.m-tab[aria-current="page"] { color: var(--text); background: color-mix(in oklch, var(--bg-sub), var(--bg) 42%); }
.m-tab[aria-current="page"]::before { content: ""; position: absolute; top: 4px; left: 50%; width: 4px; height: 4px; transform: translateX(-50%); background: var(--accent); border-radius: 999px; }
.m-tab-label { font-size: 12px; line-height: 1.1; font-weight: 600; }
.m-row { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 12px 0; border-bottom: 1px solid var(--line-soft); color: var(--text); }
.m-row .ico.lead { color: var(--text-3); }
.m-row .txt { flex: 1; min-width: 0; display: grid; gap: 3px; }
.m-row .txt .a { font-size: 15px; font-weight: 500; }
.m-row .txt .b { font-size: 13px; color: var(--text-3); }
.m-row .v { font-size: 15px; font-weight: 600; font-variant-numeric: tabular-nums; white-space: nowrap; }
.m-row .chev { color: var(--text-4); }
.m-title { padding: 18px 0 12px; }
.m-title h1 { font-size: 24px; line-height: 1.2; letter-spacing: -0.015em; font-weight: 600; margin: 2px 0 6px; }
.m-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--line); margin: 0 -18px; padding: 0 10px; overflow: hidden; }
.m-tabs .tab { height: 42px; padding: 0 10px; font-size: 14px; }
.m-tabs + div, .m-tabs + [data-spec] { margin-top: 6px; }
.m-sticky-cta { position: absolute; left: 0; right: 0; bottom: 64px; padding: 10px 18px 12px; background: color-mix(in oklch, var(--bg) 92%, transparent); border-top: 1px solid var(--line-soft); }

/* admin shell */
.adm { display: grid; grid-template-columns: 208px minmax(0, 1fr); grid-template-rows: 72px minmax(0, 1fr); width: 1440px; min-height: 100vh; background: var(--bg); }
.adm-side { grid-row: 1 / span 2; border-right: 1px solid var(--line); background: var(--bg-sub); display: flex; flex-direction: column; padding: 16px 12px; }
.adm-brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 20px; }
.adm-brand .w { font-size: 17px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
.adm-brand .k { font-size: 12px; color: var(--text-3); }
.adm-group { padding: 6px 8px 6px; font-size: 12px; color: var(--text-3); font-weight: 600; letter-spacing: 0.02em; }
.adm-nav { display: flex; align-items: center; gap: 10px; height: 44px; padding: 0 12px; border-left: 2px solid transparent; font-size: 15px; color: var(--text-2); }
.adm-nav .ico { color: var(--text-3); }
.adm-nav[aria-current="page"] { color: var(--text); font-weight: 600; border-left-color: var(--accent); }
.adm-nav[aria-current="page"] .ico { color: var(--accent); }
.adm-nav .cnt { margin-left: auto; font-family: var(--f-mono); font-size: 13px; color: var(--accent); }
.adm-side .spacer { flex: 1; }
.adm-nav.danger { color: var(--danger); } .adm-nav.danger .ico { color: var(--danger); }
.adm-top { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 0 32px; border-bottom: 1px solid var(--line); position: relative; }
.adm-status { display: inline-flex; align-items: center; gap: 10px; font-size: 16px; color: var(--text); }
.adm-status .ico { color: var(--ok); }
.adm-status[data-tone="warn"] .ico { color: var(--warn); }
.adm-main { padding: 0 40px 40px; max-width: 1240px; }
.adm-body { display: grid; grid-template-columns: minmax(340px, 38fr) minmax(560px, 62fr); min-height: 0; }
.queue { border-right: 1px solid var(--line); }
.queue-head { display: flex; align-items: center; justify-content: space-between; height: 72px; padding: 0 32px; border-bottom: 1px solid var(--line); }
.case { display: grid; grid-template-columns: 24px minmax(0, 1fr) auto; column-gap: 12px; row-gap: 4px; align-items: center; padding: 18px 32px; border-bottom: 1px solid var(--line-soft); color: var(--text); }
.case[aria-selected="true"] { background: var(--warn-soft); box-shadow: inset 4px 0 0 var(--warn); }
.case .ico { color: var(--warn); }
.case .t { font-size: 17px; font-weight: 600; color: var(--text); }
.case .when { font-size: 14px; color: var(--text-3); white-space: nowrap; }
.case .sub { grid-column: 2 / span 2; font-size: 15px; color: var(--text-2); }
.docket { padding: 24px 40px 32px; min-width: 0; }
.docket h2 { display: flex; align-items: center; gap: 12px; margin: 0 0 8px; }
.docket h2 .ico { color: var(--warn); }
.docket section { padding: 20px 0; border-bottom: 1px solid var(--line-soft); }
.docket h3 { font-size: 17px; font-weight: 600; margin: 0 0 6px; }
.docket p, .docket li { font-size: 16px; color: var(--text-2); }
.docket ul { margin: 0; padding-left: 20px; }
.exp-sum { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; padding: 16px 12px 20px 44px; background: var(--bg-sub); border-radius: 0 0 var(--r-2) var(--r-2); }
.exp-sum .k { font-size: 13px; color: var(--text-3); margin-bottom: 4px; }
.exp-sum .v { font-size: 15px; }
.step-bar { display: flex; align-items: center; gap: 0; padding: 20px 0; }
.step-bar .s { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-3); }
.step-bar .s .n { width: 24px; height: 24px; border-radius: 999px; border: 1.5px solid var(--line-strong); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; }
.step-bar .s[data-state="current"] { color: var(--text); font-weight: 600; }
.step-bar .s[data-state="current"] .n { background: var(--accent); border-color: var(--accent); color: var(--paper-50); }
.step-bar .s[data-state="done"] .n { background: var(--ok); border-color: var(--ok); color: var(--paper-50); }
.step-bar .ln { width: 40px; height: 1px; background: var(--line-strong); margin: 0 12px; }
"""


def wrap(body: str, font_face: str = "") -> str:
    html = f"""<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  <style>{font_face}{CSS}</style>
</helmet>
{body}
</x-dc>
</body>
</html>
"""
    return "\n".join(line.rstrip() for line in html.splitlines()) + "\n"


# ---------------------------------------------------------------- shell fragments
HOST_NAV = ["오늘", "모임", "멤버", "기록"]
MEMBER_NAV = ["오늘", "노트", "기록"]


def desktop_header(role: str, current: str, settings_current: bool = False, club_menu: bool = False,
                   multi_club: bool = False, account_open: bool = False, platform: bool = True) -> str:
    host = role == "host"
    nav = HOST_NAV if host else MEMBER_NAV
    links = "".join(
        f'<a class="nav-link" href="#"{" aria-current=\"page\"" if lbl == current else ""}>{lbl}</a>' for lbl in nav
    )
    club = f'<span class="club-name" data-open="{str(club_menu).lower()}">을지로 북살롱{icon("chevron-down", 16) if multi_club else ""}</span>'
    seg = (
        f'<span class="seg" data-spec="shell.perspective-toggle"><span data-on="{str(not host).lower()}">멤버</span>'
        f'<span data-on="{str(host).lower()}">호스트</span></span>'
    )
    util = f'<a class="util-link" href="#"{" aria-current=\"page\"" if settings_current else ""}>{icon("gear", 18)}설정</a>' if host else ""
    new_btn = f'<a class="btn btn-primary" href="#">{icon("plus", 16, stroke="2.2")}새 모임</a>' if host else ""
    menus = ""
    if club_menu:
        menus += f"""
  <div class="menu" style="top: 58px; left: 200px; width: 320px;" data-spec="shell.club-menu">
    <div class="menu-label">클럽</div>
    <div class="menu-item" aria-current="true">{avatar(AV[0], 28)}<div><div class="name">을지로 북살롱</div><div class="meta">멤버 · 호스트</div></div>{icon("check", 18, cls="end", stroke="2.2")}</div>
    <div class="menu-item">{avatar(AV[1], 28)}<div><div class="name">한강 야간 독서회</div><div class="meta">멤버</div></div>{icon("chevron-right", 18, cls="end")}</div>
  </div>"""
    if account_open:
        plat = f'<div class="menu-item">{icon("shield-check", 18, cls="lead")}플랫폼 운영{icon("chevron-right", 18, cls="end")}</div><div class="menu-sep"></div>' if platform else ""
        menus += f"""
  <div class="menu" style="top: 58px; right: {150 if host else 32}px; width: 280px;" data-spec="shell.account-menu">
    <div class="menu-item" style="min-height: 56px;">{avatar(ME, 36)}<div><div class="name">김하늘</div><div class="meta">hanul@example.com</div></div></div>
    <div class="menu-sep"></div>
    <div class="menu-item">{icon("person", 18, cls="lead")}내 프로필</div>
    <div class="menu-item">{icon("bell", 18, cls="lead")}알림 설정</div>
    <div class="menu-sep"></div>
    {plat}
    <div class="menu-item">{icon("logout", 18, cls="lead")}로그아웃</div>
  </div>"""
    return f"""
<header class="topnav" data-role="{role}" data-spec="shell.header">
  <div class="topnav-inner">
    <div class="topnav-left">
      <span class="brand">{brand_mark()}ReadMates</span>
      {club}
      <nav class="nav-links" data-spec="shell.primary-nav">{links}</nav>
    </div>
    <div class="topnav-right">
      {new_btn}{seg}{util}
      <span class="icon-btn">{icon("bell", 20)}<span class="dot"></span></span>
      <span class="account" data-open="{str(account_open).lower()}">{avatar(ME, 28)}<span style="font-size: 14px; font-weight: 600;">하늘</span>{icon("chevron-down", 14, style="color: var(--text-3);")}</span>
    </div>
  </div>{menus}
</header>"""


def mobile_header(kicker: str, title: str, back: str | None = None, right: bool = True) -> str:
    b = f'<span class="m-back">{icon("arrow-left", 20)}{back}</span>' if back else ""
    r = (
        f'<div class="m-hdr-right"><span class="m-icon" data-spec="shell.perspective-toggle">{icon("swap", 22)}</span>'
        f'<span class="m-icon">{icon("bell", 22)}<span class="dot"></span></span><span class="m-icon">{avatar(ME, 28)}</span></div>'
        if right else '<div class="m-hdr-right"></div>'
    )
    return f"""
<header class="m-hdr" data-role="host" data-back="{str(bool(back)).lower()}" data-spec="shell.mobile-header">
  {b}<div style="min-width: 0;"><div class="m-hdr-kicker">{kicker}</div><div class="m-hdr-title">{title}</div></div>
  {r}
</header>"""


def mobile_tabbar(current: str) -> str:
    items = [("오늘", "home"), ("모임", "calendar"), ("멤버", "people"), ("기록", "notes")]
    tabs = "".join(
        f'<a class="m-tab" href="#"{" aria-current=\"page\"" if lbl == current else ""}>{icon(ic, 24, stroke="1.6")}<span class="m-tab-label">{lbl}</span></a>'
        for lbl, ic in items
    )
    return f'<nav class="m-tabbar" data-spec="shell.mobile-tabbar">{tabs}</nav>'


def admin_mobile_tabbar(current: str) -> str:
    items = [("오늘", "check-circle"), ("클럽", "people"), ("서비스", "shield-check"), ("기록", "document")]
    tabs = "".join(
        f'<a class="m-tab" href="#"{" aria-current=\"page\"" if lbl == current else ""}>{icon(ic, 24, stroke="1.6")}<span class="m-tab-label">{lbl}</span></a>'
        for lbl, ic in items
    )
    return f'<nav class="m-tabbar" data-spec="admin.shell.mobile-tabbar">{tabs}</nav>'


def page_header(kicker: str, title: str, status: str, actions: str = "", spec: str = "") -> str:
    return f"""
    <div class="page-header" data-spec="{spec}">
      <div style="min-width: 0;">
        <div class="kicker">{kicker}</div>
        <h1 class="h2" style="margin: 4px 0 8px;">{title}</h1>
        <p class="status-line">{status}</p>
      </div>
      <div class="actions">{actions}</div>
    </div>"""


def back_bar(back: str, ctx: str = "", right: str = "") -> str:
    return f"""
    <div class="back-bar" data-spec="shell.back-bar">
      <span class="back">{icon("arrow-left", 18)}{back}</span>
      <span class="ctx">{ctx}</span>
      <span class="small">{right}</span>
    </div>"""


def meeting_ctx(book: str = "지구 끝의 온실", when: str = "9월 1일 (월) 오후 7:30") -> str:
    return f'{icon("notes", 16)}<b>{book}</b><span>·</span>{when}'


def todo_rail(first: tuple[str, str, str, str], rows: list[tuple[str, str, str, str, str]], count: int = 4, hold: int = 1, foot: str = "") -> str:
    t, why, primary, secondary = first
    rws = "".join(
        f'<a class="todo-row" href="#"><span class="circ" style="background: {bg}; color: {fg};">{icon(ic, 18)}</span>'
        f'<span class="t">{tt}</span><span class="m">{m}</span>{icon("chevron-right", 18, cls="chev")}</a>'
        for ic, fg, bg, tt, m in rows
    )
    sec = f'<a class="btn btn-quiet" href="#">{icon("clock", 16)}{secondary}</a>' if secondary else ""
    return f"""
      <aside data-spec="host.today.todo">
        <div class="section-title"><h3 class="h3">할 일 <span class="mono" style="color: var(--accent); font-size: 17px;">{count}</span></h3><span class="small">보류 {hold}</span></div>
        <div class="todo-first">
          <div class="t">{t}</div>
          <p class="why">{why}</p>
          <div class="row"><a class="btn btn-primary" href="#">{primary}</a>{sec}</div>
        </div>
        {rws}
        <div class="rail-foot"><span style="display: inline-flex; align-items: center; gap: 6px;">{icon("history", 16)}{foot or "어제 19:30 자동 리마인드 전달됨"}</span><a class="text-link quiet" href="#">완료한 일{icon("chevron-right", 16)}</a></div>
      </aside>"""


TODO_ROWS_PREP = [
    ("person-plus", "var(--ok)", "var(--ok-soft)", "가입 승인 검토", "2명 · 오늘"),
    ("document", "var(--accent)", "var(--accent-soft)", "지난 모임 기록 작성", "No.27 · 이번 주"),
    ("link", "var(--danger)", "var(--danger-soft)", "초대 링크 만료 확인", "2일 남음"),
]


def prep_rows() -> str:
    rows = [
        ("calendar", "현재 일정 확인", "8 / 12", "tone-warn", "변경 전 확인 1<span class='sep'>·</span>아직 안 봄 3", "멤버 보기"),
        ("people", "참석 응답", "9 / 12", "tone-ok", "참석 7<span class='sep'>·</span>불참 2<span class='sep'>·</span>미응답 3", "응답 보기"),
        ("notes", "발제 질문", "6개", "", "2명은 아직 작성 전<span class='sep'>·</span>마감 8월 30일", "질문 보기"),
        ("pin", "장소", "확인됨", "tone-ok", "을지로 북살롱 예약 확인", "정보 보기"),
    ]
    return "".join(
        f'<tr><td><span class="cell-icon">{icon(ic, 20)}{item}</span></td><td><span class="val {tone}">{val}</span></td>'
        f'<td class="detail">{detail}</td><td><a class="text-link" href="#">{act}{icon("chevron-right", 16)}</a></td></tr>'
        for ic, item, val, tone, detail, act in rows
    )


def meeting_head(state_html: str, badge: str = "D-3", badge_cls: str = "badge-accent", right: str = "",
                 kicker: str = "이번 모임 · No.28 · 9월 정기 모임", title: str = "지구 끝의 온실", cover_cls: str = "",
                 facts: str = "") -> str:
    right = right or f'<a class="text-link quiet" href="#">{icon("history", 16)}변경 이력</a><a class="btn btn-ghost" href="#">{icon("info", 18)}모임 정보</a>'
    facts = facts or (f'{icon("calendar", 18)}9월 1일 (월)<span class="sep">·</span>{icon("clock", 18)}오후 7:30<span class="sep">·</span>{icon("pin", 18)}을지로 북살롱'
                      f'<span class="edit">{icon("edit", 16)}일정 편집</span>')
    return f"""
    <div class="meeting-head" data-spec="host.today.meeting-header">
      <div style="display: flex; gap: 20px; align-items: flex-start; min-width: 0;">
        <div class="cover {cover_cls}"></div>
        <div style="min-width: 0;">
          <div class="kicker">{kicker}</div>
          <div style="display: flex; align-items: center; gap: 12px; margin: 2px 0 4px;"><h1 class="h2">{title}</h1><span class="badge {badge_cls}">{badge}</span></div>
          <div class="state" data-spec="host.today.state">{state_html}</div>
          <a class="facts" href="#" data-spec="host.today.schedule-facts" style="margin-top: 4px;">{facts}</a>
        </div>
      </div>
      <div class="actions" style="padding-top: 6px;">{right}</div>
    </div>"""


def att_row(av: str, name: str, rsvp: str, on: str, compact: bool = False) -> str:
    return (
        f'<div class="att">{avatar(av, 30)}<div style="flex: 1; min-width: 0;"><div class="nm">{name}</div><div class="rsvp">응답 {rsvp}</div></div>'
        f'<span class="pill-seg" data-spec="host.live.attendance-control"><span data-on="{"yes" if on == "yes" else ""}">출석</span>'
        f'<span data-on="{"no" if on == "no" else ""}">불참</span></span></div>'
    )


ADMIN_NAV = [("오늘", "check-circle"), ("클럽", "people"), ("서비스", "shield-check"), ("기록", "document")]


def admin_shell(current: str, status_html: str, body: str, count: int = 3, tone: str = "ok", account_open: bool = False) -> str:
    nav = "".join(
        f'<a class="adm-nav" href="#"{" aria-current=\"page\"" if lbl == current else ""}>{icon(ic, 20)}{lbl}{f"<span class=\"cnt\">{count}</span>" if lbl == "오늘" and count else ""}</a>'
        for lbl, ic in ADMIN_NAV
    )
    menu = ""
    if account_open:
        menu = f"""
    <div class="menu" style="top: 64px; right: 32px; width: 280px;" data-spec="admin.shell.account-menu">
      <div class="menu-item" style="min-height: 56px;">{avatar(ME, 36)}<div><div class="name">김은영</div><div class="meta">플랫폼 운영자</div></div></div>
      <div class="menu-sep"></div>
      <div class="menu-item">{icon("swap", 18, cls="lead")}<div><div class="name" style="font-weight: 500;">내 클럽으로</div><div class="meta">을지로 북살롱 · 멤버 시야로 복귀</div></div>{icon("chevron-right", 18, cls="end")}</div>
      <div class="menu-sep"></div>
      <div class="menu-item" style="color: var(--danger);">{icon("alert-circle", 18, cls="lead", style="color: var(--danger);")}긴급 공개 회수</div>
      <div class="menu-item">{icon("logout", 18, cls="lead")}로그아웃</div>
    </div>"""
    return f"""
<div class="adm" data-spec="admin.shell">
  <aside class="adm-side" data-spec="admin.shell.sidebar">
    <div class="adm-brand">{brand_mark()}<div><div class="w">ReadMates</div><div class="k">플랫폼 운영</div></div></div>
    <div class="adm-group">운영</div>
    {nav}
    <div class="spacer"></div>
    <a class="adm-nav danger" href="#">{icon("alert-circle", 20)}긴급 공개 회수</a>
  </aside>
  <header class="adm-top" data-spec="admin.shell.topbar">
    <a class="adm-status" href="#" data-tone="{tone}">{icon("check-circle" if tone == "ok" else "alert-circle", 20)}{status_html}{icon("chevron-right", 16, style="color: var(--text-4);")}</a>
    <span class="account" data-open="{str(account_open).lower()}">{avatar(ME, 28)}<span style="font-size: 14px; font-weight: 600;">은영</span>{icon("chevron-down", 14, style="color: var(--text-3);")}</span>{menu}
  </header>
  {body}
</div>"""


def admin_tabs(items: list[tuple[str, str, bool]]) -> str:
    return '<div class="tabs" style="margin-bottom: 16px;" data-spec="admin.subtabs">' + "".join(
        f'<span class="tab"{" aria-selected=\"true\"" if on else ""}>{lbl}{f" <span class=\"mono\">{c}</span>" if c else ""}</span>' for lbl, c, on in items
    ) + "</div>"


def admin_mobile_header(title: str, back: str | None = None, count: int = 3) -> str:
    b = f'<span class="m-back">{icon("arrow-left", 20)}{back}</span>' if back else ""
    return f"""
<header class="m-hdr" data-back="{str(bool(back)).lower()}" data-spec="admin.shell.mobile-header">
  {b}<div style="min-width: 0;"><div class="m-hdr-kicker">플랫폼 운영</div><div class="m-hdr-title">{title}</div></div>
  <div class="m-hdr-right"><span class="m-icon">{avatar(ME, 28)}</span></div>
</header>"""
