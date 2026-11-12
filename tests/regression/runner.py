"""
Regression test runner.
Reads manifest CSV, groups by journey, dispatches each test case,
records PASS / FAIL / SKIP / ERROR + duration + optional screenshot.
"""
import csv
import importlib
import os
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

import config
from base import build_driver

JOURNEY_MODULES = {
    "J1":  "journeys.j01_admin_platform",
    "J2":  "journeys.j02_support_agent",
    "J3":  "journeys.j03_registration",
    "J4":  "journeys.j03_registration",
    "J5":  "journeys.j03_registration",
    "J6":  "journeys.j01_admin_platform",
    "J7":  "journeys.j03_registration",
    "J8":  "journeys.j03_registration",
    "J9":  "journeys.j03_registration",
    "J10": "journeys.j10_gift_aid",
    "J11": "journeys.j10_gift_aid",
    "J12": "journeys.j01_admin_platform",
    "J13": "journeys.j01_admin_platform",
    "J14": "journeys.j01_admin_platform",
    "J15": "journeys.j01_admin_platform",
    "J16": "journeys.j16_deployment_engine",
}

STATUSES = ("PASS", "FAIL", "SKIP", "ERROR")


class Result:
    __slots__ = ("journey", "tc_id", "name", "status", "duration", "error", "screenshot_b64")

    def __init__(self, journey, tc_id, name):
        self.journey = journey
        self.tc_id = tc_id
        self.name = name
        self.status = "SKIP"
        self.duration = 0.0
        self.error = ""
        self.screenshot_b64 = ""


def read_manifest(path):
    rows = []
    current_journey = ""
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rtype = row.get("Type", "").strip()
            if rtype == "Journey":
                current_journey = row.get("Journey", "").strip()
            elif rtype == "TestCase":
                if row.get("Include", "N").strip().upper() != "Y":
                    continue
                rows.append({
                    "journey": current_journey,
                    "tc_id":   row.get("TestCase", "").strip(),
                    "name":    row.get("Name", "").strip(),
                    "notes":   row.get("Notes", "").strip(),
                })
    return rows


_module_cache = {}


def _load_module(module_name):
    if module_name in _module_cache:
        return _module_cache[module_name]
    sys.path.insert(0, str(Path(__file__).parent))
    mod = importlib.import_module(module_name)
    _module_cache[module_name] = mod
    return mod


def _try_screenshot(driver):
    if not config.SCREENSHOT_ON_FAIL:
        return ""
    try:
        return driver.get_screenshot_as_base64()
    except Exception:
        return ""


def run_all(manifest_rows):
    journeys = {}
    for row in manifest_rows:
        journeys.setdefault(row["journey"], []).append(row)

    all_results = []

    for journey_id, cases in journeys.items():
        module_name = JOURNEY_MODULES.get(journey_id)
        if not module_name:
            for case in cases:
                r = Result(journey_id, case["tc_id"], case["name"])
                r.status = "SKIP"
                r.error = f"No module mapped for journey {journey_id}"
                all_results.append(r)
            continue

        try:
            mod = _load_module(module_name)
        except Exception as e:
            for case in cases:
                r = Result(journey_id, case["tc_id"], case["name"])
                r.status = "ERROR"
                r.error = f"Module import error: {e}"
                all_results.append(r)
            continue

        TESTS = getattr(mod, "TESTS", {})
        SkipTest = getattr(mod, "SkipTest", type("SkipTest", (Exception,), {}))

        driver = None
        try:
            driver = build_driver()
        except Exception as e:
            for case in cases:
                r = Result(journey_id, case["tc_id"], case["name"])
                r.status = "ERROR"
                r.error = f"Driver launch failed: {e}"
                all_results.append(r)
            continue

        print(f"\n-- Journey {journey_id} ({len(cases)} cases) --")

        for case in cases:
            tc_id = case["tc_id"]
            r = Result(journey_id, tc_id, case["name"])

            fn = TESTS.get(tc_id)
            if fn is None:
                r.status = "SKIP"
                r.error = "No test function found in TESTS dict"
                all_results.append(r)
                print(f"  ~ {tc_id}: SKIP (not in TESTS)")
                continue

            t0 = time.monotonic()
            try:
                fn(driver)
                r.status = "PASS"
                r.duration = time.monotonic() - t0
                print(f"  PASS {tc_id}  ({r.duration:.1f}s)")
            except SkipTest as e:
                r.status = "SKIP"
                r.duration = time.monotonic() - t0
                r.error = str(e)
                print(f"  SKIP {tc_id}  -- {r.error}")
            except AssertionError as e:
                r.status = "FAIL"
                r.duration = time.monotonic() - t0
                r.error = str(e)
                r.screenshot_b64 = _try_screenshot(driver)
                print(f"  FAIL {tc_id}  ({r.duration:.1f}s) -- {r.error}")
            except Exception as e:
                r.status = "ERROR"
                r.duration = time.monotonic() - t0
                r.error = traceback.format_exc()
                r.screenshot_b64 = _try_screenshot(driver)
                print(f"  ERROR {tc_id} ({r.duration:.1f}s) -- {type(e).__name__}: {e}")

            all_results.append(r)

        try:
            driver.quit()
        except Exception:
            pass

    return all_results


def main():
    manifest_path = config.MANIFEST_PATH
    if not os.path.exists(manifest_path):
        print(f"ERROR: manifest not found at {manifest_path}")
        sys.exit(1)

    rows = read_manifest(manifest_path)
    print(f"Loaded {len(rows)} enabled test cases.")
    print(f"Target: {config.BASE_URL}\n")

    start = datetime.now()
    results = run_all(rows)
    elapsed = (datetime.now() - start).total_seconds()

    counts = {s: sum(1 for r in results if r.status == s) for s in STATUSES}
    total = len(results)
    print(f"\n{'='*60}")
    print(f"Results: {total} total | PASS={counts['PASS']} FAIL={counts['FAIL']} SKIP={counts['SKIP']} ERROR={counts['ERROR']}")
    print(f"Duration: {elapsed:.1f}s")
    print("=" * 60)

    from report import write_report
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_dir = Path(config.REPORTS_DIR)
    report_dir.mkdir(parents=True, exist_ok=True)
    report_path = report_dir / f"report_{stamp}.html"
    write_report(results, str(report_path), elapsed)
    print(f"\nReport: {report_path}")

    if counts["FAIL"] > 0 or counts["ERROR"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
