"""Admin desktop (A01..A13) and admin mobile (AM1..AM4) artboards."""
from lib import (AV, ME, admin_mobile_header, admin_mobile_tabbar, admin_shell, admin_tabs, avatar, back_bar,
                 checkbox, icon, page_header, wrap)

OK_STATUS = "서비스는 정상이며, 확인할 일이 3건 있습니다"
WARN_STATUS = "알림 전달이 지연되고 있습니다 · 확인할 일 3건"


def recent_rows() -> str:
    return f"""<tbody>
          <tr><td class="detail">어제 18:20</td><td><b>은영</b>이 알림 전달 실패 6건을 다시 보냄</td><td class="tone-ok">완료</td></tr>
          <tr><td class="detail">어제 11:05</td><td><b>은영</b>이 새 클럽 <b>한강 야간 독서회</b>를 개설하고 호스트를 초대함</td><td class="tone-ok">초대 수락됨</td></tr>
          <tr><td class="detail">9월 3일</td><td>자동 · 공개 기록 3건 캐시 반영</td><td class="tone-ok">완료</td></tr>
        </tbody>"""


def a01_today_quiet() -> str:
    body = f"""
  <div class="adm-main" data-spec="admin.today.quiet">
    {page_header("오늘", "확인할 일이 없어요", "마지막 확인 <b>09:40</b> · 서비스 정상 · 클럽 14곳 운영 중", f'<a class="btn btn-ghost" href="#">{icon("history", 18)}다시 확인</a>', "admin.today.header")}
    <div class="two-col">
      <div class="main">
        <div class="section-title"><h3 class="h3">최근 처리</h3><a class="text-link quiet" href="#">기록 전체{icon("chevron-right", 16)}</a></div>
        <table class="ledger"><thead><tr><th style="width: 16%;">시각</th><th>내용</th><th style="width: 16%;">결과</th></tr></thead>{recent_rows()}</table>
      </div>
      <aside class="rail">
        <div class="section-title"><h3 class="h3">바로 가기</h3></div>
        <a class="todo-row" href="#"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">{icon("shield-check", 18)}</span><span class="t">서비스 상태</span><span class="m">모두 정상</span>{icon("chevron-right", 18, cls="chev")}</a>
        <a class="todo-row" href="#"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">{icon("people", 18)}</span><span class="t">클럽</span><span class="m">14곳 · 설정 필요 1</span>{icon("chevron-right", 18, cls="chev")}</a>
        <a class="todo-row" href="#"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">{icon("plus", 18)}</span><span class="t">새 클럽 개설</span>{icon("chevron-right", 18, cls="chev")}</a>
      </aside>
    </div>
  </div>"""
    return wrap(admin_shell("오늘", "서비스는 정상이며, 확인할 일이 없습니다", body, 0))


def a02_today(account_open: bool = False) -> str:
    body = f"""
  <div class="adm-body" data-spec="admin.today">
    <section class="queue" data-spec="admin.today.queue">
      <div class="queue-head"><h1 class="h3" style="font-size: 22px;">오늘 <span class="mono" style="color: var(--accent); font-size: 18px;">3</span></h1><span class="text-link quiet">최신순{icon("chevron-down", 16)}</span></div>
      <a class="case" href="#" aria-selected="true">{icon("alert-circle", 22)}<span class="t">알림 전달 지연</span><span class="when">10분 전</span><span class="sub">클럽 2곳 · 멤버 6명</span></a>
      <a class="case" href="#">{icon("alert-circle", 22)}<span class="t">공개 기록 확인</span><span class="when">35분 전</span><span class="sub">새로 생성된 공개 기록 1건</span></a>
      <a class="case" href="#">{icon("alert-circle", 22)}<span class="t">AI 요약 결과 확인</span><span class="when">1시간 전</span><span class="sub">요약 결과 3건</span></a>
      <div style="padding: 18px 32px; display: flex; justify-content: space-between; align-items: center;"><span class="small">마지막 확인 09:40</span><a class="text-link quiet" href="#">보류·처리한 일 보기{icon("chevron-right", 16)}</a></div>
    </section>
    <article class="docket" data-spec="admin.today.docket">
      <h2 class="h2" style="font-size: 26px;">{icon("alert-circle", 26)}알림 전달 지연</h2>
      <p class="small">10분 전 감지 · 알림 전달 서비스</p>
      <section><h3>무슨 일이 있었나요?</h3><p>일부 안내가 늦게 전달되고 있습니다.</p></section>
      <section><h3>영향 범위</h3><p>클럽 2곳 · 멤버 6명 — <a href="#">을지로 북살롱</a>, <a href="#">한강 야간 독서회</a></p></section>
      <section><h3>확인된 내용</h3><ul><li>데이터 손실 없음</li><li>마지막 정상 전달 13:52</li><li>자동 재시도 예정 14:20</li></ul></section>
      <section><h3>권장 처리</h3><p>중복 발송을 확인한 뒤 실패한 안내만 다시 보냅니다.</p></section>
      <section style="border-bottom: 0;" data-spec="admin.today.actions">
        <h3>처리 방법</h3>
        <div style="display: flex; align-items: center; gap: 12px; margin-top: 10px; flex-wrap: wrap;">
          <a class="btn btn-primary btn-lg" href="#">서비스 › 알림 전달에서 다시 보내기{icon("chevron-right", 16)}</a>
          <a class="btn btn-secondary btn-lg" href="#">{icon("clock", 18)}30분 뒤 다시 보기</a>
          <a class="btn btn-quiet btn-lg" href="#">확인함</a>
        </div>
      </section>
      <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid var(--line-soft);"><a class="text-link quiet" href="#">기술 정보 펼치기{icon("chevron-down", 16)}</a><a class="text-link quiet" href="#">{icon("history", 16)}이 서비스의 최근 처리 기록</a></div>
    </article>
  </div>"""
    return wrap(admin_shell("오늘", OK_STATUS, body, account_open=account_open))


