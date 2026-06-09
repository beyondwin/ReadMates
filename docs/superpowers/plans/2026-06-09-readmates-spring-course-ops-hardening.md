# ReadMates Spring Course Ops Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first approved Spring-course hardening slice: local observability smoke evidence and large-fixture SQL performance guards.

**Architecture:** Keep ReadMates' existing Spring Boot server architecture and public-safety model. Observability work lives under `ops/`, `scripts/`, and operations docs; SQL confidence work extends the existing Testcontainers MySQL integration tests without changing production API behavior.

**Tech Stack:** Kotlin/Spring Boot 4, JdbcTemplate, MySQL/Testcontainers, Docker Compose, Prometheus, Grafana, Bash, Python 3 standard library.

---

## Scope

This plan implements T1 and T2 from `docs/superpowers/specs/2026-06-09-readmates-spring-course-ops-hardening-design.md`.

- T1 Observability: local Prometheus/Grafana smoke stack, dashboard/rule validation entrypoint, SLO report draft generator.
- T2 SQL Performance: synthetic large notes fixture, query budget confirmation, duration smoke for large read paths, test-guide evidence.

T3 database lifecycle, T4 API error catalog, T5 OAuth2 threat model, and T6 concurrency race tests are intentionally deferred to separate plans after T1/T2 land.

## File Structure

### Observability

- Create: `ops/observability/local/compose.yml`
  - Runs Prometheus and Grafana locally without production credentials.
- Create: `ops/observability/local/prometheus.yml`
  - Scrapes the local Spring management endpoint through `host.docker.internal:8081`.
- Create: `ops/observability/local/grafana/provisioning/datasources/prometheus.yml`
  - Provisions Prometheus as the default Grafana datasource.
- Create: `ops/observability/local/grafana/provisioning/dashboards/readmates.yml`
  - Provisions existing `ops/grafana/dashboards/*.json`.
- Create: `scripts/observability-local-smoke.sh`
  - Starts the local observability stack and checks Prometheus readiness, rule load, targets, Grafana readiness, and dashboard provisioning.
- Create: `scripts/generate-slo-report.py`
  - Reads `server/src/main/resources/slo/slos.yaml`, queries Prometheus, and prints a public-safe markdown report.
- Modify: `docs/operations/runbooks/observability-bootstrap.md`
  - Adds the local smoke path before OCI bring-up.
- Modify: `docs/operations/runbooks/slo-monthly-report.md`
  - Replaces manual-only query instructions with the report generator command.
- Modify: `docs/operations/observability/README.md`
  - Links the local smoke stack and SLO report generator.
- Modify: `scripts/README.md`
  - Documents the new scripts and verification commands.

### SQL Performance

- Create: `server/src/test/kotlin/com/readmates/performance/LargeReadPathFixture.kt`
  - Seeds and cleans synthetic public-safe notes data for one existing dev-seed club.
- Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`
  - Adds large-fixture notes feed query count and duration smoke tests.
- Modify: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`
  - Reuses the large fixture for notes feed EXPLAIN confidence.
- Modify: `docs/development/test-guide.md`
  - Documents the new large-fixture performance guard.
- Modify: `docs/development/release-readiness-review.md`
  - Adds a local evidence note when implementation lands.
- Modify: `CHANGELOG.md`
  - Records the operator/reviewer-facing confidence improvement under `## Unreleased`.

## Task 1: Add Local Observability Smoke Stack

**Files:**
- Create: `ops/observability/local/compose.yml`
- Create: `ops/observability/local/prometheus.yml`
- Create: `ops/observability/local/grafana/provisioning/datasources/prometheus.yml`
- Create: `ops/observability/local/grafana/provisioning/dashboards/readmates.yml`
- Create: `scripts/observability-local-smoke.sh`
- Modify: `docs/operations/runbooks/observability-bootstrap.md`
- Modify: `docs/operations/observability/README.md`
- Modify: `scripts/README.md`

- [ ] **Step 1: Write the smoke script first**

