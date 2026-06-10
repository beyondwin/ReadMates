#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import sys
import urllib.error
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
        stripped = raw.strip()
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
        except (OSError, RuntimeError, ValueError, urllib.error.URLError) as exc:
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