def a13_account_menu() -> str:
    return a02_today(account_open=True)


def a03_notifications() -> str:
    clusters = [("을지로 북살롱 · 일정 변경 안내", "6건 실패", "13:58 ~ 14:05", "메일 발송 제한", True), ("한강 야간 독서회 · 새 모임 알림", "2건 지연", "14:01", "중계 지연", False)]
    c = "".join(
        f'<tr aria-selected="{str(on).lower()}"><td><span class="cell-icon">{checkbox(on)}<b>{n}</b></span></td><td class="tone-warn" style="font-weight: 500;">{f}</td><td class="detail nowrap">{w}</td><td class="detail">{r}</td><td><a class="text-link quiet" href="#">받는 사람{icon("chevron-right", 16)}</a></td></tr>'
        for n, f, w, r, on in clusters
    )
    body = f"""
  <div class="adm-main" data-spec="admin.service.notifications">
    {back_bar("오늘 · 알림 전달 지연")}
    {page_header("서비스", "서비스 상태", "알림 전달에 <b class='tone-warn'>지연 1건</b>. 나머지 서비스는 정상.", f'<span class="small">마지막 전체 확인 09:40</span><a class="btn btn-ghost" href="#">{icon("history", 18)}새로고침</a>', "admin.service.header")}
    {admin_tabs([("전체", "", False), ("알림 전달", "1", True), ("AI 처리", "", False)])}
    <div class="two-col">
      <div class="main">
        <div class="section-title"><h3 class="h3">실패 묶음</h3><span class="small">자동 재시도 14:20 예정 · 수동 재발송은 자동 재시도를 취소하지 않아요</span></div>
        <table class="ledger"><thead><tr><th style="width: 38%;">묶음</th><th>결과</th><th>시각</th><th>원인</th><th style="width: 14%;"></th></tr></thead><tbody>{c}</tbody></table>
        <div class="section-title" style="margin-top: 32px;"><h3 class="h3">전달 현황</h3></div>
        <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;">
          <div class="stat"><span class="k">발송 대기</span><span class="v">3</span></div><div class="stat"><span class="k">발송 실패</span><span class="v tone-warn">6</span></div>
          <div class="stat"><span class="k">배달 대기</span><span class="v">0</span></div><div class="stat"><span class="k">중계 지연</span><span class="v tone-warn">2</span></div>
        </div>
      </div>
      <aside class="rail" data-spec="admin.service.replay">
        <div class="section-title"><h3 class="h3">다시 보내기</h3></div>
        <p class="status-line" style="margin-bottom: 14px;">선택한 <b>1묶음 · 6건</b>을 다시 보내요. 이미 전달된 안내는 건너뛰어요.</p>
        <div class="field"><label>사유</label><div class="input">메일 발송 제한 해제 후 재발송</div></div>
        <a class="btn btn-primary btn-lg" href="#" style="width: 100%;">6건 다시 보내기</a>
        <p class="info-line" style="margin-top: 12px;">{icon("info", 16)}결과 영수증은 기록에 남고, 오늘의 이 항목은 자동으로 닫혀요.</p>
        <div class="rail-foot">{icon("history", 14)} 어제 18:20 6건 재발송 · 완료</div>
      </aside>
    </div>
  </div>"""
    return wrap(admin_shell("서비스", WARN_STATUS, body, 3, "warn"))


def a09_clubs() -> str:
    rows = [("을지로 북살롱", "운영 중", "ok", "12", "28", "26", "김하늘", "오늘"), ("한강 야간 독서회", "운영 중", "ok", "9", "6", "5", "이서준", "어제"), ("성수 목요 독서회", "설정 필요", "warn", "0", "0", "0", "김서연 (초대됨)", "—"), ("망원 시 읽기", "운영 중", "ok", "7", "14", "14", "박지안", "3일 전"), ("연남 에세이 클럽", "중지", "", "11", "19", "17", "최다은", "6월 2일")]
    r = "".join(f'<tr{" aria-selected=\"true\"" if i == 2 else ""}><td><b>{n}</b></td><td><span class="dot {t}"></span><span class="{"tone-" + t if t else "muted"}" style="font-weight: 500;">{s}</span></td><td class="detail">{m}</td><td class="detail">{mt}</td><td class="detail">{rc}</td><td class="detail">{h}</td><td class="detail">{last}</td><td><a class="text-link quiet" href="#">열기{icon("chevron-right", 16)}</a></td></tr>' for i, (n, s, t, m, mt, rc, h, last) in enumerate(rows))
    body = f"""
  <div class="adm-main" data-spec="admin.clubs">
    {page_header("클럽", "클럽 14곳", "운영 중 <b>12</b> · 설정 필요 <b class='tone-warn'>1</b> · 중지 1", f'<a class="btn btn-primary" href="#">{icon("plus", 16, stroke="2.2")}새 클럽</a>', "admin.clubs.header")}
    {admin_tabs([("전체", "14", True), ("확인 필요", "1", False), ("운영 중", "12", False), ("지원 접근", "", False)])}
    <div style="display: flex; gap: 8px; margin-bottom: 12px;"><div class="input ph" style="flex: 1; max-width: 420px; min-height: 40px;">{icon("search", 16)}클럽 이름 찾기</div></div>
    <table class="ledger" data-spec="admin.clubs.ledger"><thead><tr><th style="width: 24%;">클럽</th><th>상태</th><th>멤버</th><th>모임</th><th>공개 기록</th><th>호스트</th><th>최근 활동</th><th style="width: 9%;"></th></tr></thead><tbody>{r}</tbody></table>
    <div class="rail-foot" style="justify-content: flex-start; gap: 24px;">14곳<span>{icon("info", 14)} 클럽 안의 독서 내용은 여기서 보지 않아요. slug·ID는 상세의 기술 정보에 있어요.</span></div>
  </div>"""
    return wrap(admin_shell("클럽", OK_STATUS, body))