Create `scripts/observability-local-smoke.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
compose_file="$repo_root/ops/observability/local/compose.yml"

cd "$repo_root"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'observability-local-smoke: required command not found: %s\n' "$1" >&2
    exit 2
  fi
}

wait_http() {
  local label="$1"
  local url="$2"
  local attempts="${3:-30}"
  local i
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      printf 'OK: %s\n' "$label"
      return 0
    fi
    sleep 2
  done
  printf 'FAILED: %s did not become ready at %s\n' "$label" "$url" >&2
  return 1
}

require_cmd docker
require_cmd curl
require_cmd jq

docker compose -f "$compose_file" up -d prometheus grafana

wait_http "Prometheus ready" "http://localhost:9090/-/ready"
wait_http "Grafana ready" "http://localhost:3001/api/health"

rule_groups="$(curl -fsS http://localhost:9090/api/v1/rules | jq '.data.groups | length')"
if (( rule_groups < 1 )); then
  printf 'FAILED: Prometheus loaded no alert rule groups\n' >&2
  exit 1
fi
printf 'OK: Prometheus loaded %s rule group(s)\n' "$rule_groups"

target_count="$(curl -fsS http://localhost:9090/api/v1/targets | jq '[.data.activeTargets[] | select(.labels.job == "readmates-server")] | length')"
if (( target_count != 1 )); then
  printf 'FAILED: expected one readmates-server target, got %s\n' "$target_count" >&2
  exit 1
fi
printf 'OK: Prometheus has readmates-server target\n'

dashboard_count="$(curl -fsS http://localhost:3001/api/search?type=dash-db | jq 'length')"
if (( dashboard_count < 3 )); then
  printf 'FAILED: expected at least 3 provisioned Grafana dashboards, got %s\n' "$dashboard_count" >&2
  exit 1
fi
printf 'OK: Grafana provisioned %s dashboard(s)\n' "$dashboard_count"
```

- [ ] **Step 2: Run syntax check and verify expected failure before compose files exist**

Run:

```bash
bash -n scripts/observability-local-smoke.sh
./scripts/observability-local-smoke.sh
```

Expected: `bash -n` passes. The script fails because `ops/observability/local/compose.yml` does not exist yet.

- [ ] **Step 3: Add the local Docker Compose stack**

Create `ops/observability/local/compose.yml`:

```yaml
services:
  prometheus:
    image: prom/prometheus:v2.55.0
    command:
      - "--config.file=/etc/prometheus/prometheus.yml"
      - "--storage.tsdb.path=/prometheus"
      - "--web.enable-lifecycle"
    ports:
      - "9090:9090"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ../../prometheus/alerts:/etc/prometheus/alerts:ro
      - readmates-local-prometheus:/prometheus

  grafana:
    image: grafana/grafana:11.5.1
    ports:
      - "3001:3000"
    environment:
      GF_SECURITY_ADMIN_USER: readmates
      GF_SECURITY_ADMIN_PASSWORD: readmates
      GF_AUTH_ANONYMOUS_ENABLED: "true"
      GF_AUTH_ANONYMOUS_ORG_ROLE: Viewer
    volumes:
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ../../grafana/dashboards:/var/lib/grafana/dashboards/readmates:ro
      - readmates-local-grafana:/var/lib/grafana

volumes:
  readmates-local-prometheus:
  readmates-local-grafana:
```

Create `ops/observability/local/prometheus.yml`:

```yaml
global:
  scrape_interval: 15s
  scrape_timeout: 5s
  evaluation_interval: 15s
  external_labels:
    app: readmates-local

rule_files:
  - /etc/prometheus/alerts/*.yml

scrape_configs:
  - job_name: readmates-server
    metrics_path: /actuator/prometheus
    static_configs:
      - targets: ["host.docker.internal:8081"]

  - job_name: prometheus-self
    static_configs:
      - targets: ["localhost:9090"]
```

- [ ] **Step 4: Add Grafana provisioning**

Create `ops/observability/local/grafana/provisioning/datasources/prometheus.yml`:

