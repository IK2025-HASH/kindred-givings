"""HTML report generator for the regression suite."""
import html
from datetime import datetime
from collections import defaultdict


STATUS_COLORS = {
    "PASS":  "#22c55e",
    "FAIL":  "#ef4444",
    "SKIP":  "#f59e0b",
    "ERROR": "#8b5cf6",
}

STATUS_BG = {
    "PASS":  "#f0fdf4",
    "FAIL":  "#fef2f2",
    "SKIP":  "#fffbeb",
    "ERROR": "#faf5ff",
}


def _badge(status):
    color = STATUS_COLORS.get(status, "#6b7280")
    return (
        f'<span style="display:inline-block;padding:2px 10px;border-radius:12px;'
        f'font-size:11px;font-weight:700;color:#fff;background:{color}">{status}</span>'
    )


def write_report(results, path: str, elapsed: float):
    now = datetime.now()
    stamp = now.strftime("%Y-%m-%d %H:%M:%S")

    from collections import Counter
    counts = Counter(r.status for r in results)
    total = len(results)
    passed = counts.get("PASS", 0)
    failed = counts.get("FAIL", 0)
    skipped = counts.get("SKIP", 0)
    errors  = counts.get("ERROR", 0)

    pass_pct = round(100 * passed / total) if total else 0

    # Group by journey
    by_journey = defaultdict(list)
    for r in results:
        by_journey[r.journey].append(r)

    rows_html = ""
    for journey_id, jresults in by_journey.items():
        j_counts = Counter(r.status for r in jresults)
        j_pass = j_counts.get("PASS", 0)
        j_total = len(jresults)
        j_color = "#22c55e" if j_pass == j_total else ("#ef4444" if j_counts.get("FAIL", 0) or j_counts.get("ERROR", 0) else "#f59e0b")

        rows_html += f"""
        <tr style="background:#f8fafc;font-weight:700;">
          <td colspan="5" style="padding:10px 16px;color:{j_color};border-top:2px solid #e2e8f0">
            {html.escape(journey_id)} &mdash; {j_pass}/{j_total} passed
          </td>
        </tr>"""

        for r in jresults:
            dur = f"{r.duration:.1f}s" if r.duration else "—"
            err_cell = ""
            if r.error:
                short_err = html.escape(r.error[:300])
                if len(r.error) > 300:
                    short_err += "…"
                err_cell = f'<details><summary style="cursor:pointer;color:#6b7280;font-size:12px">details</summary><pre style="font-size:11px;white-space:pre-wrap;margin:4px 0">{short_err}</pre>'
                if r.screenshot_b64:
                    err_cell += f'<img src="data:image/png;base64,{r.screenshot_b64}" style="max-width:600px;border:1px solid #e2e8f0;margin-top:8px">'
                err_cell += "</details>"

            rows_html += f"""
        <tr style="background:{STATUS_BG.get(r.status, '#fff')}">
          <td style="padding:8px 16px 8px 32px;font-family:monospace;font-size:12px;color:#374151">{html.escape(r.tc_id)}</td>
          <td style="padding:8px 16px;font-size:13px">{html.escape(r.name)}</td>
          <td style="padding:8px 16px;text-align:center">{_badge(r.status)}</td>
          <td style="padding:8px 16px;text-align:right;font-size:12px;color:#6b7280">{dur}</td>
          <td style="padding:8px 16px;font-size:12px">{err_cell}</td>
        </tr>"""

    report_html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Regression Report — {stamp}</title>
<style>
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; background: #f1f5f9; color: #1e293b }}
  .header {{ background: #1e293b; color: #f8fafc; padding: 24px 32px }}
  .header h1 {{ margin: 0 0 4px; font-size: 22px }}
  .header p {{ margin: 0; font-size: 13px; color: #94a3b8 }}
  .summary {{ display: flex; gap: 16px; padding: 20px 32px; flex-wrap: wrap }}
  .tile {{ background: #fff; border-radius: 10px; padding: 16px 24px; min-width: 120px; box-shadow: 0 1px 3px rgba(0,0,0,.08) }}
  .tile .num {{ font-size: 36px; font-weight: 800; line-height: 1 }}
  .tile .lbl {{ font-size: 12px; color: #64748b; margin-top: 4px }}
  .content {{ padding: 0 32px 40px }}
  table {{ width: 100%; border-collapse: collapse; background: #fff; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08) }}
  th {{ background: #f8fafc; padding: 10px 16px; text-align: left; font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: .05em; border-bottom: 1px solid #e2e8f0 }}
  td {{ border-bottom: 1px solid #f1f5f9; vertical-align: top }}
  tr:last-child td {{ border-bottom: none }}
</style>
</head>
<body>
<div class="header">
  <h1>GiveWell Platform — Regression Report</h1>
  <p>Generated: {stamp} &nbsp;|&nbsp; Duration: {elapsed:.1f}s &nbsp;|&nbsp; {total} test cases</p>
</div>
<div class="summary">
  <div class="tile"><div class="num" style="color:#22c55e">{passed}</div><div class="lbl">PASSED</div></div>
  <div class="tile"><div class="num" style="color:#ef4444">{failed}</div><div class="lbl">FAILED</div></div>
  <div class="tile"><div class="num" style="color:#f59e0b">{skipped}</div><div class="lbl">SKIPPED</div></div>
  <div class="tile"><div class="num" style="color:#8b5cf6">{errors}</div><div class="lbl">ERRORS</div></div>
  <div class="tile"><div class="num" style="color:#3b82f6">{pass_pct}%</div><div class="lbl">PASS RATE</div></div>
</div>
<div class="content">
  <table>
    <thead>
      <tr>
        <th>Test ID</th>
        <th>Name</th>
        <th style="text-align:center">Status</th>
        <th style="text-align:right">Duration</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>
      {rows_html}
    </tbody>
  </table>
</div>
</body>
</html>"""

    with open(path, "w", encoding="utf-8") as f:
        f.write(report_html)