def a04_new_club() -> str:
    body = f"""
  <div class="adm-main" data-spec="admin.clubs.new">
    {back_bar("클럽")}
    {page_header("클럽", "새 클럽 개설", "클럽 이름과 첫 호스트만 정하면 돼요. 호스트가 초대를 수락하면 클럽이 활성화돼요.", "", "admin.clubs.new.header")}
    <div class="step-bar" data-spec="admin.clubs.new.steps"><span class="s" data-state="current"><span class="n">1</span>클럽</span><span class="ln"></span><span class="s"><span class="n">2</span>첫 호스트</span><span class="ln"></span><span class="s"><span class="n">3</span>초대 보내기</span></div>
    <div style="display: grid; grid-template-columns: minmax(0, 640px) 320px; gap: 48px;">
      <div>
        <section class="form-sec" style="padding-top: 0;">
          <h2>1 · 클럽</h2>
          <div class="field"><label>클럽 이름</label><div class="input">성수 목요 독서회</div></div>
          <div class="field"><label>주소 (slug)</label><div class="input mono" style="font-size: 14px;">seongsu-thursday</div><div class="hint">readmates.app/clubs/<b>seongsu-thursday</b> · 영문 소문자·숫자·하이픈</div></div>
          <div class="field"><label>한 줄 소개 <span class="muted" style="font-weight: 400;">선택</span></label><div class="input ph">호스트가 나중에 바꿀 수 있어요</div></div>
        </section>
        <section class="form-sec">
          <h2>2 · 첫 호스트</h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            <div class="field"><label>이메일</label><div class="input">host@example.com</div></div>
            <div class="field"><label>이름</label><div class="input">김서연</div></div>
          </div>
          <p class="info-line">{icon("info", 16)}초대 메일에는 클럽 이름과 로그인 링크만 들어가요. 초대는 7일 뒤 만료돼요.</p>
        </section>
      </div>
      <aside class="summary-card">
        <h3 class="h4" style="margin-bottom: 12px;">3 · 초대 보내기</h3>
        <div style="display: grid; gap: 10px;">
          <div class="row"><span class="k">클럽</span><b>성수 목요 독서회</b></div>
          <div class="row"><span class="k">주소</span><b class="mono" style="font-size: 13px;">seongsu-thursday</b></div>
          <div class="row"><span class="k">호스트</span><b>김서연</b></div>
          <div class="row"><span class="k">상태</span><b class="tone-warn">설정 필요 · 초대 대기</b></div>
        </div>
        <a class="btn btn-primary btn-lg" href="#" style="width: 100%; margin-top: 20px;">개설하고 초대 보내기</a>
        <p class="info-line" style="margin-top: 12px;">{icon("info", 16)}저장 후 클럽 상세로 이동하고, 기록에 남아요. 작성 중 닫으면 내용이 사라져요.</p>
      </aside>
    </div>
  </div>"""
    return wrap(admin_shell("클럽", OK_STATUS, body))


def a05_club_detail() -> str:
    body = f"""
  <div class="adm-main" data-spec="admin.clubs.detail">
    {back_bar("클럽", "", "클럽 14곳 중 · 설정 필요 1")}
    {page_header("클럽 · 상세", "성수 목요 독서회", '<span class="dot warn"></span><b class="tone-warn">설정 필요</b> · 첫 호스트 초대 대기 (2일 전 발송) · 멤버 0명', f'<a class="btn btn-ghost" href="#">{icon("mail", 18)}초대 다시 보내기</a><a class="btn btn-ghost" href="#">{icon("eye", 18)}공개 페이지</a>', "admin.clubs.detail.header")}
    <div class="two-col">
      <div class="main">
        <section class="sec" style="padding-top: 0;"><div class="section-title"><h3 class="h3">기본 정보</h3><a class="text-link quiet" href="#">기술 정보{icon("chevron-down", 16)}</a></div>
          <div class="kv"><span class="k">주소</span><span>readmates.app/clubs/seongsu-thursday</span><span class="k">호스트</span><span>김서연 <span class="badge badge-warn" style="margin-left: 8px;">초대됨</span></span><span class="k">공개 설정</span><span>비공개 · 초대로만 가입</span><span class="k">도메인</span><span class="muted">준비 안 됨</span><span class="k">개설</span><span>9월 4일 · 은영</span></div></section>
        <section class="sec"><div class="section-title"><h3 class="h3">운영 상태</h3></div>
          <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px;">
            <div class="stat"><span class="k">{icon("people", 14)}멤버</span><span class="v">0</span></div><div class="stat"><span class="k">{icon("calendar", 14)}모임</span><span class="v">0</span></div>
            <div class="stat"><span class="k">{icon("document", 14)}공개 기록</span><span class="v">0</span></div><div class="stat"><span class="k">{icon("bell", 14)}알림 실패</span><span class="v">0</span></div>
          </div></section>
        <section class="sec" style="border-bottom: 0;"><div class="section-title"><h3 class="h3">이 클럽의 최근 처리 기록</h3><a class="text-link quiet" href="#">전체{icon("chevron-right", 16)}</a></div>
          <table class="ledger"><tbody><tr><td class="detail" style="width: 16%;">9월 4일 11:05</td><td><b>은영</b>이 클럽을 개설하고 호스트 초대를 보냄</td><td class="tone-ok" style="text-align: right;">완료</td></tr></tbody></table></section>
      </div>
      <aside class="rail" data-spec="admin.clubs.detail.actions">
        <div class="section-title"><h3 class="h3">행동</h3></div>
        <a class="todo-row" href="#"><span class="circ" style="background: var(--accent-soft); color: var(--accent);">{icon("swap", 18)}</span><span class="t">이 클럽으로 이동 <span class="badge" style="margin-left: 6px;">제안</span></span><span class="m">권한 없음 · 공개 페이지</span>{icon("chevron-right", 18, cls="chev")}</a>
        <a class="todo-row" href="#"><span class="circ" style="background: var(--warn-soft); color: var(--warn);">{icon("shield-check", 18)}</span><span class="t">지원 접근 발급</span><span class="m">사유 필요</span>{icon("chevron-right", 18, cls="chev")}</a>
        <a class="todo-row" href="#"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">{icon("gear", 18)}</span><span class="t">공개 설정 · 도메인</span>{icon("chevron-right", 18, cls="chev")}</a>
        <a class="todo-row" href="#" style="color: var(--danger);"><span class="circ" style="background: var(--danger-soft); color: var(--danger);">{icon("minus-circle", 18)}</span><span class="t">운영 중지</span><span class="m">확인 필요</span>{icon("chevron-right", 18, cls="chev")}</a>
        <p class="info-line" style="margin-top: 14px;">{icon("info", 16)}클럽 안의 독서 내용은 여기서 보지 않아요. 지원 접근도 사유와 기간이 기록돼요.</p>
      </aside>
    </div>
  </div>"""
    return wrap(admin_shell("클럽", OK_STATUS, body))


