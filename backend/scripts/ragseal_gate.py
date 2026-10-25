#!/usr/bin/env python3
"""ragseal-gate: fail a CI job when a RAG bot does not meet the bar on a RAGSeal test pack.

    RAGSEAL_URL=https://ragseal.vercel.app RAGSEAL_TOKEN=rsk_... \\
        python ragseal_gate.py --pack banking --min-pass-rate 0.8 --max-new-failures 0 [--bot-config bot.json]

Runs the pack (or gates an existing run with --batch-id), waits for the result and prints it.
Exit code: 0 pass, 1 fail, 2 error (bad arguments, network, server, timeout).
Python standard library only. Create the token in RAGSeal under API tokens (POST /api/tokens).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request


class GateError(RuntimeError):
    pass


def request(method: str, url: str, token: str, body: dict | None = None, timeout: float = 60) -> tuple[int, dict]:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json", "User-Agent": "ragseal-gate/1"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:300]
        raise GateError(f"HTTP {exc.code} from {url}: {detail}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise GateError(f"cannot reach {url}: {exc}") from exc


def run_gate(base: str, token: str, body: dict, wait_s: float, poll_s: float = 10) -> dict:
    status, result = request("POST", f"{base}/api/gate", token, body)
    deadline = time.monotonic() + wait_s
    while result.get("status") == "running":
        if time.monotonic() > deadline:
            raise GateError(f"gave up after {wait_s:.0f} s; the run continues: {result.get('report_url') or result.get('gate_id')}")
        progress = result.get("progress") or {}
        if progress:
            print(f"  running: {progress.get('done', 0)}/{progress.get('total', '?')} questions", flush=True)
        time.sleep(poll_s)
        status, result = request("GET", f"{base}/api/gate/{result['gate_id']}", token)
    if result.get("status") == "failed":
        raise GateError(f"the run failed: {result.get('error')}")
    return result


def report(result: dict) -> str:
    lines = [
        f"RAGSeal gate: {'PASS' if result['pass'] else 'FAIL'}  ({result.get('pack_id')}, {result.get('total')} questions)",
        f"  pass rate {result['pass_rate']:.1%} (minimum {result['min_pass_rate']:.1%})",
        f"  new failures {len(result['new_failures'])} (allowed {result['max_new_failures']}), fixed {len(result['fixed'])}"
        + (f", baseline {result['baseline_batch_id']}" if result.get("baseline_batch_id") else ", no baseline run"),
    ]
    lines += [f"  - {r}" for r in result.get("reasons", [])]
    for f in result.get("new_failures", [])[:10]:
        lines.append(f"  new failure {f['test_id']}: {f.get('category')} - {f.get('question')}")
    if result.get("report_url"):
        lines.append(f"  report: {result['report_url']}")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default=os.environ.get("RAGSEAL_URL", ""), help="RAGSeal base URL (env RAGSEAL_URL)")
    parser.add_argument("--token", default=os.environ.get("RAGSEAL_TOKEN", ""), help="API token (env RAGSEAL_TOKEN)")
    parser.add_argument("--pack", required=True)
    parser.add_argument("--min-pass-rate", type=float, default=0.8)
    parser.add_argument("--max-new-failures", type=int, default=0)
    parser.add_argument("--baseline", help="baseline batch id (default: your previous run of the pack)")
    parser.add_argument("--batch-id", help="gate this finished run instead of running the pack")
    parser.add_argument("--bot-config", help="JSON file with your bot's connector settings (url, headers, paths)")
    parser.add_argument("--wait", type=float, default=1800, help="seconds to wait for the run (default 1800)")
    args = parser.parse_args(argv)
    if not args.url or not args.token:
        print("ragseal-gate: set --url/RAGSEAL_URL and --token/RAGSEAL_TOKEN", file=sys.stderr)
        return 2
    body = {"pack_id": args.pack, "min_pass_rate": args.min_pass_rate, "max_new_failures": args.max_new_failures}
    if args.baseline:
        body["baseline_batch_id"] = args.baseline
    if args.batch_id:
        body["batch_id"] = args.batch_id
    try:
        if args.bot_config:
            with open(args.bot_config) as fh:
                body["bot"] = json.load(fh)
        result = run_gate(args.url.rstrip("/"), args.token, body, args.wait)
    except (GateError, OSError, ValueError) as exc:
        print(f"ragseal-gate: error: {exc}", file=sys.stderr)
        return 2
    print(report(result))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    sys.exit(main())