```yaml
apiVersion: 1

datasources:
  - name: ReadMates Local Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: false
```

Create `ops/observability/local/grafana/provisioning/dashboards/readmates.yml`:

```yaml
apiVersion: 1

providers:
  - name: ReadMates
    orgId: 1
    folder: ReadMates
    type: file
    disableDeletion: false
    allowUiUpdates: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards/readmates
```

- [ ] **Step 5: Run local observability validation**

Run these commands:

```bash
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/observability-local-smoke.sh
```

Expected: dashboard JSON and rule validation pass. The smoke script passes if a local server is exposing `/actuator/prometheus` on port 8081; if not, it still confirms Prometheus/Grafana readiness and reports the single `readmates-server` target as present. Record any target health limitation in the final task report.

- [ ] **Step 6: Update operations docs**

In `docs/operations/runbooks/observability-bootstrap.md`, add this section after "사전 준비":

```markdown
## 로컬 smoke

운영 VM에 올리기 전에 로컬에서 dashboard/rule/provisioning이 깨지지 않았는지 확인합니다.

```bash
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/observability-local-smoke.sh
```

로컬 Spring Boot 서버가 `8081` management port를 열고 있으면 Prometheus target health까지 같이 확인합니다.
서버가 떠 있지 않은 상태에서는 target presence까지만 확인하고 실제 scrape health는 운영 bring-up 단계에서 확인합니다.
```

In `docs/operations/observability/README.md`, add one bullet under "운영 진입점":

```markdown
- 로컬 검증 진입점: `./scripts/observability-local-smoke.sh` — Prometheus/Grafana provisioning, alert rule load, dashboard import를 공개-safe fixture로 확인합니다.
```

In `scripts/README.md`, add a section for `observability-local-smoke.sh` with the command and the same server-port caveat.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add ops/observability/local scripts/observability-local-smoke.sh docs/operations/runbooks/observability-bootstrap.md docs/operations/observability/README.md scripts/README.md
git commit -m "chore: add local observability smoke"
```

## Task 2: Add SLO Report Draft Generator

**Files:**
- Create: `scripts/generate-slo-report.py`
- Modify: `docs/operations/runbooks/slo-monthly-report.md`
- Modify: `scripts/README.md`

- [ ] **Step 1: Create the SLO report generator**

Create `scripts/generate-slo-report.py`:

```python
#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
SLO_FILE = REPO / "server/src/main/resources/slo/slos.yaml"


def parse_slos(path: Path):
    slos = []
    current = None
    sli = False
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        stripped = line.strip()
        if stripped.startswith("- id: "):
            if current:
                slos.append(current)
            current = {"id": stripped.removeprefix("- id: ")}
            sli = False
        elif current and stripped.startswith("description: "):
            current["description"] = stripped.removeprefix("description: ")
        elif current and stripped.startswith("objective: "):
            current["objective"] = stripped.removeprefix("objective: ")
        elif current and stripped.startswith("objective_ms: "):
            current["objective_ms"] = stripped.removeprefix("objective_ms: ")
        elif current and stripped.startswith("window: "):
            current["window"] = stripped.removeprefix("window: ")
        elif current and stripped == "sli:":
            sli = True
        elif current and sli and stripped.startswith("query_good: "):
            current["query_good"] = stripped.removeprefix("query_good: ")
        elif current and sli and stripped.startswith("query_total: "):
            current["query_total"] = stripped.removeprefix("query_total: ")
        elif current and sli and stripped.startswith("query_latency_p95: "):
            current["query_latency_p95"] = stripped.removeprefix("query_latency_p95: ")
    if current:
        slos.append(current)
    return slos


def prom_query(base_url: str, query: str):
    encoded = urllib.parse.urlencode({"query": query})
    url = f"{base_url.rstrip('/')}/api/v1/query?{encoded}"
    with urllib.request.urlopen(url, timeout=10) as response:
        body = json.loads(response.read().decode("utf-8"))
    if body.get("status") != "success":
        raise RuntimeError(f"Prometheus query failed: {body}")
    result = body.get("data", {}).get("result", [])
    if not result:
        return None
    return float(result[0]["value"][1])