def a11_support_access() -> str:
    body = f"""
  <div class="adm-main" data-spec="admin.clubs.support">
    {back_bar("클럽 · 을지로 북살롱")}
    {page_header("클럽 · 지원 접근", "지원 접근 발급", "운영자가 <b>을지로 북살롱</b>의 운영 화면을 잠시 볼 수 있게 해요. 독서 내용이 아니라 운영 상태만 보여요.", "", "admin.support.header")}
    <div class="step-bar"><span class="s" data-state="current"><span class="n">1</span>사유와 기간</span><span class="ln"></span><span class="s"><span class="n">2</span>확인</span><span class="ln"></span><span class="s"><span class="n">3</span>영수증</span></div>
    <div style="display: grid; grid-template-columns: minmax(0, 640px) 360px; gap: 48px;">
      <section>
        <div class="field"><label>사유</label>
          <div style="display: grid; gap: 8px;">
            <div class="radio" data-on="true"><span class="r"></span><div><div style="font-weight: 600;">회원 지원</div><div class="small">호스트·멤버가 요청한 문제를 확인해요.</div></div></div>
            <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">사고 조사</div></div></div>
            <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">데이터 정정</div></div></div>
            <div class="radio"><span class="r"></span><div><div style="font-weight: 600;">보안 검토</div></div></div>
          </div></div>
        <div class="field"><label>기간</label><div style="display: flex; gap: 8px;"><span class="btn btn-ghost">1시간</span><span class="btn btn-primary">2시간</span><span class="btn btn-ghost">오늘까지</span></div></div>
        <div class="field"><label>메모 <span class="muted" style="font-weight: 400;">선택 · 최소한으로</span></label><div class="input">호스트 문의 #2026-0906-03 · 초대 링크 만료 오류 확인</div><div class="hint">개인 정보나 대화 내용은 적지 않아요. 메모는 기록에 남아요.</div></div>
      </section>
      <aside class="summary-card">
        <h3 class="h4" style="margin-bottom: 12px;">발급 내용</h3>
        <div style="display: grid; gap: 10px;"><div class="row"><span class="k">클럽</span><b>을지로 북살롱</b></div><div class="row"><span class="k">사유</span><b>회원 지원</b></div><div class="row"><span class="k">기간</span><b>2시간 · 13:40까지</b></div><div class="row"><span class="k">범위</span><b>운영 화면 읽기</b></div></div>
        <a class="btn btn-primary btn-lg" href="#" style="width: 100%; margin-top: 20px;">확인 화면으로</a>
        <p class="info-line" style="margin-top: 12px;">{icon("info", 16)}발급·만료·회수는 모두 기록과 영수증에 남고, 호스트에게 알림이 가요.</p>
      </aside>
    </div>
  </div>"""
    return wrap(admin_shell("클럽", OK_STATUS, body))


def a06_service() -> str:
    rows = [("웹 · API", "정상", "ok", "09:40", "—", ""), ("데이터베이스", "정상", "ok", "09:40", "—", ""), ("알림 전달", "지연", "warn", "09:40", "클럽 2곳 · 6명", "다시 보내기"), ("AI 처리", "정상", "ok", "09:38", "—", ""), ("공개 사이트 캐시", "정상", "ok", "09:35", "—", "")]
    r = ""
    for n, s, t, w, imp, act in rows:
        r += (f'<tr{" aria-selected=\"true\"" if t == "warn" else ""}><td><span class="cell-icon">{icon("chevron-down" if t == "warn" else "chevron-right", 16)}<b>{n}</b></span></td>'
              f'<td><span class="dot {t}"></span><span class="tone-{t}" style="font-weight: 500;">{s}</span></td><td class="detail">{w}</td><td class="detail">{imp}</td>'
              f'<td>{f"<a class=\"text-link\" href=\"#\">{act}{icon("chevron-right", 16)}</a>" if act else "<span class=\"muted\">—</span>"}</td></tr>')
        if t == "warn":
            r += ('<tr><td colspan="5" style="padding: 0 12px 12px; height: auto; border-bottom: 1px solid var(--line-soft);"><div class="exp-sum"><div><div class="k">영향 범위</div><div class="v">을지로 북살롱, 한강 야간 독서회 · 멤버 6명</div></div>'
                  '<div><div class="k">최근 정상 전달</div><div class="v">13:52 · 자동 재시도 14:20</div></div><div><div class="k">복구 조치</div><div class="v">메일 발송 제한 해제 확인 후 실패 6건 재발송</div></div></div></td></tr>')
    body = f"""
  <div class="adm-main" data-spec="admin.service">
    {page_header("서비스", "서비스 상태", "5개 중 <b>4개 정상</b> · 알림 전달 <b class='tone-warn'>지연</b>", f'<span class="small">마지막 전체 확인 09:40</span><a class="btn btn-ghost" href="#">{icon("history", 18)}새로고침</a>', "admin.service.header")}
    {admin_tabs([("전체", "", True), ("알림 전달", "1", False), ("AI 처리", "", False)])}
    <table class="ledger" data-spec="admin.service.table"><thead><tr><th style="width: 28%;">서비스</th><th>상태</th><th>마지막 확인</th><th>영향</th><th style="width: 14%;">조치</th></tr></thead><tbody>{r}</tbody></table>
    <div class="rail-foot" style="justify-content: flex-start; gap: 24px;"><a class="text-link quiet" href="#">기술 정보 펼치기{icon("chevron-down", 16)}</a><span>{icon("history", 14)} 최근 배포 9월 3일 v2.6.0</span></div>
  </div>"""
    return wrap(admin_shell("서비스", WARN_STATUS, body, 3, "warn"))


