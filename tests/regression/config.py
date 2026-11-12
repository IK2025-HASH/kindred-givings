"""
Regression test configuration.
Override with environment variables or edit directly for local runs.
"""
import os

# ── App ──────────────────────────────────────────────────────────────────────
BASE_URL        = os.getenv("TEST_BASE_URL",   "http://localhost:5173")
GIVING_SLUG     = os.getenv("TEST_GIVING_SLUG", "demo")          # /give/<slug>

# ── Credentials ──────────────────────────────────────────────────────────────
ADMIN_EMAIL     = os.getenv("TEST_ADMIN_EMAIL",    "ilyas@networklogic.uk")
ADMIN_PASSWORD  = os.getenv("TEST_ADMIN_PASSWORD", "")

ORG_EMAIL       = os.getenv("TEST_ORG_EMAIL",    "")
ORG_PASSWORD    = os.getenv("TEST_ORG_PASSWORD", "")

AGENT_EMAIL     = os.getenv("TEST_AGENT_EMAIL",    "")
AGENT_PASSWORD  = os.getenv("TEST_AGENT_PASSWORD", "")

# J3 / J7 / J8 — set email prefix; runner appends +timestamp to avoid collisions
NEW_USER_PREFIX = os.getenv("TEST_NEW_USER_PREFIX", "testuser")
NEW_USER_DOMAIN = os.getenv("TEST_NEW_USER_DOMAIN", "example.com")
NEW_USER_PASS   = os.getenv("TEST_NEW_USER_PASS",   "TestPass123!")

# ── Browser ───────────────────────────────────────────────────────────────────
BROWSER         = os.getenv("TEST_BROWSER",   "chrome")   # chrome | firefox
HEADLESS        = os.getenv("TEST_HEADLESS",  "0") == "1"
WINDOW_WIDTH    = 1440
WINDOW_HEIGHT   = 900

# ── Timing ───────────────────────────────────────────────────────────────────
TIMEOUT         = int(os.getenv("TEST_TIMEOUT", "20"))    # seconds for explicit waits
PAGE_LOAD       = int(os.getenv("TEST_PAGE_LOAD", "30"))  # seconds for page load timeout

# ── Report ───────────────────────────────────────────────────────────────────
SCREENSHOT_ON_FAIL  = True
REPORTS_DIR         = os.path.join(os.path.dirname(__file__), "reports")
MANIFEST_PATH       = os.path.join(os.path.dirname(__file__), "manifest.csv")