def measured_value(base_url: str, slo: dict):
    if "query_latency_p95" in slo:
        value = prom_query(base_url, slo["query_latency_p95"])
        if value is None:
            return "no_data", False
        objective_ms = float(slo["objective_ms"])
        return f"{value:.2f}ms", value <= objective_ms
    good = prom_query(base_url, slo["query_good"])
    total = prom_query(base_url, slo["query_total"])
    if good is None or total is None or total <= 0:
        return "no_data", False
    ratio = good / total
    objective = float(slo["objective"])
    return f"{ratio * 100:.4f}%", ratio >= objective


def objective_label(slo: dict):
    if "objective_ms" in slo:
        return f"<= {slo['objective_ms']}ms"
    return f">= {float(slo['objective']) * 100:.2f}%"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--prometheus-url", default="http://localhost:9090")
    parser.add_argument("--month", default=dt.date.today().strftime("%Y-%m"))
    args = parser.parse_args()

    rows = []
    for slo in parse_slos(SLO_FILE):
        try:
            measured, passing = measured_value(args.prometheus_url, slo)
            status = "PASS" if passing else "CHECK"
        except Exception as exc:
            measured = f"query_error: {exc.__class__.__name__}"
            status = "CHECK"
        rows.append((slo["id"], objective_label(slo), measured, slo["window"], status))

    print(f"# SLO Report {args.month}")
    print()
    print("| SLO id | objective | measured | window | 위반 여부 |")
    print("|--------|-----------|----------|--------|-----------|")
    for row in rows:
        print("| " + " | ".join(row) + " |")
    print()
    print("## 비고")
    print("- Prometheus URL: public-safe local or port-forwarded endpoint.")
    print("- `CHECK` 항목은 운영자가 Prometheus target health와 incident context를 확인합니다.")


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: Verify the script syntax and no-network failure mode**

Run:

```bash
python3 -m py_compile scripts/generate-slo-report.py
python3 scripts/generate-slo-report.py --prometheus-url http://127.0.0.1:1 --month 2026-06
```

Expected: compile passes. The generated markdown contains all six SLO ids with `query_error: URLError` or equivalent `CHECK` entries; it does not print secrets, hostnames, or member data.

- [ ] **Step 3: Verify against local Prometheus**

Run after Task 1 stack is up:

```bash
python3 scripts/generate-slo-report.py --prometheus-url http://localhost:9090 --month 2026-06
```

Expected: markdown prints six rows. Rows may show `no_data` until local traffic exists.

- [ ] **Step 4: Update SLO runbook**

Replace the manual-only procedure in `docs/operations/runbooks/slo-monthly-report.md` with:

```markdown
## 절차

1. 운영 Prometheus를 로컬에서 접근 가능한 주소로 연다. 예: SSH tunnel 또는 운영자가 승인한 port-forward.
2. 아래 명령으로 markdown 초안을 생성한다.

```bash
python3 scripts/generate-slo-report.py \
  --prometheus-url http://localhost:9090 \
  --month 2026-06 > docs/operations/slo-reports/2026-06.md
```

3. `CHECK` 행은 Prometheus target health, incident 기록, 배포 이력을 확인해 비고에 판단을 남긴다.
4. 보고서에는 실제 운영 도메인, 수신자 이메일, 토큰, private endpoint를 쓰지 않는다.
```

In `scripts/README.md`, document `generate-slo-report.py` with the same command.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add scripts/generate-slo-report.py docs/operations/runbooks/slo-monthly-report.md scripts/README.md
git commit -m "docs: automate slo report draft"
```

## Task 3: Add Large Notes Fixture Helper

**Files:**
- Create: `server/src/test/kotlin/com/readmates/performance/LargeReadPathFixture.kt`

- [ ] **Step 1: Create the fixture helper**

Create `LargeReadPathFixture.kt`:

```kotlin
package com.readmates.performance