def a10_ai_ops() -> str:
    runs = [("오늘 08:40", "No.28 소감 요약 · 을지로 북살롱", "완료", "ok", "3.2초"), ("오늘 08:12", "No.6 기록 초안 · 한강 야간 독서회", "완료", "ok", "5.1초"), ("어제 22:05", "No.14 소감 요약 · 망원 시 읽기", "실패 · 제공자 시간 초과", "warn", "—"), ("어제 21:50", "No.14 소감 요약 · 망원 시 읽기", "실패 · 제공자 시간 초과", "warn", "—")]
    r = "".join(f'<tr><td class="detail">{w}</td><td>{t}</td><td><span class="dot {tone}"></span><span class="tone-{tone}" style="font-weight: 500;">{s}</span></td><td class="detail">{d}</td><td><a class="text-link quiet" href="#">시도 보기{icon("chevron-right", 16)}</a></td></tr>' for w, t, s, tone, d in runs)
    body = f"""
  <div class="adm-main" data-spec="admin.service.ai">
    {page_header("서비스", "서비스 상태", "AI 처리 정상 · 어제 <b class='tone-warn'>실패 2건</b>은 같은 요청의 재시도", f'<span class="small">마지막 확인 09:38</span><a class="btn btn-ghost" href="#">{icon("history", 18)}새로고침</a>', "admin.service.header")}
    {admin_tabs([("전체", "", False), ("알림 전달", "1", False), ("AI 처리", "", True)])}
    <div class="two-col">
      <div class="main">
        <div class="section-title"><h3 class="h3">최근 실행</h3><span class="small">호스트가 요청한 요약·초안만. 결과 본문은 여기서 보지 않아요.</span></div>
        <table class="ledger"><thead><tr><th style="width: 14%;">시각</th><th>요청</th><th>결과</th><th>소요</th><th style="width: 12%;"></th></tr></thead><tbody>{r}</tbody></table>
      </div>
      <aside class="rail" data-spec="admin.service.ai-recovery">
        <div class="section-title"><h3 class="h3">복구</h3></div>
        <p class="status-line" style="margin-bottom: 14px;">실패한 요청 <b>1건</b>(망원 시 읽기 · No.14)을 다시 실행할 수 있어요. 호스트에게는 완료 알림만 가요.</p>
        <a class="btn btn-primary" href="#" style="width: 100%;">1건 다시 실행</a>
        <p class="info-line" style="margin-top: 12px;">{icon("info", 16)}같은 요청이 진행 중이면 중복 실행되지 않아요. 결과는 영수증으로 남아요.</p>
        <div class="rail-foot">{icon("history", 14)} 제공자 · 정상 · 평균 3.8초</div>
      </aside>
    </div>
  </div>"""
    return wrap(admin_shell("서비스", OK_STATUS, body))


def a07_records() -> str:
    rows = [("오늘 09:12", "은영", "알림 전달 실패 6건 다시 보냄", "완료", "ok", True), ("어제 11:05", "은영", "클럽 <b>성수 목요 독서회</b> 개설 · 호스트 초대", "초대 대기", "warn", False), ("9월 3일", "자동", "공개 기록 3건 캐시 반영", "완료", "ok", False), ("9월 2일", "은영", "<b>을지로 북살롱</b> 지원 접근 발급 · 회원 지원 · 2시간", "만료됨", "", False), ("9월 1일", "은영", "긴급 공개 회수 · 기록 1건", "완료", "ok", False)]
    r = "".join(f'<tr{" aria-selected=\"true\"" if sel else ""}><td class="detail">{w}</td><td class="detail">{who}</td><td>{what}</td><td><span class="dot {t}"></span><span class="{"tone-" + t if t else "muted"}" style="font-weight: 500;">{res}</span></td></tr>' for w, who, what, res, t, sel in rows)
    body = f"""
  <div class="adm-main" data-spec="admin.records">
    {page_header("기록", "처리 기록", "이번 주 <b>12건</b> · 실패 0", f'<a class="btn btn-ghost" href="#">{icon("download", 18)}CSV</a>', "admin.records.header")}
    {admin_tabs([("처리 기록", "", True), ("분석", "", False)])}
    <div class="two-col">
      <div class="main">
        <div style="display: flex; gap: 8px; margin-bottom: 12px;" data-spec="admin.records.filters">
          <div class="input ph" style="flex: 1; min-height: 40px;">{icon("search", 16)}누가 · 무엇을 · 대상 (본문만 검색)</div>
          <span class="btn btn-ghost" style="height: 40px;">{icon("calendar", 16)}이번 주{icon("chevron-down", 14)}</span>
          <span class="btn btn-ghost" style="height: 40px;">모든 종류{icon("chevron-down", 14)}</span>
        </div>
        <table class="ledger" data-spec="admin.records.ledger"><thead><tr><th style="width: 14%;">시각</th><th style="width: 10%;">누가</th><th>무엇을</th><th style="width: 14%;">결과</th></tr></thead><tbody>{r}</tbody></table>
        <div class="rail-foot" style="justify-content: flex-start;">12건 · 더 보기</div>
      </div>
      <aside class="rail" data-spec="admin.records.detail">
        <div class="kicker">오늘 09:12 · 알림 전달</div>
        <h3 class="h3" style="margin: 4px 0 16px;">실패 6건 다시 보냄</h3>
        <div class="kv"><span class="k">처리한 이유</span><span>메일 발송 제한 해제 후 재발송</span><span class="k">영향 범위</span><span>을지로 북살롱 · 일정 변경 안내 · 6명</span><span class="k">변경 전 → 후</span><span>실패 6 → 전달 6</span><span class="k">결과</span><span class="tone-ok" style="font-weight: 500;">완료 · 영수증 저장됨</span></div>
        <div class="rail-foot"><a class="text-link quiet" href="#">기술 정보 펼치기{icon("chevron-down", 16)}</a><a class="text-link quiet" href="#">영수증{icon("chevron-right", 16)}</a></div>
      </aside>
    </div>
  </div>"""
    return wrap(admin_shell("기록", OK_STATUS, body))


def a12_analytics() -> str:
    kpis = [("활성 클럽", "12", "지난달 11", "이번 달 모임이 1회 이상 있는 클럽"), ("이번 달 모임", "23", "지난달 21", "공개된 모임 수"), ("참석 응답률", "84%", "지난달 81%", "응답 / 참여자 snapshot"), ("게시된 기록", "9", "지난달 8", "멤버 게시 기준")]
    k = "".join(f'<div class="card"><div class="small" style="margin-bottom: 6px;">{n}</div><div class="val" style="font-size: 28px; line-height: 1.1;">{v}</div><div class="tiny" style="margin: 6px 0 8px;">{d}</div><div class="small" style="border-top: 1px solid var(--line-soft); padding-top: 8px;">{how}</div></div>' for n, v, d, how in kpis)
    body = f"""
  <div class="adm-main" data-spec="admin.records.analytics">
    {page_header("기록", "처리 기록", "분석 부록 · 정의와 가용성을 먼저 보고 값을 읽어요", f'<a class="btn btn-ghost" href="#">{icon("download", 18)}CSV</a>', "admin.records.header")}
    {admin_tabs([("처리 기록", "", False), ("분석", "", True)])}
    <div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 28px;" data-spec="admin.analytics.kpis">{k}</div>
    <div class="section-title"><h3 class="h3">가용성</h3><span class="small">서버가 계산한 값만 보여요. 계산되지 않은 지표는 '—'</span></div>
    <table class="ledger"><thead><tr><th style="width: 24%;">지표</th><th>정의</th><th style="width: 16%;">가용성</th><th style="width: 12%;">값</th></tr></thead><tbody>
      <tr><td><b>알림 전달 성공률</b></td><td class="detail">7일 · 전달 / 발송</td><td><span class="dot ok"></span>계산됨</td><td class="val">98.7%</td></tr>
      <tr><td><b>기록 게시 소요</b></td><td class="detail">모임일 → 멤버 게시 중앙값</td><td><span class="dot ok"></span>계산됨</td><td class="val">6일</td></tr>
      <tr><td><b>재방문 멤버</b></td><td class="detail">30일 내 2회 이상 접속</td><td><span class="dot"></span><span class="muted">아직 계산 안 함</span></td><td class="muted">—</td></tr>
    </tbody></table>
  </div>"""
    return wrap(admin_shell("기록", OK_STATUS, body))


def a08_takedown() -> str:
    body = f"""
  <div class="adm-main" data-spec="admin.takedown">
    {back_bar("오늘")}
    {page_header("긴급 공개 회수", "공개 기록을 즉시 내려요", '공개 사이트에서 기록 <b>1편</b>을 바로 내려요. 이미 저장해 둔 사람에게서는 지울 수 없어요.', "", "admin.takedown.header")}
    <div class="step-bar" data-spec="admin.takedown.steps"><span class="s" data-state="done"><span class="n">{icon("check", 12, stroke="2.6")}</span>대상 찾기</span><span class="ln"></span><span class="s" data-state="current"><span class="n">2</span>내용 확인</span><span class="ln"></span><span class="s"><span class="n">3</span>내리기</span></div>
    <div class="two-col">
      <div class="main">
        <div class="banner" style="border-color: color-mix(in oklch, var(--danger), transparent 70%); background: var(--danger-soft); margin-bottom: 20px;">{icon("alert-circle", 22, style="color: var(--danger);")}<div><div class="t">내린 기록은 호스트가 다시 올릴 수 없어요</div><div class="d">운영자가 이 화면에서 풀어 줄 때까지 공개 사이트에서 막혀 있어요. 멤버 화면에서는 그대로 보여요.</div></div></div>
        <div data-spec="admin.takedown.target" style="border: 1px solid var(--line); border-radius: var(--r-3); overflow: hidden;">
          <div style="display: flex; gap: 16px; align-items: center; padding: 18px 20px; border-bottom: 1px solid var(--line-soft);">
            <div class="cover past" style="width: 56px; height: 72px; border-radius: 4px;"></div>
            <div style="min-width: 0; flex: 1;"><div class="kicker">내릴 기록 · 을지로 북살롱 · No.26</div><div class="h4" style="font-size: 18px; margin-top: 2px;">우리가 빛의 속도로 갈 수 없다면</div><div class="small">7월 12일 멤버 게시 · 7월 14일 공개 사이트 게시</div></div>
            <span class="badge badge-danger">신고 #2026-0906-01</span>
          </div>
          <div class="todo-row" style="padding: 0 20px; height: auto; min-height: 56px; align-items: flex-start; padding-top: 12px; padding-bottom: 12px;"><span class="circ" style="background: var(--bg-deep); color: var(--text-3);">{icon("eye", 18)}</span><div style="flex: 1;"><div class="t">지금 공개 사이트에서 보이는 곳 3</div><div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px;"><span class="badge">/clubs/euljiro/records/26</span><span class="badge">클럽 기록 목록</span><span class="badge">전체 기록 목록</span></div></div></div>
          <div class="todo-row" style="padding: 0 20px; height: auto; min-height: 56px; align-items: flex-start; padding-top: 12px; padding-bottom: 12px;"><span class="circ" style="background: var(--danger-soft); color: var(--danger);">{icon("minus-circle", 18)}</span><div style="flex: 1;"><div class="t">내리면 이렇게 돼요</div><div class="small" style="margin-top: 2px;">공개 페이지가 바로 사라지고, 사이트에 남은 복사본도 지워 달라고 요청해요. 호스트에게 알림이 가요. 멤버 화면의 기록은 그대로 남아요.</div></div></div>
          <div class="todo-row" style="padding: 0 20px; height: auto; min-height: 56px; align-items: flex-start; padding-top: 12px; padding-bottom: 12px; border-bottom: 0;"><span class="circ" style="background: var(--warn-soft); color: var(--warn);">{icon("alert-circle", 18)}</span><div style="flex: 1;"><div class="t">왜 내리나요</div><div class="small" style="margin-top: 2px;">개인정보 노출 신고가 들어왔어요. 신고 내용은 기록에 남기지 않고 신고 번호만 남아요.</div></div></div>
        </div>
      </div>
      <aside class="rail" data-spec="admin.takedown.confirm">
        <div class="section-title"><h3 class="h3">정말 내릴까요?</h3></div>
        <div class="field"><label>이유 <span class="muted" style="font-weight: 400;">기록에 남아요</span></label><div class="input area" style="min-height: 90px;">개인정보 노출 신고 접수. 호스트 확인 전 선제 회수.</div></div>
        <label style="display: flex; align-items: flex-start; gap: 8px; font-size: 14px; margin-bottom: 20px;">{checkbox(True, ' style="margin-top: 2px;"')}누군가 이미 저장하거나 화면에 띄워 둔 글은 되돌릴 수 없다는 걸 알고 있어요.</label>
        <a class="btn btn-danger btn-lg" href="#" style="width: 100%;">지금 내리기</a>
        <a class="btn btn-quiet" href="#" style="width: 100%; margin-top: 8px;">취소하고 오늘로</a>
        <p class="info-line" style="margin-top: 14px;">{icon("info", 16)}처리 내용은 기록 페이지에 남아요. 사이트에서 완전히 사라지는 데 몇 분 걸릴 수 있고, 진행 상태는 서비스 페이지에서 볼 수 있어요.</p>
      </aside>
    </div>
  </div>"""
    return wrap(admin_shell("오늘", OK_STATUS, body))