import org.springframework.jdbc.core.JdbcTemplate
import java.time.LocalDate

internal class LargeReadPathFixture(
    private val jdbcTemplate: JdbcTemplate,
) {
    fun seedNotesFeed(
        sessionCount: Int = 80,
        firstSessionNumber: Int = 1_000,
    ) {
        cleanupNotesFeed()
        insertSessions(sessionCount, firstSessionNumber)
        insertParticipants(sessionCount)
        insertQuestions(sessionCount)
        insertOneLineReviews(sessionCount)
        insertLongReviews(sessionCount)
        insertHighlights(sessionCount)
    }

    fun cleanupNotesFeed() {
        jdbcTemplate.update("delete from highlights where id like '10000000-0000-0000-0004-%'")
        jdbcTemplate.update("delete from long_reviews where id like '10000000-0000-0000-0003-%'")
        jdbcTemplate.update("delete from one_line_reviews where id like '10000000-0000-0000-0002-%'")
        jdbcTemplate.update("delete from questions where id like '10000000-0000-0000-0001-%'")
        jdbcTemplate.update("delete from session_participants where id like '10000000-0000-0000-0005-%'")
        jdbcTemplate.update("delete from sessions where id like '10000000-0000-0000-0000-%'")
    }

    private fun insertSessions(
        sessionCount: Int,
        firstSessionNumber: Int,
    ) {
        val rows =
            (1..sessionCount).map { offset ->
                arrayOf(
                    sessionId(offset),
                    CLUB_ID,
                    firstSessionNumber + offset,
                    "대용량 성능 검증 ${offset}회차",
                    "성능 검증 책 $offset",
                    "테스트 저자",
                    LocalDate.of(2026, 1, 1).plusDays(offset.toLong()),
                )
            }
        jdbcTemplate.batchUpdate(
            """
            insert into sessions (
              id, club_id, number, title, book_title, book_author, session_date,
              start_time, end_time, location_label, question_deadline_at, state, visibility
            )
            values (?, ?, ?, ?, ?, ?, ?, '19:30:00', '21:30:00', '온라인', '2026-01-01 00:00:00.000000', 'PUBLISHED', 'PUBLIC')
            """.trimIndent(),
            rows,
        )
    }

    private fun insertParticipants(sessionCount: Int) {
        val rows =
            (1..sessionCount).flatMap { offset ->
                listOf(
                    arrayOf(participantId(offset, 1), CLUB_ID, sessionId(offset), MEMBER_5_ID),
                    arrayOf(participantId(offset, 2), CLUB_ID, sessionId(offset), MEMBER_4_ID),
                )
            }
        jdbcTemplate.batchUpdate(
            """
            insert into session_participants (id, club_id, session_id, membership_id, rsvp_status, attendance_status, participation_status)
            values (?, ?, ?, ?, 'GOING', 'ATTENDED', 'ACTIVE')
            """.trimIndent(),
            rows,
        )
    }

    private fun insertQuestions(sessionCount: Int) {
        val rows = (1..sessionCount).map { offset -> arrayOf(questionId(offset), CLUB_ID, sessionId(offset), MEMBER_5_ID, "질문 $offset") }
        jdbcTemplate.batchUpdate(
            """
            insert into questions (id, club_id, session_id, membership_id, priority, text, draft_thought, created_at)
            values (?, ?, ?, ?, 1, ?, null, timestampadd(second, ?, '2026-01-01 00:00:00.000000'))
            """.trimIndent(),
            rows.mapIndexed { index, row -> row + arrayOf(index) },
        )
    }

    private fun insertOneLineReviews(sessionCount: Int) {
        val rows = (1..sessionCount).map { offset -> arrayOf(oneLineId(offset), CLUB_ID, sessionId(offset), MEMBER_5_ID, "한줄평 $offset") }
        jdbcTemplate.batchUpdate(
            """
            insert into one_line_reviews (id, club_id, session_id, membership_id, text, visibility, created_at)
            values (?, ?, ?, ?, ?, 'PUBLIC', timestampadd(second, ?, '2026-01-01 00:00:00.000000'))
            """.trimIndent(),
            rows.mapIndexed { index, row -> row + arrayOf(index + 1000) },
        )
    }

    private fun insertLongReviews(sessionCount: Int) {
        val rows = (1..sessionCount).map { offset -> arrayOf(longReviewId(offset), CLUB_ID, sessionId(offset), MEMBER_4_ID, "장문 서평 $offset") }
        jdbcTemplate.batchUpdate(
            """
            insert into long_reviews (id, club_id, session_id, membership_id, body, visibility, created_at)
            values (?, ?, ?, ?, ?, 'PUBLIC', timestampadd(second, ?, '2026-01-01 00:00:00.000000'))
            """.trimIndent(),
            rows.mapIndexed { index, row -> row + arrayOf(index + 2000) },
        )
    }

    private fun insertHighlights(sessionCount: Int) {
        val rows = (1..sessionCount).map { offset -> arrayOf(highlightId(offset), CLUB_ID, sessionId(offset), "하이라이트 $offset") }
        jdbcTemplate.batchUpdate(
            """
            insert into highlights (id, club_id, session_id, membership_id, text, sort_order, created_at)
            values (?, ?, ?, null, ?, 1, timestampadd(second, ?, '2026-01-01 00:00:00.000000'))
            """.trimIndent(),
            rows.mapIndexed { index, row -> row + arrayOf(index + 3000) },
        )
    }

    private fun sessionId(offset: Int) = "10000000-0000-0000-0000-${offset.toString().padStart(12, '0')}"
    private fun questionId(offset: Int) = "10000000-0000-0000-0001-${offset.toString().padStart(12, '0')}"
    private fun oneLineId(offset: Int) = "10000000-0000-0000-0002-${offset.toString().padStart(12, '0')}"
    private fun longReviewId(offset: Int) = "10000000-0000-0000-0003-${offset.toString().padStart(12, '0')}"
    private fun highlightId(offset: Int) = "10000000-0000-0000-0004-${offset.toString().padStart(12, '0')}"
    private fun participantId(offset: Int, member: Int) = "10000000-0000-0000-0005-${(offset * 10 + member).toString().padStart(12, '0')}"

    private companion object {
        private const val CLUB_ID = "00000000-0000-0000-0000-000000000001"
        private const val MEMBER_4_ID = "00000000-0000-0000-0000-000000000205"
        private const val MEMBER_5_ID = "00000000-0000-0000-0000-000000000206"
    }
}
```

- [ ] **Step 2: Compile focused tests and fix schema drift if needed**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

Expected: if `participation_status` is not available in this migration baseline, MySQL reports an unknown column. In that case, remove `participation_status` from the insert column list only if the active-participant migration does not require it; otherwise use the migration-defined default. Confirm by checking current migrations before editing.

- [ ] **Step 3: Commit Task 3**

Run:

```bash
git add server/src/test/kotlin/com/readmates/performance/LargeReadPathFixture.kt
git commit -m "test(server): add large read path fixture"
```

## Task 4: Add Large-Fixture Query Budget and Duration Smoke

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt`