# ---------------------------------------------------------------- admin mobile
def am(inner: str, tab: str) -> str:
    return wrap(f'<div class="m-root">{inner}{admin_mobile_tabbar(tab)}</div>')


def am1_today() -> str:
    cases = [("알림 전달 지연", "클럽 2곳 · 멤버 6명", "10분 전"), ("공개 기록 확인", "새로 생성된 공개 기록 1건", "35분 전"), ("AI 요약 결과 확인", "요약 결과 3건", "1시간 전")]
    c = "".join(f'<a class="m-row" href="#">{icon("alert-circle", 22, style="color: var(--warn);")}<div class="txt"><div class="a" style="font-weight: 600;">{t}</div><div class="b">{s}</div></div><span class="tiny">{w}</span>{icon("chevron-right", 18, cls="chev")}</a>' for t, s, w in cases)
    return am(f"""
  {admin_mobile_header("오늘")}
  <div class="m-body">
    <a href="#" class="banner" style="margin-top: 14px; padding: 10px 12px; border-color: var(--ok-soft); background: var(--ok-soft); color: var(--text);">{icon("check-circle", 18, style="color: var(--ok);")}<span style="font-size: 14px; flex: 1;">서비스 정상 · 확인할 일 3건</span>{icon("chevron-right", 16, style="color: var(--text-4);")}</a>
    <div class="m-title"><div class="kicker">오늘</div><h1>확인할 일 <span class="mono" style="color: var(--accent);">3</span></h1></div>
    <div data-spec="admin.today.queue">{c}</div>
    <div style="display: flex; justify-content: space-between; padding: 14px 0;"><span class="tiny">마지막 확인 09:40</span><a class="text-link quiet" href="#">보류·처리한 일{icon("chevron-right", 14)}</a></div>
  </div>""", "오늘")


def am2_detail() -> str:
    return am(f"""
  {admin_mobile_header("알림 전달 지연", back="오늘")}
  <div class="m-body" style="padding-bottom: 160px;">
    <div class="m-title"><div class="kicker">10분 전 감지 · 알림 전달</div><h1 style="display: flex; align-items: center; gap: 8px;">{icon("alert-circle", 22, style="color: var(--warn);")}알림 전달 지연</h1><p class="small">클럽 2곳 · 멤버 6명 · 자동 재시도 14:20</p></div>
    <div data-spec="admin.today.docket" style="display: grid; gap: 10px;">
      <div class="card" style="padding: 14px 16px; border-left: 3px solid var(--warn); background: var(--warn-soft); border-color: color-mix(in oklch, var(--warn), transparent 70%);"><div class="tiny" style="color: var(--warn); font-weight: 600;">무슨 일이 있었나요?</div><p style="margin-top: 2px;">일부 안내가 늦게 전달되고 있어요.</p></div>
      <div class="card" style="padding: 14px 16px;"><div class="tiny" style="margin-bottom: 6px;">영향 범위</div><div style="display: flex; gap: 6px; flex-wrap: wrap;"><span class="badge badge-accent">을지로 북살롱 · 4명</span><span class="badge badge-accent">한강 야간 독서회 · 2명</span></div></div>
      <div class="card" style="padding: 6px 16px;"><div class="tiny" style="padding: 8px 0 4px;">확인된 내용</div>
        <div class="m-row" style="min-height: 40px; padding: 6px 0;"><span class="circ" style="width: 22px; height: 22px; background: var(--ok-soft); color: var(--ok);">{icon("check", 12, stroke="2.6")}</span><div class="txt"><div class="a" style="font-size: 14px; font-weight: 400;">데이터 손실 없음</div></div></div>
        <div class="m-row" style="min-height: 40px; padding: 6px 0;"><span class="circ" style="width: 22px; height: 22px; background: var(--ok-soft); color: var(--ok);">{icon("check", 12, stroke="2.6")}</span><div class="txt"><div class="a" style="font-size: 14px; font-weight: 400;">마지막 정상 전달 13:52</div></div></div>
        <div class="m-row" style="min-height: 40px; padding: 6px 0; border-bottom: 0;"><span class="circ" style="width: 22px; height: 22px; background: var(--bg-deep); color: var(--text-3);">{icon("clock", 12)}</span><div class="txt"><div class="a" style="font-size: 14px; font-weight: 400;">자동 재시도 14:20 예정</div></div></div>
      </div>
      <div class="card" style="padding: 14px 16px;"><div class="tiny" style="margin-bottom: 2px;">권장 처리</div><p style="font-size: 15px;">중복 발송을 확인한 뒤 실패한 안내만 다시 보내요.</p></div>
    </div>
    <a class="text-link quiet" href="#" style="margin-top: 14px;">기술 정보 펼치기{icon("chevron-down", 14)}</a>
  </div>
  <div class="m-sticky-cta"><a class="btn btn-primary" href="#" style="width: 100%; height: 46px;">서비스 › 알림 전달에서 다시 보내기</a><div style="display: flex; gap: 8px; margin-top: 8px;"><a class="btn btn-secondary" href="#" style="flex: 1; height: 40px;">{icon("clock", 14)}30분 뒤</a><a class="btn btn-quiet" href="#" style="flex: 1; height: 40px;">확인함</a></div></div>""", "오늘")