- [ ] **Step 1: Add cleanup hook for large fixture**

In `ServerQueryBudgetTest`, add this property and cleanup call:

```kotlin
private val largeFixture by lazy { LargeReadPathFixture(jdbcTemplate) }
```

Update `cleanupAuthSessions()`:

```kotlin
@AfterEach
fun cleanupAuthSessions() {
    largeFixture.cleanupNotesFeed()
    if (createdSessionTokenHashes.isEmpty()) {
        return
    }
    val bindMarkers = createdSessionTokenHashes.joinToString(",") { "?" }
    jdbcTemplate.update(
        "delete from auth_sessions where session_token_hash in ($bindMarkers)",
        *createdSessionTokenHashes.toTypedArray(),
    )
    createdSessionTokenHashes.clear()
}
```

- [ ] **Step 2: Add failing query budget test**

Append:

```kotlin
@Test
fun `notes feed large fixture stays within fixed query budget`() {
    largeFixture.seedNotesFeed(sessionCount = 80)

    assertQueryBudget(
        budget = 6,
        reason = "notes feed should remain a bounded cursor query under large synthetic history",
    ) {
        mockMvc
            .get("/api/notes/feed?limit=60") {
                with(user("member5@example.com"))
                header("X-Readmates-Bff-Secret", "test-bff-secret")
            }.andExpect {
                status { isOk() }
                jsonPath("$.items.length()") { value(60) }
            }
    }
}
```