def am3_clubs() -> str:
    rows = [("을지로 북살롱", "운영 중 · 멤버 12 · 모임 28", "ok"), ("한강 야간 독서회", "운영 중 · 멤버 9 · 모임 6", "ok"), ("성수 목요 독서회", "설정 필요 · 호스트 초대 대기", "warn"), ("망원 시 읽기", "운영 중 · 멤버 7 · 모임 14", "ok"), ("연남 에세이 클럽", "중지 · 6월 2일", "")]
    r = "".join(f'<a class="m-row" href="#"><span class="dot {t}" style="margin: 0;"></span><div class="txt"><div class="a">{n}</div><div class="b">{s}</div></div>{icon("chevron-right", 18, cls="chev")}</a>' for n, s, t in rows)
    return am(f"""
  {admin_mobile_header("클럽")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">클럽</div><h1>클럽 14곳</h1><p class="small">운영 중 12 · 설정 필요 <b class="tone-warn">1</b> · 중지 1</p></div>
    <div class="m-tabs"><span class="tab" aria-selected="true">전체 <span class="mono">14</span></span><span class="tab">확인 필요 <span class="mono">1</span></span><span class="tab">운영 중</span></div>
    <div data-spec="admin.clubs.ledger">{r}</div>
    <p class="info-line" style="margin-top: 14px;">{icon("info", 16)}새 클럽 개설과 지원 접근 발급은 데스크톱에서 해요.</p>
  </div>""", "클럽")


def am4_service() -> str:
    rows = [("웹 · API", "정상", "ok"), ("데이터베이스", "정상", "ok"), ("알림 전달", "지연 · 클럽 2곳 6명", "warn"), ("AI 처리", "정상", "ok"), ("공개 사이트 캐시", "정상", "ok")]
    r = "".join(f'<a class="m-row" href="#"><span class="dot {t}" style="margin: 0;"></span><div class="txt"><div class="a">{n}</div><div class="b tone-{t}">{s}</div></div>{icon("chevron-right", 18, cls="chev")}</a>' for n, s, t in rows)
    return am(f"""
  {admin_mobile_header("서비스")}
  <div class="m-body">
    <div class="m-title"><div class="kicker">서비스</div><h1>서비스 상태</h1><p class="small">5개 중 4개 정상 · 알림 전달 <b class="tone-warn">지연</b> · 09:40 확인</p></div>
    <div class="m-tabs"><span class="tab" aria-selected="true">전체</span><span class="tab">알림 전달 <span class="mono">1</span></span><span class="tab">AI 처리</span></div>
    <div data-spec="admin.service.table">{r}</div>
    <p class="info-line" style="margin-top: 14px;">{icon("info", 16)}재발송·재실행 같은 조치는 데스크톱에서 해요. 여기서는 상태 확인만.</p>
  </div>""", "서비스")


ARTBOARDS = [
    ("A01-TodayQuiet", "① 오늘 · 확인할 일 없음", a01_today_quiet, 900),
    ("A02-Today", "② 오늘 · 할 일 3건 + 상세", a02_today, 960),
    ("A03-Notifications", "③ 서비스 › 알림 전달 (조치)", a03_notifications, 960),
    ("A09-Clubs", "④ 클럽 목록", a09_clubs, 900),
    ("A04-NewClub", "⑤ 클럽 › 새 클럽 개설", a04_new_club, 900),
    ("A05-ClubDetail", "⑥ 클럽 › 상세", a05_club_detail, 960),
    ("A11-SupportAccess", "⑦ 클럽 › 지원 접근 발급", a11_support_access, 900),
    ("A06-Service", "⑧ 서비스 · 전체 상태", a06_service, 900),
    ("A10-AIOps", "⑨ 서비스 › AI 처리", a10_ai_ops, 900),
    ("A07-Records", "⑩ 기록 · 처리 기록", a07_records, 900),
    ("A12-Analytics", "⑪ 기록 › 분석", a12_analytics, 900),
    ("A08-Takedown", "⑫ 긴급 공개 회수", a08_takedown, 900),
    ("A13-AccountMenu", "⑬ 계정 메뉴 · 내 클럽으로", a13_account_menu, 960),
]

MOBILE = [
    ("AM1-Today", "오늘 · 목록", am1_today),
    ("AM2-Detail", "오늘 · 상세", am2_detail),
    ("AM3-Clubs", "클럽", am3_clubs),
    ("AM4-Service", "서비스", am4_service),
]