- [ ] **Step 3: Add duration smoke test**

Append:

```kotlin
@Test
fun `notes feed large fixture returns first page under duration smoke threshold`() {
    largeFixture.seedNotesFeed(sessionCount = 80)

    val startedAt = System.nanoTime()
    mockMvc
        .get("/api/notes/feed?limit=60") {
            with(user("member5@example.com"))
            header("X-Readmates-Bff-Secret", "test-bff-secret")
        }.andExpect {
            status { isOk() }
            jsonPath("$.items.length()") { value(60) }
        }
    val elapsedMs = (System.nanoTime() - startedAt) / 1_000_000

    assertThat(elapsedMs)
        .describedAs("notes feed first page should stay below a local integration smoke threshold")
        .isLessThan(1_500)
}
```

- [ ] **Step 4: Run focused integration test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.ServerQueryBudgetTest
```

Expected: PASS. If the duration smoke is flaky on a cold Testcontainers run, keep it as a second-request measurement by making one warm-up request before `startedAt`; document the warm-up in the test name.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add server/src/test/kotlin/com/readmates/performance/ServerQueryBudgetTest.kt
git commit -m "test(server): pin large notes feed budget"
```

## Task 5: Extend EXPLAIN Guard for Large Notes Fixture

**Files:**
- Modify: `server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt`

- [ ] **Step 1: Add cleanup support**

At class level, add:

```kotlin
private val largeFixture by lazy { LargeReadPathFixture(jdbcTemplate) }
```

Import:

```kotlin
import org.junit.jupiter.api.AfterEach
```

Add:

```kotlin
@AfterEach
fun cleanupLargeFixture() {
    largeFixture.cleanupNotesFeed()
}
```

- [ ] **Step 2: Add large-fixture EXPLAIN test**

Append this test:

```kotlin
@Test
fun `notes feed large fixture keeps every union branch on indexed access`() {
    largeFixture.seedNotesFeed(sessionCount = 80)

    val plan =
        jdbcTemplate.explain(
            NOTES_FEED_PLAN_SQL,
            READING_SAI_CLUB_ID,
            READING_SAI_CLUB_ID,
            READING_SAI_CLUB_ID,
            READING_SAI_CLUB_ID,
            61,
        )

    plan.assertUsesIndexFor("questions", "large notes feed question branch")
    plan.assertUsesIndexFor("long_reviews", "large notes feed long-review branch")
    plan.assertUsesIndexFor("one_line_reviews", "large notes feed one-line review branch")
    plan.assertUsesIndexFor("highlights", "large notes feed highlight branch")
    plan.assertUsesIndexFor("sessions", "large notes feed session join")
    plan.assertUsesIndexFor("session_participants", "large notes feed active participant filter")
}
```

- [ ] **Step 3: Run focused EXPLAIN test**

Run:

```bash
./server/gradlew -p server integrationTest --tests com.readmates.performance.MySqlQueryPlanTest
```

Expected: PASS. If MySQL chooses a full scan for a tiny table despite large fixture data, inspect `server/src/test/kotlin/com/readmates/support/MySqlExplainTestSupport.kt` before changing assertions; keep the assertion tied to targeted indexed access, not a brittle row count.

- [ ] **Step 4: Commit Task 5**

Run:

```bash
git add server/src/test/kotlin/com/readmates/performance/MySqlQueryPlanTest.kt
git commit -m "test(server): extend notes feed explain guard"
```

## Task 6: Document Evidence and Release Checks

**Files:**
- Modify: `docs/development/test-guide.md`
- Modify: `docs/development/release-readiness-review.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Update test guide**

In `docs/development/test-guide.md`, under the query budget section, add:

```markdown
Large-fixture notes feed confidence uses synthetic public-safe rows in `LargeReadPathFixture`.
It is not a benchmark score; it catches accidental N+1 queries, lost indexes, and severe first-page regressions.

```bash
./server/gradlew -p server integrationTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
```
```

- [ ] **Step 2: Update release-readiness evidence**

Add a short dated note under the current Unreleased/relevant release-risk section:

```markdown
### 2026-06-09 Spring-course ops hardening evidence

- Observability: local Prometheus/Grafana smoke stack and SLO report draft generator are documented without production credentials or private endpoints.
- SQL confidence: notes feed large-fixture query budget, duration smoke, and EXPLAIN guard pin the public-safe read path against accidental N+1 and index drift.
- Required local checks: `./scripts/lint-grafana-dashboards.sh`, `./scripts/validate-prometheus-rules.sh`, `./scripts/observability-local-smoke.sh`, `python3 scripts/generate-slo-report.py --prometheus-url http://localhost:9090 --month 2026-06`, and focused server integration tests.
```

- [ ] **Step 3: Update CHANGELOG**

Under `## Unreleased`, add:

```markdown
### Engineering

- Added Spring-course-inspired operations hardening evidence: local observability smoke tooling, SLO report draft generation, and large-fixture SQL performance guards for the notes feed.
```

- [ ] **Step 4: Run docs and public-safety checks**

Run:

```bash
git diff --check -- docs/development/test-guide.md docs/development/release-readiness-review.md CHANGELOG.md docs/operations/runbooks/observability-bootstrap.md docs/operations/runbooks/slo-monthly-report.md docs/operations/observability/README.md scripts/README.md
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected: whitespace check passes. Public release candidate build/check passes and reports no leaks.

- [ ] **Step 5: Commit Task 6**

Run:

```bash
git add docs/development/test-guide.md docs/development/release-readiness-review.md CHANGELOG.md docs/operations/runbooks/observability-bootstrap.md docs/operations/runbooks/slo-monthly-report.md docs/operations/observability/README.md scripts/README.md
git commit -m "docs: record ops hardening evidence"
```

## Final Verification

Run after all tasks:

```bash
./scripts/lint-grafana-dashboards.sh
./scripts/validate-prometheus-rules.sh
./scripts/observability-local-smoke.sh
python3 -m py_compile scripts/generate-slo-report.py
python3 scripts/generate-slo-report.py --prometheus-url http://localhost:9090 --month 2026-06
./server/gradlew -p server check
./server/gradlew -p server integrationTest \
  --tests com.readmates.performance.ServerQueryBudgetTest \
  --tests com.readmates.performance.MySqlQueryPlanTest
git diff --check
./scripts/build-public-release-candidate.sh
./scripts/public-release-check.sh .tmp/public-release-candidate
```

Expected:

- Grafana dashboard JSON lint passes.
- Prometheus rule validation passes.
- Local smoke stack starts and reports Prometheus/Grafana readiness.
- SLO report script prints six SLO rows.
- Server `check` passes.
- Focused integration tests pass.
- Public release candidate check reports no leaks.

## Self-Review

- Spec coverage: covers T1 Observability and T2 SQL Performance. T3-T6 are explicitly deferred and not silently dropped.
- Placeholder scan: no unresolved placeholder markers or unspecified "add tests" steps remain.
- Type consistency: Kotlin test snippets use existing `MockMvc`, `JdbcTemplate`, `assertThat`, `user`, and `jsonPath` patterns already present in `ServerQueryBudgetTest`.
- Public safety: all generated data uses existing fixture emails and synthetic UUID ranges; docs avoid real domains, secrets, deployment state, and OCIDs.
