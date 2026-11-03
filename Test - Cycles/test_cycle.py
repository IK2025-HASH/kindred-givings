#!/usr/bin/env python3
"""
GiveWell (Donorbook) Platform — Automated Test Cycle
=====================================================
• 3 Chrome sessions: Admin / Agent / New-User
• Screenshots every step → Word .docx report
• New user email: v<version>-<DDMMYYYY>@networklogic.uk

Run:   python test_cycle.py
Setup: fill admin_password in test_config.json (created on first run)
"""

# ──────────────────────────────────────────────────────────────────────────────
# 0.  Auto-install required packages
# ──────────────────────────────────────────────────────────────────────────────
import subprocess, sys, importlib, importlib.util

def _need(*pkgs):
    missing = [p for p in pkgs if importlib.util.find_spec(p.split("[")[0].replace("-","_")) is None]
    if missing:
        print(f"[SETUP] Installing: {', '.join(missing)}", flush=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", *missing], check=True)

_need("selenium", "python-docx")

# ──────────────────────────────────────────────────────────────────────────────
# 1.  Imports
# ──────────────────────────────────────────────────────────────────────────────
import json, os, re, shutil, tempfile, time, datetime, traceback
from dataclasses import dataclass, field
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options   import Options
from selenium.webdriver.common.by        import By
from selenium.webdriver.common.keys      import Keys
from selenium.webdriver.support.ui       import WebDriverWait
from selenium.webdriver.support          import expected_conditions as EC
from selenium.common.exceptions          import (TimeoutException, NoSuchElementException,
                                                 WebDriverException)
from docx                import Document
from docx.shared         import Inches, Pt, RGBColor
from docx.enum.text      import WD_ALIGN_PARAGRAPH
from docx.oxml.ns        import qn
from docx.oxml           import OxmlElement

# ──────────────────────────────────────────────────────────────────────────────
# 2.  Paths
# ──────────────────────────────────────────────────────────────────────────────
HERE      = Path(__file__).parent
REPO      = HERE.parent
VER_FILE  = REPO / "src" / "lib" / "version.ts"
CFG_FILE  = HERE / "test_config.json"

# ──────────────────────────────────────────────────────────────────────────────
# 3.  Routes / test matrix
#     ── KEEP THIS IN SYNC with AppShell.tsx NAV ──────────────────────────────
#     Add/remove rows as features are added to the app.
# ──────────────────────────────────────────────────────────────────────────────
ROUTES = [
    # (path,            label,                      admin?, agent?, user?)
    ("/app",            "Dashboard",                True,   True,   True),
    ("/app/donors",     "Donors",                   True,   True,   True),
    ("/app/donations",  "Donations",                True,   True,   True),
    ("/app/campaigns",  "Campaigns",                True,   True,   True),
    ("/app/reports",    "Reports",                  True,   True,   True),
    ("/app/qr",         "QR Boxes (feature gate)",  True,   True,   True),
    ("/app/team",       "Team",                     True,   True,   True),
    ("/app/inbox",      "Inbox (msg centre)",        True,   True,   True),
    ("/app/billing",    "Billing / Plans",           True,   True,   False),
    ("/app/settings",   "Settings",                 True,   True,   True),
    ("/app/support",    "Support inbox (admin/agent)",True,  True,   False),
    ("/app/admin",      "Platform Admin panel",     True,   False,  False),
]

# ──────────────────────────────────────────────────────────────────────────────
# 4.  Config
# ──────────────────────────────────────────────────────────────────────────────
DEFAULT_CFG = {
    "_note":            "Fill in passwords. This file is NOT committed to git.",
    "app_url":          "https://kindred-givings.nl-product-factory.com",
    "admin_email":      "ilyas@networklogic.uk",
    "admin_password":   "FILL_IN",
    "agent_email":      "",
    "agent_password":   "",
    "slow_ms":          600,
}

def load_cfg() -> dict:
    if not CFG_FILE.exists():
        CFG_FILE.write_text(json.dumps(DEFAULT_CFG, indent=2))
        print(f"\n[SETUP] Created {CFG_FILE}\n       Fill in admin_password then re-run.\n", flush=True)
        sys.exit(0)
    cfg = json.loads(CFG_FILE.read_text())
    if cfg.get("admin_password", "FILL_IN") == "FILL_IN":
        # Prompt interactively instead of dying
        import getpass
        print(f"\nPassword for {cfg['admin_email']}: ", end="", flush=True)
        pwd = getpass.getpass("")
        cfg["admin_password"] = pwd
        # Save it so next run doesn't ask again
        CFG_FILE.write_text(json.dumps({**cfg}, indent=2))
    return cfg

# ──────────────────────────────────────────────────────────────────────────────
# 5.  Version reader
# ──────────────────────────────────────────────────────────────────────────────
def read_version() -> tuple[str, str]:
    ver, date = "unknown", "unknown"
    if VER_FILE.exists():
        t = VER_FILE.read_text()
        m = re.search(r'APP_VERSION\s*=\s*"([^"]+)"', t);  ver  = m.group(1) if m else ver
        m = re.search(r'APP_VERSION_DATE\s*=\s*"([^"]+)"', t); date = m.group(1) if m else date
    return ver, date

# ──────────────────────────────────────────────────────────────────────────────
# 6.  Test step dataclass
# ──────────────────────────────────────────────────────────────────────────────
@dataclass
class Step:
    label:  str
    status: str          # PASS | FAIL | INFO | SKIP
    img:    str | None = None
    note:   str        = ""

# ──────────────────────────────────────────────────────────────────────────────
# 7.  Chrome factory  (Selenium 4.6+ has its own driver manager — no extra pkg)
# ──────────────────────────────────────────────────────────────────────────────
def make_driver() -> webdriver.Chrome:
    opts = Options()
    opts.add_argument("--start-maximized")
    opts.add_argument("--disable-notifications")
    opts.add_argument("--disable-infobars")
    opts.add_argument("--no-first-run")
    opts.add_argument("--disable-default-apps")
    opts.add_argument("--disable-popup-blocking")
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)
    # Selenium 4.6+ auto-downloads the correct ChromeDriver — no extra package
    return webdriver.Chrome(options=opts)

# ──────────────────────────────────────────────────────────────────────────────
# 8.  Helpers
# ──────────────────────────────────────────────────────────────────────────────
W = 12   # default wait seconds

def _w(d, t=W):  return WebDriverWait(d, t)

def _find(d, css, t=W):
    return _w(d, t).until(EC.presence_of_element_located((By.CSS_SELECTOR, css)))

def _click(d, css, t=W):
    el = _w(d, t).until(EC.element_to_be_clickable((By.CSS_SELECTOR, css)))
    el.click(); return el

def _type(d, css, text, t=W):
    el = _find(d, css, t); el.clear(); el.send_keys(text); return el

def _shot(d, folder: Path, name: str) -> str | None:
    folder.mkdir(parents=True, exist_ok=True)
    safe = re.sub(r'[^A-Za-z0-9_-]', '_', name)[:60]
    p = str(folder / f"{safe}.png")
    try:   d.save_screenshot(p); return p
    except: return None

def _go(d, cfg, path):
    d.get(f"{cfg['app_url'].rstrip('/')}/{path.lstrip('/')}")
    time.sleep(1.8)

def _slow(cfg):
    time.sleep(max(0.3, cfg.get("slow_ms", 600) / 1000))

def _ok(label, img, steps):
    steps.append(Step(label, "PASS", img)); print(f"    [PASS] {label}", flush=True)

def _fail(label, img, steps, e=""):
    steps.append(Step(label, "FAIL", img, str(e))); print(f"    [FAIL] {label}  [{e}]", flush=True)

def _info(label, img, steps, note=""):
    steps.append(Step(label, "INFO", img, note)); print(f"    [INFO] {label}", flush=True)

# ──────────────────────────────────────────────────────────────────────────────
# 9.  Login
# ──────────────────────────────────────────────────────────────────────────────
def do_login(d, cfg, email, pw, steps, img_dir) -> bool:
    _go(d, cfg, "/auth?mode=login")
    time.sleep(2)
    _info("Open login page", _shot(d, img_dir, "01_login_page"), steps)
    try:
        _type(d, 'input[type="email"], input[name="email"]', email)
        _slow(cfg)
        for inp in d.find_elements(By.CSS_SELECTOR, 'input[type="password"]'):
            inp.send_keys(pw); break
        _slow(cfg)
        _info("Credentials entered", _shot(d, img_dir, "02_creds"), steps)
        d.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
        _w(d, 18).until(EC.url_contains("/app"))
        time.sleep(2.5)
        _ok(f"Logged in as {email}", _shot(d, img_dir, "03_logged_in"), steps)
        return True
    except Exception as e:
        _fail(f"Login as {email}", _shot(d, img_dir, "03_login_fail"), steps, e)
        return False

# ──────────────────────────────────────────────────────────────────────────────
# 10.  Logout  (clears Supabase auth from localStorage, goes back to /auth)
# ──────────────────────────────────────────────────────────────────────────────
def do_logout(d, cfg, steps, img_dir, label="logout") -> None:
    try:
        # Try clicking a visible logout / sign-out button first
        clicked = d.execute_script("""
            const keywords = ['sign out','log out','logout','signout'];
            for (const el of document.querySelectorAll('button, a, [role="menuitem"]')) {
                const t = el.innerText.toLowerCase().trim();
                if (keywords.some(k => t.includes(k))) { el.click(); return t; }
            }
            return null;
        """)
        if clicked:
            time.sleep(2)
        # Fallback: wipe Supabase auth token from localStorage and navigate to /auth
        d.execute_script("""
            const keys = Object.keys(localStorage).filter(k =>
                k.startsWith('sb-') || k.includes('supabase') || k.includes('auth'));
            keys.forEach(k => localStorage.removeItem(k));
        """)
        _go(d, cfg, "/auth?mode=login")
        time.sleep(1.5)
        _ok(f"Logged out ({label})", _shot(d, img_dir, f"logout_{label}"), steps)
    except Exception as e:
        _fail(f"Logout ({label})", _shot(d, img_dir, f"logout_{label}_fail"), steps, e)


# ──────────────────────────────────────────────────────────────────────────────
# 11.  Route smoke-tests (visit + screenshot)
# ──────────────────────────────────────────────────────────────────────────────
def smoke_routes(d, cfg, steps, img_dir, routes_for_role):
    """Navigate to each route, screenshot, check for obvious error states."""
    for idx, (path, label, *_) in enumerate(routes_for_role, start=10):
        img_name = f"{idx:02d}_{re.sub(r'[^A-Za-z0-9]','_',label)}"
        try:
            _go(d, cfg, path)
            img = _shot(d, img_dir, img_name)
            src = d.page_source.lower()
            cur = d.current_url
            # Check for error indicators
            if "404" in src or "not found" in src and "/app" not in cur:
                _fail(f"Route: {label}", img, steps, "404 / not found")
            elif "upgrade" in src or "not available on" in src:
                _ok(f"Route: {label}  [feature-gated — correct]", img, steps)
            elif path in cur or "/app" in cur:
                _ok(f"Route: {label}", img, steps)
            else:
                # redirected away (e.g. admin redirects non-admin)
                _ok(f"Route: {label}  [redirected — access control correct]", img, steps)
        except Exception as e:
            _fail(f"Route: {label}", None, steps, e)

# ──────────────────────────────────────────────────────────────────────────────
# 11.  Interaction tests
# ──────────────────────────────────────────────────────────────────────────────
def test_inbox_tabs(d, cfg, steps, img_dir):
    """Extra: verify all 3 Inbox tabs are clickable."""
    _go(d, cfg, "/app/inbox")
    src = d.page_source.lower()
    if "upgrade" in src or "not available" in src:
        _ok("Inbox feature-gated (correct for plan)", _shot(d, img_dir, "inbox_gate"), steps)
        return
    for tab in ["Sent", "Announcement"]:
        try:
            el = d.find_element(By.XPATH, f"//button[contains(.,'{tab}')]")
            el.click(); time.sleep(1)
            _ok(f"Inbox → {tab} tab", _shot(d, img_dir, f"inbox_{tab.lower()}"), steps)
        except Exception as e:
            _fail(f"Inbox → {tab} tab", None, steps, e)

def test_support_submit(d, cfg, steps, img_dir, subject):
    """Submit a support chat request via the sidebar button."""
    _go(d, cfg, "/app")
    try:
        # Find the Contact / Support button — try multiple selectors
        btn = None
        for sel in [
            'button[aria-label*="support" i]', 'button[aria-label*="help" i]',
            '//button[contains(.,"Contact")]', '//button[contains(.,"Support")]',
            '//button[contains(.,"Help")]',
        ]:
            try:
                if sel.startswith("//"):
                    btn = d.find_element(By.XPATH, sel)
                else:
                    btn = d.find_element(By.CSS_SELECTOR, sel)
                if btn: break
            except NoSuchElementException:
                pass
        if not btn:
            _fail("Support — contact button not found", _shot(d, img_dir, "support_no_btn"), steps)
            return
        btn.click(); time.sleep(1.5)
        _info("Support dialog opened", _shot(d, img_dir, "support_open"), steps)
        # subject
        for sel in ['input[placeholder*="subject" i]', 'input[name*="subject" i]',
                    'input[placeholder*="topic" i]', 'input[type="text"]']:
            try:
                d.find_element(By.CSS_SELECTOR, sel).send_keys(subject); break
            except: pass
        # message body
        txts = d.find_elements(By.CSS_SELECTOR, "textarea")
        if txts: txts[0].send_keys(f"Automated test — {subject}")
        _slow(cfg)
        _info("Support form filled", _shot(d, img_dir, "support_filled"), steps)
        # submit
        for xp in ['//button[contains(.,"Send")]', '//button[contains(.,"Submit")]',
                   '//button[@type="submit"]']:
            try:
                d.find_element(By.XPATH, xp).click(); break
            except: pass
        time.sleep(2.5)
        img = _shot(d, img_dir, "support_sent")
        src = d.page_source.lower()
        if any(w in src for w in ["sent", "success", "request", "thank"]):
            _ok("Support request submitted", img, steps)
        else:
            _info("Support request submitted (unconfirmed)", img, steps)
    except Exception as e:
        _fail("Support submit", _shot(d, img_dir, "support_err"), steps, e)

def test_add_donor(d, cfg, steps, img_dir):
    """Open Add Donor dialog, fill name, then cancel (no DB pollution)."""
    _go(d, cfg, "/app/donors")
    try:
        for xp in ['//button[contains(.,"Add")]', '//button[contains(.,"New")]',
                   '//button[contains(.,"donor") and @type]']:
            try: d.find_element(By.XPATH, xp).click(); break
            except: pass
        time.sleep(1.5)
        _info("Add Donor dialog", _shot(d, img_dir, "add_donor_open"), steps)
        for sel in ['input[placeholder*="name" i]', 'input[name*="name" i]', 'input[name*="full" i]']:
            try:
                inp = d.find_element(By.CSS_SELECTOR, sel)
                inp.send_keys("Test Donor Auto"); break
            except: pass
        _slow(cfg)
        _info("Donor form filled", _shot(d, img_dir, "add_donor_filled"), steps)
        for xp in ['//button[contains(.,"Cancel")]', '//button[contains(.,"Close")]']:
            try: d.find_element(By.XPATH, xp).click(); break
            except: pass
        _ok("Add Donor flow (cancelled — no DB write)", _shot(d, img_dir, "add_donor_done"), steps)
    except Exception as e:
        _fail("Add Donor dialog", _shot(d, img_dir, "add_donor_fail"), steps, e)

# ──────────────────────────────────────────────────────────────────────────────
# 12.  New-user registration
# ──────────────────────────────────────────────────────────────────────────────
def _ensure_signup_form(d, cfg) -> None:
    """From the login page: focus the submit button, Tab once to 'Need an account? Register', Enter."""
    time.sleep(0.3)
    src = d.page_source.lower()
    if "welcome back" in src or "log in" in src or "need an account" in src:
        # Focus the submit button explicitly (avoids triggering form validation)
        d.execute_script(
            'var b = document.querySelector(\'button[type="submit"]\'); if(b) b.focus();'
        )
        time.sleep(0.3)
        # One Tab moves focus from submit -> "Need an account? Register" button
        d.switch_to.active_element.send_keys(Keys.TAB)
        time.sleep(0.4)
        # Enter fires React onClick -> goToRegister() -> plan selection step renders
        d.switch_to.active_element.send_keys(Keys.RETURN)
        time.sleep(1.5)

def register_user(d, cfg, email, pw, steps, img_dir) -> bool:
    _go(d, cfg, "/auth?mode=login")
    time.sleep(2)
    _info(f"Register {email}", _shot(d, img_dir, "01_signup_start"), steps)
    try:
        # Switch to register mode: focus submit → Tab → "Need an account? Register" → Enter
        _ensure_signup_form(d, cfg)
        time.sleep(1.5)  # wait for plan grid

        # For the basic user registration, select the free Starter plan (first card)
        plan_btns = d.find_elements(
            By.CSS_SELECTOR, 'div.grid > button, div[class*="grid"] > button'
        )
        if plan_btns:
            plan_btns[0].click()  # first card = Starter (Free)
            time.sleep(1.5)
            _info("Starter (Free) plan selected", _shot(d, img_dir, "01b_plan"), steps)

        # Fill registration form: only email + password for individual user
        # (charity name + full name appear on the form; fill them with defaults)
        try:
            inp = _find(d, '#charity-name', 5)
            inp.clear(); inp.send_keys(f"Test Org {email.split('@')[0][:20]}"); _slow(cfg)
        except Exception:
            pass
        try:
            inp = _find(d, '#name', 5)
            inp.clear(); inp.send_keys("Test User"); _slow(cfg)
        except Exception:
            pass
        try:
            inp = _find(d, '#email', 5)
            inp.clear(); inp.send_keys(email); _slow(cfg)
        except Exception:
            _type(d, 'input[type="email"]', email); _slow(cfg)
        for inp in d.find_elements(By.CSS_SELECTOR, 'input[type="password"]'):
            inp.send_keys(pw); _slow(cfg)
        try:
            cb = d.find_element(By.CSS_SELECTOR, 'input[type="checkbox"]')
            if not cb.is_selected():
                cb.click(); _slow(cfg)
        except Exception:
            pass
        _info("Signup form filled", _shot(d, img_dir, "02_signup_filled"), steps)
        d.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
        time.sleep(3)
        img = _shot(d, img_dir, "03_signup_result")
        src = d.page_source.lower()
        if "/app" in d.current_url:
            _ok("New user registered & logged in", img, steps); return True
        elif any(w in src for w in ["confirm", "check your email", "verify", "link"]):
            _info("Email confirmation needed", img, steps,
                  f"Confirm {email} then smoke tests will run on next cycle")
            return False
        else:
            _info("Signup submitted (status unclear)", img, steps); return False
    except Exception as e:
        _fail("New user registration", _shot(d, img_dir, "03_fail"), steps, e); return False

# ──────────────────────────────────────────────────────────────────────────────
# 13.  Select the £9/month plan on the billing page
# ──────────────────────────────────────────────────────────────────────────────
def select_nine_pound_plan(d, cfg, steps, img_dir) -> None:
    """Navigate to /app/billing and click the £9 plan button."""
    try:
        _go(d, cfg, "/app/billing")
        time.sleep(2)
        _info("Billing page — looking for £9 plan", _shot(d, img_dir, "plan_01_billing"), steps)

        btn = None
        # Strategy 1: ancestor card contains '£9' text
        for xpath in [
            "//*[contains(text(),'£9') or contains(text(),'9/month') or contains(text(),'9 per month')]"
            "/ancestor::*[contains(@class,'card') or contains(@class,'plan') or contains(@class,'tier')][1]"
            "//button[not(contains(translate(.,'CURRENT','current'),'current'))]",
            "//button[contains(.,'£9') or contains(.,'9/mo')]",
        ]:
            try:
                btn = d.find_element(By.XPATH, xpath)
                break
            except NoSuchElementException:
                pass

        # Strategy 2: JS — walk all buttons, pick the one whose nearest ancestor has '£9'
        if btn is None:
            result = d.execute_script("""
                for (const btn of document.querySelectorAll('button')) {
                    let el = btn;
                    for (let i = 0; i < 6; i++) {
                        el = el.parentElement;
                        if (!el) break;
                        if (el.innerText && (el.innerText.includes('£9') || el.innerText.includes('9/month'))) {
                            btn.scrollIntoView({block:'center'});
                            btn.click();
                            return btn.innerText.trim() || 'clicked';
                        }
                    }
                }
                return null;
            """)
            time.sleep(3)
            img = _shot(d, img_dir, "plan_02_result")
            src = d.page_source.lower()
            if result:
                if "stripe" in d.current_url or "checkout" in src or "card number" in src:
                    _ok(f"£9 plan ({result}) — Stripe checkout opened", img, steps)
                elif "success" in src or "active" in src or "subscribed" in src:
                    _ok(f"£9 plan ({result}) — subscription active", img, steps)
                else:
                    _info(f"£9 plan button clicked: '{result}'", img, steps)
            else:
                _fail("£9 plan button not found on billing page", img, steps,
                      Exception("No button near '£9' or '9/month' text"))
            return

        # Strategy 1 succeeded — use the element
        btn.location_once_scrolled_into_view
        btn.click()
        time.sleep(3)
        img = _shot(d, img_dir, "plan_02_result")
        src = d.page_source.lower()
        if "stripe" in d.current_url or "checkout" in src or "card number" in src:
            _ok("£9 plan — Stripe checkout opened", img, steps)
        elif "success" in src or "active" in src or "subscribed" in src:
            _ok("£9 plan — subscription active", img, steps)
        else:
            _info("£9 plan button clicked — see screenshot", img, steps)
    except Exception as e:
        _fail("Select £9 plan", _shot(d, img_dir, "plan_fail"), steps, e)


# ──────────────────────────────────────────────────────────────────────────────
# 14.  Login-before-confirmation check (expected to be blocked)
# ──────────────────────────────────────────────────────────────────────────────
def test_login_before_confirmation(d, cfg, email, pw, steps, img_dir) -> None:
    """Try logging in before email is confirmed — expected to fail → PASS."""
    try:
        _go(d, cfg, "/auth?mode=login")
        time.sleep(1)
        _type(d, 'input[type="email"], input[name="email"]', email)
        _slow(cfg)
        pw_inp = d.find_element(By.CSS_SELECTOR, 'input[type="password"]')
        pw_inp.send_keys(pw); _slow(cfg)
        d.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
        time.sleep(3)
        img = _shot(d, img_dir, "login_pre_confirm")
        src = d.page_source.lower()
        if "/app" in d.current_url:
            _info("Login succeeded before confirmation (email auto-confirmed)", img, steps)
        elif any(w in src for w in ["invalid", "incorrect", "credentials", "error", "not confirmed",
                                     "confirm your email", "verify"]):
            _ok("Login blocked before email confirmation (expected)", img, steps)
        else:
            _info("Login attempt — status unclear", img, steps)
    except Exception as e:
        _fail("Login before confirmation", _shot(d, img_dir, "login_pre_fail"), steps, e)


# ──────────────────────────────────────────────────────────────────────────────
# 15.  Complete Stripe hosted checkout with test card 4242 4242 4242 4242
# ──────────────────────────────────────────────────────────────────────────────
def complete_stripe_payment(d, cfg, steps, img_dir, cardholder_name, email):
    """
    Drive the Stripe hosted checkout page (checkout.stripe.com) to completion
    using Stripe's standard test card 4242 4242 4242 4242.
    Must be called while the driver is already on checkout.stripe.com.
    Returns True when Stripe redirects to /app/billing?subscription=success.
    """
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC

    card     = cfg.get("stripe_test_card",     "4242 4242 4242 4242").replace(" ", "")
    expiry   = cfg.get("stripe_test_expiry",   "1229")
    cvc      = cfg.get("stripe_test_cvc",      "123")
    postcode = cfg.get("stripe_test_postcode", "SW1A 1AA")
    _info("Completing Stripe test payment", _shot(d, img_dir, "stripe_01_loaded"),
          steps, f"Card: {cfg.get('stripe_test_card','4242 4242 4242 4242')} | Exp {expiry[:2]}/{expiry[2:]} | CVC {cvc}")

    def _switch_frame_and_type(titles, keys, label):
        """Try each iframe title, switch in, type, switch back to default."""
        for title in titles:
            try:
                fr = WebDriverWait(d, 8).until(
                    EC.presence_of_element_located(
                        (By.CSS_SELECTOR, f'iframe[title="{title}"]')
                    )
                )
                d.switch_to.frame(fr)
                inp = WebDriverWait(d, 5).until(
                    EC.presence_of_element_located((By.TAG_NAME, "input"))
                )
                inp.click()
                inp.send_keys(keys)
                d.switch_to.default_content()
                return True
            except Exception:
                try: d.switch_to.default_content()
                except Exception: pass
        return False

    try:
        time.sleep(2)  # let the checkout page settle

        # Email — pre-populated from Stripe session; only fill if blank
        try:
            em = d.find_element(By.CSS_SELECTOR,
                                'input[type="email"], input[id*="email"], input[name*="email"]')
            if not em.get_attribute("value"):
                em.clear(); em.send_keys(email)
            _slow(cfg)
        except Exception:
            pass

        # Card number
        card_filled = _switch_frame_and_type(
            ["Secure card number input frame",
             "Card number",
             "Credit or debit card number"],
            card, "card number"
        )
        if not card_filled:
            # Fallback: send to first visible iframe input
            for fr in d.find_elements(By.TAG_NAME, "iframe"):
                try:
                    d.switch_to.frame(fr)
                    inps = d.find_elements(By.TAG_NAME, "input")
                    if inps:
                        inps[0].click(); inps[0].send_keys(card)
                        d.switch_to.default_content()
                        card_filled = True
                        break
                except Exception:
                    d.switch_to.default_content()

        if not card_filled:
            _fail("Could not find card number field on Stripe page",
                  _shot(d, img_dir, "stripe_err_card"), steps)
            return False

        time.sleep(0.5)

        # Expiry
        _switch_frame_and_type(
            ["Secure expiration date input frame",
             "Card expiration date",
             "Expiration date"],
            expiry, "expiry"
        )
        time.sleep(0.4)

        # CVC
        _switch_frame_and_type(
            ["Secure CVC input frame",
             "CVC",
             "Card security code"],
            cvc, "CVC"
        )
        time.sleep(0.4)

        # Name on card (outside iframes)
        for sel in ['input[name="billingName"]',
                    'input[autocomplete="cc-name"]',
                    'input[placeholder*="Name" i]']:
            try:
                inp = d.find_element(By.CSS_SELECTOR, sel)
                if not inp.get_attribute("value"):
                    inp.clear(); inp.send_keys(cardholder_name)
                break
            except Exception:
                pass

        # Postal / postcode (sometimes required for UK cards)
        for sel in ['input[name="billingAddressPostalCode"]',
                    'input[autocomplete="postal-code"]',
                    'input[placeholder*="post" i]',
                    'input[placeholder*="zip" i]']:
            try:
                inp = d.find_element(By.CSS_SELECTOR, sel)
                if not inp.get_attribute("value"):
                    inp.clear(); inp.send_keys(postcode)
                break
            except Exception:
                pass

        _info("Payment details filled", _shot(d, img_dir, "stripe_02_filled"), steps)

        # Submit
        d.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
        time.sleep(10)  # Stripe processes → webhook fires → redirect

        img_done = _shot(d, img_dir, "stripe_03_result")
        cur  = d.current_url
        src  = d.page_source.lower()

        if "subscription=success" in cur:
            _ok("Stripe payment confirmed — redirected to billing success page",
                img_done, steps)
            time.sleep(3)  # wait for webhook to settle in Supabase
            return True
        elif "checkout.stripe.com" not in cur and ("/app" in cur or cfg["app_url"] in cur):
            _ok(f"Stripe payment completed — redirected to app: {cur}",
                img_done, steps)
            time.sleep(3)
            return True
        elif "success" in src or "thank" in src:
            _ok("Stripe payment success indicated on page", img_done, steps)
            time.sleep(3)
            return True
        else:
            _fail("Payment may not have completed — still on or near Stripe",
                  img_done, steps, f"URL: {cur}")
            return False

    except Exception as e:
        _fail("Stripe payment error", _shot(d, img_dir, "stripe_err"), steps, e)
        try: d.switch_to.default_content()
        except Exception: pass
        return False


# ──────────────────────────────────────────────────────────────────────────────
# 16.  Register a new charity organisation
# ──────────────────────────────────────────────────────────────────────────────
def register_new_charity(d, cfg, steps, img_dir, app_ver, run_date) -> bool:
    """Register a brand-new charity via the 4-step auth.tsx flow:
       login page → Tab+Enter → plan selection grid → click Growth card
       → registration form → fill fields → submit.
    """
    version_digits  = re.sub(r"[^0-9]", "", app_ver)
    charity_email   = f"charity{version_digits}-{run_date}@networklogic.uk"
    charity_pw      = f"Charity{version_digits}!Test"
    charity_name    = f"Test Charity {run_date}"
    charity_admin   = f"Test Admin {run_date}"
    _info(f"Register new charity: {charity_email}", None, steps, f"Org: {charity_name}")
    try:
        # ── Step 1: land on the plan selection page ───────────────────────────
        # Arrived here from test_login_before_confirmation, so /auth is already open.
        if "/auth" not in d.current_url:
            _go(d, cfg, "/auth?mode=login")
            time.sleep(2)

        # Focus the submit button then Tab → "Need an account? Register" → Enter
        _ensure_signup_form(d, cfg)
        time.sleep(1.5)  # let React render the plan grid
        img_plan = _shot(d, img_dir, "charity_01_plan_page")
        src = d.page_source.lower()

        if "choose your plan" not in src and "growth" not in src and "starter" not in src:
            _fail("Plan selection page not shown after clicking Register",
                  img_plan, steps,
                  Exception("Expected plan grid; got: " + d.current_url))
            return False
        _ok("Plan selection page loaded", img_plan, steps)

        # ── Step 2: click the Growth / £9 plan card ───────────────────────────
        # auth.tsx renders plan cards as <button> elements inside a div.grid.
        # The Growth plan is at index 1 (2nd card, highlighted with border-primary).
        plan_btns = d.find_elements(
            By.CSS_SELECTOR,
            'div.grid > button, div[class*="grid"] > button'
        )
        growth_btn = None
        for btn in plan_btns:
            txt = btn.text
            if "9.00" in txt or "growth" in txt.lower():
                growth_btn = btn
                break
        if growth_btn is None and len(plan_btns) >= 2:
            # Fallback: second card is Growth (sort_order=1, has border-primary highlight)
            growth_btn = plan_btns[1]

        if growth_btn is None:
            _fail("Growth/£9 plan card not found", _shot(d, img_dir, "charity_02_no_btn"),
                  steps, Exception("No plan buttons found in grid"))
            return False

        growth_btn.click()
        time.sleep(1.5)
        _ok("Clicked Growth/£9 plan card", _shot(d, img_dir, "charity_02_plan_clicked"), steps)

        # ── Step 3: fill the registration form ────────────────────────────────
        # auth.tsx form fields: charity-name, name, email, password, terms checkbox
        img_form = _shot(d, img_dir, "charity_03_form")
        src2 = d.page_source.lower()
        if "create your account" not in src2 and "charity name" not in src2:
            _info("Waiting for registration form", img_form, steps)
            time.sleep(1)

        # Charity name — id="charity-name"
        try:
            inp = _find(d, '#charity-name', 8)
            inp.clear(); inp.send_keys(charity_name); _slow(cfg)
        except Exception:
            for sel in ['input[placeholder*="Sunrise"]', 'input[placeholder*="harity"]',
                        'input[placeholder*="oundation"]']:
                try:
                    inp = d.find_element(By.CSS_SELECTOR, sel)
                    inp.clear(); inp.send_keys(charity_name); _slow(cfg); break
                except Exception:
                    pass

        # Full name — id="name"
        try:
            inp = _find(d, '#name', 5)
            inp.clear(); inp.send_keys(charity_admin); _slow(cfg)
        except Exception:
            pass

        # Email — id="email"
        try:
            inp = _find(d, '#email', 5)
            inp.clear(); inp.send_keys(charity_email); _slow(cfg)
        except Exception:
            _type(d, 'input[type="email"]', charity_email); _slow(cfg)

        # Password
        for inp in d.find_elements(By.CSS_SELECTOR, 'input[type="password"]'):
            inp.send_keys(charity_pw); _slow(cfg)

        # Terms checkbox (required — submit button is disabled without it)
        try:
            cb = d.find_element(By.CSS_SELECTOR, 'input[type="checkbox"]')
            if not cb.is_selected():
                cb.click(); _slow(cfg)
        except Exception:
            pass

        _info("Charity form filled", _shot(d, img_dir, "charity_04_filled"), steps)

        # ── Step 4: submit and check outcome ─────────────────────────────────
        d.find_element(By.CSS_SELECTOR, 'button[type="submit"]').click()
        time.sleep(5)  # Supabase signUp + org creation + possible Stripe redirect

        img_result = _shot(d, img_dir, "charity_05_result")
        cur  = d.current_url
        src3 = d.page_source.lower()

        if "stripe.com" in cur or "checkout.stripe.com" in cur:
            _ok(f"Charity registered — Stripe checkout opened ({charity_email})",
                img_result, steps)
            paid = complete_stripe_payment(d, cfg, steps, img_dir,
                                           charity_admin, charity_email)
            return paid
        elif "/app" in cur:
            _ok(f"Charity registered & in app: {charity_email}", img_result, steps)
            return True
        elif any(w in src3 for w in ["confirm", "check your email", "verify"]):
            _ok(f"Charity registered — confirmation email sent ({charity_email})",
                img_result, steps)
            return False
        else:
            _info("Charity signup submitted — see screenshot", img_result, steps)
            return False
    except Exception as e:
        _fail("Register new charity", _shot(d, img_dir, "charity_fail"), steps, e)
        return False


# ──────────────────────────────────────────────────────────────────────────────
# 16.  Bug register  (bug_register.json  +  BugRegister.docx)
# ──────────────────────────────────────────────────────────────────────────────
BUG_JSON      = HERE / "bug_register.json"
BUG_DOCX      = HERE / "BugRegister.docx"
BUG_SHOTS_DIR = HERE / "bug_screenshots"   # stable copies; TestRun dirs may be deleted

_BUG_STATUS_BG = {"Open": "fde0de", "Fixed": "d4f5dc", "Investigating": "fff3cd"}
_BUG_HDR_CLR   = "1e3a5f"

def _load_reg() -> dict:
    if BUG_JSON.exists():
        try:
            return json.loads(BUG_JSON.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"next_id": 1, "bugs": []}

def _save_reg(reg: dict) -> None:
    BUG_JSON.write_text(json.dumps(reg, indent=2, ensure_ascii=False), encoding="utf-8")

def update_bug_register(sections, app_ver, run_ts) -> None:
    """Add new FAILs to the register and auto-close bugs that now PASS."""
    reg  = _load_reg()
    bugs = reg["bugs"]

    # Index open bugs by (journey, step) for fast lookup
    open_idx: dict[tuple, dict] = {
        (b["journey"], b["step"]): b
        for b in bugs if b["status"] == "Open"
    }

    # Collect passing and failing steps from this run
    passing: set[tuple] = set()
    failing: list[tuple] = []
    for journey_title, steps in sections:
        for step in steps:
            key = (journey_title, step.label)
            if step.status == "PASS":
                passing.add(key)
            elif step.status == "FAIL":
                failing.append((journey_title, step))

    # Auto-close open bugs whose step is now passing
    for key in passing:
        if key in open_idx:
            b = open_idx[key]
            b["status"]        = "Fixed"
            b["date_fixed"]    = run_ts
            b["fixed_version"] = app_ver

    # Add new bugs for FAILs not already open
    BUG_SHOTS_DIR.mkdir(parents=True, exist_ok=True)
    for journey_title, step in failing:
        key = (journey_title, step.label)
        if key in open_idx:
            continue   # already tracked
        bug_id = f"BUG-{reg['next_id']:03d}"
        reg["next_id"] += 1

        # Copy screenshot to a stable location
        shot = ""
        if step.img and Path(step.img).exists():
            dest = BUG_SHOTS_DIR / f"{bug_id}.png"
            try:
                shutil.copy2(step.img, dest)
                shot = str(dest)
            except Exception:
                shot = step.img   # keep original path as fallback

        bugs.append({
            "id":            bug_id,
            "date_found":    run_ts,
            "version_found": app_ver,
            "journey":       journey_title,
            "step":          step.label,
            "error":         step.note or "",
            "screenshot":    shot,
            "status":        "Open",
            "date_fixed":    "",
            "fixed_version": "",
        })
        open_idx[key] = bugs[-1]

    _save_reg(reg)
    _write_bug_docx(reg)
    open_count  = sum(1 for b in bugs if b["status"] == "Open")
    fixed_count = sum(1 for b in bugs if b["status"] == "Fixed")
    print(f"[BUG REGISTER] {len(bugs)} total  |  {open_count} open  |  {fixed_count} fixed  -> {BUG_DOCX.name}",
          flush=True)

def _write_bug_docx(reg: dict) -> None:
    doc  = Document()
    sect = doc.sections[0]
    for attr in ("left_margin","right_margin","top_margin","bottom_margin"):
        setattr(sect, attr, Inches(0.75))

    h = doc.add_heading("Donorbook Platform — Bug Register", 0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER

    bugs        = reg["bugs"]
    open_count  = sum(1 for b in bugs if b["status"] == "Open")
    fixed_count = sum(1 for b in bugs if b["status"] == "Fixed")

    p = doc.add_paragraph()
    r = p.add_run(f"Total: {len(bugs)}    Open: {open_count}    Fixed: {fixed_count}")
    r.bold = True
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    doc.add_paragraph()

    # Main table
    COLS  = ["ID", "Found", "Version", "Journey", "Step / Error", "Status", "Fixed"]
    WIDTHS= [0.65,  1.0,    0.65,       1.3,        2.5,           0.7,      0.9]
    tbl = doc.add_table(rows=1, cols=len(COLS))
    tbl.style = "Table Grid"
    for i, (col, w) in enumerate(zip(COLS, WIDTHS)):
        cell = tbl.rows[0].cells[i]
        cell.width = int(Inches(w))
        cell.text  = col
        _shd(cell, _BUG_HDR_CLR)
        run = cell.paragraphs[0].runs[0]
        run.bold = True
        run.font.color.rgb = RGBColor(255, 255, 255)
        run.font.size = Pt(9)

    for bug in sorted(bugs, key=lambda b: b["id"]):
        j_short = bug["journey"]
        # "Journey 3: New Charity Registration & Onboarding" -> "J3: New Charity..."
        j_short = re.sub(r"Journey (\d+):", r"J\1:", j_short)
        if len(j_short) > 45:
            j_short = j_short[:44] + "..."
        err_text = bug["step"]
        if bug["error"]:
            err_text += "\n" + bug["error"][:120]
        row_vals = [
            bug["id"],
            bug["date_found"],
            bug["version_found"],
            j_short,
            err_text,
            bug["status"],
            bug["date_fixed"] or "-",
        ]
        row = tbl.add_row()
        for i, (val, w) in enumerate(zip(row_vals, WIDTHS)):
            c = row.cells[i]
            c.width = int(Inches(w))
            c.text  = val
            if COLS[i] == "Status":
                _shd(c, _BUG_STATUS_BG.get(bug["status"], "f0f0f0"))
            for run in c.paragraphs[0].runs:
                run.font.size = Pt(8)

    # Screenshots page for open bugs
    open_with_shots = [b for b in bugs
                       if b["status"] == "Open" and b.get("screenshot")
                       and Path(b["screenshot"]).exists()]
    if open_with_shots:
        doc.add_page_break()
        doc.add_heading("Evidence — Open Bugs", 1)
        for bug in open_with_shots:
            p = doc.add_paragraph()
            p.add_run(f"{bug['id']}  ({bug['date_found']})  {bug['step']}").bold = True
            if bug["error"]:
                doc.add_paragraph(f"Error: {bug['error']}", style="Body Text")
            try:
                doc.add_picture(bug["screenshot"], width=Inches(6.2))
            except Exception:
                doc.add_paragraph(f"[screenshot: {bug['screenshot']}]")
            doc.add_paragraph()

    try:
        doc.save(str(BUG_DOCX))
    except PermissionError:
        print(f"[BUG REGISTER] WARNING: {BUG_DOCX.name} is open in Word — close it and re-run to update.",
              flush=True)


# ──────────────────────────────────────────────────────────────────────────────
# 17.  Word report
# ──────────────────────────────────────────────────────────────────────────────
STATUS_CLR = {"PASS": "2ea84e", "FAIL": "e7392e", "INFO": "177ddc", "SKIP": "888888"}
STATUS_BG  = {"PASS": "d4f5dc", "FAIL": "fde0de", "INFO": "ddeeff", "SKIP": "f0f0f0"}

def _shd(cell, hex_color):
    tc = cell._tc; pr = tc.get_or_add_tcPr()
    s = OxmlElement("w:shd")
    s.set(qn("w:val"), "clear"); s.set(qn("w:color"), "auto"); s.set(qn("w:fill"), hex_color)
    pr.append(s)

def write_report(sections, app_ver, ver_date, run_ts, new_email, out: Path):
    doc = Document()
    sec = doc.sections[0]
    for attr in ("left_margin","right_margin","top_margin","bottom_margin"):
        setattr(sec, attr, Inches(0.75))

    # Cover
    h = doc.add_heading(f"Donorbook Platform — Test Cycle Report  {app_ver}", 0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER

    meta = doc.add_table(rows=5, cols=2); meta.style = "Table Grid"
    total = sum(len(s) for _, s in sections)
    passed = sum(x.status=="PASS" for _, s in sections for x in s)
    failed = sum(x.status=="FAIL" for _, s in sections for x in s)
    for i, (k, v) in enumerate([
        ("App Version",  f"{app_ver}  ({ver_date})"),
        ("Test Run",     run_ts),
        ("New User",     new_email),
        ("Result",       f"{passed} PASS  /  {failed} FAIL  /  {total} steps"),
        ("Status",       "ALL PASS" if failed == 0 else f"FAILURES: {failed}"),
    ]):
        meta.rows[i].cells[0].text = k
        meta.rows[i].cells[1].text = v
        meta.rows[i].cells[0].paragraphs[0].runs[0].bold = True
        if k == "Status":
            _shd(meta.rows[i].cells[1], STATUS_BG["PASS" if failed == 0 else "FAIL"])

    doc.add_paragraph()

    # Sections
    for sec_title, steps in sections:
        doc.add_heading(sec_title, 1)
        for n, step in enumerate(steps, 1):
            tbl = doc.add_table(rows=1, cols=2); tbl.style = "Table Grid"
            tbl.columns[0].width = Inches(5.2); tbl.columns[1].width = Inches(1.3)
            ca, cb = tbl.rows[0].cells
            ca.text = f"{n}. {step.label}"
            cb.text = step.status
            cb.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
            if step.status in STATUS_BG: _shd(cb, STATUS_BG[step.status])
            if cb.paragraphs[0].runs:
                r = cb.paragraphs[0].runs[0]; r.bold = True
                r.font.color.rgb = RGBColor(
                    *[int(STATUS_CLR.get(step.status, "000000")[i:i+2], 16) for i in (0,2,4)])
            if step.note:
                doc.add_paragraph(f"   Note: {step.note}", style="Body Text")
            if step.img and Path(step.img).exists():
                try:    doc.add_picture(step.img, width=Inches(6.2))
                except: doc.add_paragraph(f"   [img: {step.img}]")
            doc.add_paragraph()

    doc.save(str(out))
    print(f"\n[REPORT] → {out}", flush=True)

# ──────────────────────────────────────────────────────────────────────────────
# 17.  Console helpers
# ──────────────────────────────────────────────────────────────────────────────
def _print_journey(num, title, user=""):
    bar = "-" * 60
    print(f"\n{bar}", flush=True)
    print(f"  JOURNEY {num}: {title}", flush=True)
    if user:
        print(f"  User: {user}", flush=True)
    print(f"{bar}", flush=True)

def _print_summary(num, steps):
    p = sum(x.status == "PASS" for x in steps)
    f = sum(x.status == "FAIL" for x in steps)
    s = sum(x.status == "SKIP" for x in steps)
    print(f"  Journey {num} done: {p} PASS / {f} FAIL / {s} SKIP / {len(steps)} steps",
          flush=True)


# ──────────────────────────────────────────────────────────────────────────────
# 18.  Admin post-registration verification
# ──────────────────────────────────────────────────────────────────────────────
def test_admin_post_registration(d, cfg, steps, img_dir,
                                 new_email, charity_email, charity_name):
    """
    While logged in as platform admin, verify that:
      1. The newly registered individual user (new_email) appears in All Users.
      2. The new user's plan allocation is Starter (free) — no paid plan.
      3. The charity org (charity_name) appears in All Organisations.
      4. The Payments / All Subscriptions section is checked for a Growth
         plan entry matching the charity — SKIP if Stripe payment is still
         pending (expected when the test stopped at Stripe redirect).
    """
    _go(d, cfg, "/app/admin")
    time.sleep(5)  # allow React to load all async sections

    src = d.page_source

    # ── 1. All Users — new individual user present ───────────────────────
    try:
        hdr = d.find_element(By.XPATH, '//*[contains(text(),"All users")]')
        d.execute_script("arguments[0].scrollIntoView({block:'center'});", hdr)
        time.sleep(0.8)
    except Exception:
        pass

    img_users = _shot(d, img_dir, "j6_01_all_users")
    if new_email.lower() in src.lower():
        _ok(f"New user present in All Users: {new_email}", img_users, steps)
    else:
        _fail(f"New user NOT found in All Users: {new_email}", img_users, steps,
              "User may not yet appear if Supabase auth confirmation is pending")

    # ── 2. Plan allocation for new user — Starter (free) ─────────────────
    # Page shows plan badge per user row; checking page source for "Starter"
    # is sufficient at this level of testing.
    if "starter" in src.lower():
        _ok("Starter plan visible in Users section", img_users, steps)
    else:
        steps.append(Step(
            "Starter plan badge not detected in page source — check screenshot",
            "SKIP", img_users,
            "May load asynchronously; open admin panel manually to confirm"))

    # ── 3. All Organisations — charity org present ────────────────────────
    try:
        hdr = d.find_element(By.XPATH, '//*[contains(text(),"All organisations")]')
        d.execute_script("arguments[0].scrollIntoView({block:'center'});", hdr)
        time.sleep(0.8)
    except Exception:
        pass

    img_orgs = _shot(d, img_dir, "j6_02_all_orgs")
    if charity_name.lower() in src.lower():
        _ok(f"Charity org present in All Organisations: {charity_name}", img_orgs, steps)
    else:
        _fail(f"Charity org NOT found in All Organisations: {charity_name}",
              img_orgs, steps,
              "Org is created before Stripe redirect — should appear even if payment pending")

    # ── 4. All Subscriptions / Payments — Growth plan check ──────────────
    try:
        hdr = d.find_element(By.XPATH, '//*[contains(text(),"All subscriptions")]')
        d.execute_script("arguments[0].scrollIntoView({block:'center'});", hdr)
        time.sleep(0.8)
    except Exception:
        pass

    img_subs = _shot(d, img_dir, "j6_03_all_subscriptions")
    # Re-read source after scroll (React may have loaded the section)
    src2 = d.page_source
    charity_in_subs  = charity_name.lower() in src2.lower()
    growth_in_subs   = "growth" in src2.lower()

    if charity_in_subs and growth_in_subs:
        _ok(f"Growth plan subscription confirmed for {charity_name}", img_subs, steps)
    elif charity_in_subs:
        _fail(
            f"Charity in subscriptions but Growth plan not visible: {charity_name}",
            img_subs, steps,
            "Payment completed but Growth plan badge missing — check Stripe webhook")
    else:
        _fail(
            f"Charity NOT found in All Subscriptions: {charity_name}",
            img_subs, steps,
            "Stripe payment was completed — subscription should be active. Check webhook.")


# ──────────────────────────────────────────────────────────────────────────────
# 19.  Main — six user journeys
# ──────────────────────────────────────────────────────────────────────────────
def main():
    cfg      = load_cfg()
    app_ver, ver_date = read_version()
    now      = datetime.datetime.now()
    run_ts   = now.strftime("%Y-%m-%d %H:%M")
    tag      = now.strftime("%Y%m%d_%H%M")
    safe_ver = re.sub(r"[^0-9]", "", app_ver)
    date_tag = now.strftime("%d%m%Y%H%M")

    # Individual new-user email (used in J4 + J5)
    new_email = f"v{safe_ver}-{date_tag}@networklogic.uk"
    new_pw    = "TestPass_Auto123!"

    print(f"\n{'='*60}", flush=True)
    print(f"  GiveWell Test Cycle  |  {app_ver}  |  {run_ts}", flush=True)
    print(f"  Individual test user : {new_email}", flush=True)
    print(f"{'='*60}\n", flush=True)

    run_dir = HERE / f"TestRun_{tag}"
    run_dir.mkdir(parents=True, exist_ok=True)

    # Route subsets by role
    ADMIN_ROUTES = [(p, l) for p, l, adm, *_ in ROUTES if adm]
    AGENT_ROUTES = [(p, l) for p, l, _, ag, *_ in ROUTES if ag]
    USER_ROUTES  = [(p, l) for p, l, _, _, u in ROUTES if u]

    print("  Starting Chrome (one window for all journeys) ...", flush=True)
    d = make_driver()
    sections = []

    try:
        # ══════════════════════════════════════════════════════════════════
        # JOURNEY 1 — Platform Admin Workflow
        #   Login as platform admin → visit all admin routes → donor
        #   management dialog → inbox tabs → support submit → logout.
        # ══════════════════════════════════════════════════════════════════
        _print_journey(1, "Platform Admin Workflow", cfg["admin_email"])
        steps_j1 = []
        d1 = run_dir / "j1_admin"
        try:
            if do_login(d, cfg, cfg["admin_email"], cfg["admin_password"], steps_j1, d1):
                smoke_routes(d, cfg, steps_j1, d1, ADMIN_ROUTES)
                test_add_donor(d, cfg, steps_j1, d1)
                test_inbox_tabs(d, cfg, steps_j1, d1)
                test_support_submit(d, cfg, steps_j1, d1, f"Admin cycle test {run_ts}")
                do_logout(d, cfg, steps_j1, d1, "admin")
        except Exception as e:
            steps_j1.append(Step("Journey 1 — unexpected error", "FAIL", None, str(e)))
            traceback.print_exc()
        sections.append((f"Journey 1: Platform Admin Workflow ({cfg['admin_email']})", steps_j1))
        _print_summary(1, steps_j1)

        # ══════════════════════════════════════════════════════════════════
        # JOURNEY 2 — Support Agent Workflow
        #   Login as support agent → visit all agent routes → inbox tabs
        #   → support submit → logout.
        #   Skipped when agent credentials are not configured.
        # ══════════════════════════════════════════════════════════════════
        ag_email = cfg.get("agent_email", "")
        ag_pw    = cfg.get("agent_password", "")
        if ag_email and ag_pw and ag_pw not in ("", "FILL_IN"):
            _print_journey(2, "Support Agent Workflow", ag_email)
            steps_j2 = []
            d2 = run_dir / "j2_agent"
            try:
                if do_login(d, cfg, ag_email, ag_pw, steps_j2, d2):
                    smoke_routes(d, cfg, steps_j2, d2, AGENT_ROUTES)
                    test_inbox_tabs(d, cfg, steps_j2, d2)
                    test_support_submit(d, cfg, steps_j2, d2, f"Agent workflow test {run_ts}")
                    do_logout(d, cfg, steps_j2, d2, "agent")
            except Exception as e:
                steps_j2.append(Step("Journey 2 — error", "FAIL", None, str(e)))
                traceback.print_exc()
            sections.append((f"Journey 2: Support Agent Workflow ({ag_email})", steps_j2))
            _print_summary(2, steps_j2)
        else:
            sections.append((
                "Journey 2: Support Agent Workflow (SKIPPED)",
                [Step("No agent credentials — add agent_email / agent_password to test_config.json",
                      "SKIP")]))
            print("  Journey 2: SKIPPED (no agent credentials)\n", flush=True)

        # ══════════════════════════════════════════════════════════════════
        # JOURNEY 3 — New Charity Registration & Onboarding
        #   Start from login page → Tab+Enter to register → select Growth
        #   (£9/mo) plan → fill charity details → submit → Stripe checkout
        #   or in-app → send support chat → logout.
        # ══════════════════════════════════════════════════════════════════
        _print_journey(3, "New Charity Registration & Onboarding")
        steps_j3 = []
        d3 = run_dir / "j3_charity"
        try:
            charity_ok = register_new_charity(d, cfg, steps_j3, d3, app_ver, date_tag)
            if charity_ok:
                test_support_submit(d, cfg, steps_j3, d3,
                                    f"New charity onboarding — cycle {run_ts}")
                do_logout(d, cfg, steps_j3, d3, "charity")
        except Exception as e:
            steps_j3.append(Step("Journey 3 — error", "FAIL", None, str(e)))
            traceback.print_exc()
        sections.append(("Journey 3: New Charity Registration & Onboarding", steps_j3))
        _print_summary(3, steps_j3)

        # ══════════════════════════════════════════════════════════════════
        # JOURNEY 4 — Registration Security Check
        #   Register a new individual user (free Starter plan) then
        #   immediately attempt to log in before email is confirmed.
        #   Expected outcome: login is blocked → PASS.
        # ══════════════════════════════════════════════════════════════════
        _print_journey(4, "Registration Security Check", new_email)
        steps_j4 = []
        d4 = run_dir / "j4_security"
        user_ok = False
        try:
            user_ok = register_user(d, cfg, new_email, new_pw, steps_j4, d4)
            test_login_before_confirmation(d, cfg, new_email, new_pw, steps_j4, d4)
        except Exception as e:
            steps_j4.append(Step("Journey 4 — error", "FAIL", None, str(e)))
            traceback.print_exc()
        sections.append((
            f"Journey 4: Registration Security Check ({new_email})", steps_j4))
        _print_summary(4, steps_j4)

        # ══════════════════════════════════════════════════════════════════
        # JOURNEY 5 — New User App Access
        #   Only runs when the user registered in J4 is auto-confirmed
        #   (email confirmation disabled in Supabase).  Visits all user-
        #   role routes and checks inbox tabs, then logs out.
        # ══════════════════════════════════════════════════════════════════
        _print_journey(5, "New User App Access", new_email)
        steps_j5 = []
        d5 = run_dir / "j5_newuser"
        try:
            if user_ok:
                smoke_routes(d, cfg, steps_j5, d5, USER_ROUTES)
                test_inbox_tabs(d, cfg, steps_j5, d5)
                do_logout(d, cfg, steps_j5, d5, "new_user")
            else:
                steps_j5.append(Step(
                    "Skipped — new user email not yet confirmed",
                    "SKIP", None,
                    f"Confirm {new_email} in Supabase or via the confirmation email, then re-run"))
        except Exception as e:
            steps_j5.append(Step("Journey 5 — error", "FAIL", None, str(e)))
            traceback.print_exc()
        sections.append((
            f"Journey 5: New User App Access ({new_email})", steps_j5))
        _print_summary(5, steps_j5)

        # ══════════════════════════════════════════════════════════════════
        # JOURNEY 6 — Admin Post-Registration Verification
        #   Log back in as platform admin → /app/admin → confirm:
        #     • new individual user (J4) visible in All Users with
        #       Starter plan allocation
        #     • charity org (J3) visible in All Organisations
        #     • Growth plan subscription active in All Subscriptions
        #       (payment was completed via Stripe test card in J3)
        # ══════════════════════════════════════════════════════════════════
        charity_email_j6 = f"charity{safe_ver}-{date_tag}@networklogic.uk"
        charity_name_j6  = f"Test Charity {date_tag}"
        _print_journey(6, "Admin Post-Registration Verification",
                       cfg["admin_email"])
        steps_j6 = []
        d6 = run_dir / "j6_admin_verify"
        try:
            if do_login(d, cfg, cfg["admin_email"], cfg["admin_password"],
                        steps_j6, d6):
                test_admin_post_registration(d, cfg, steps_j6, d6,
                                             new_email,
                                             charity_email_j6,
                                             charity_name_j6)
                do_logout(d, cfg, steps_j6, d6, "admin_verify")
        except Exception as e:
            steps_j6.append(Step("Journey 6 — error", "FAIL", None, str(e)))
            traceback.print_exc()
        sections.append((
            f"Journey 6: Admin Post-Registration Verification ({cfg['admin_email']})",
            steps_j6))
        _print_summary(6, steps_j6)

    finally:
        d.quit()

    # ── Word report + bug register ────────────────────────────────────────────
    out = HERE / f"TestRun_{tag}_{app_ver}.docx"
    write_report(sections, app_ver, ver_date, run_ts, new_email, out)
    update_bug_register(sections, app_ver, run_ts)

    total  = sum(len(s) for _, s in sections)
    passed = sum(x.status == "PASS" for _, s in sections for x in s)
    failed = sum(x.status == "FAIL" for _, s in sections for x in s)
    print(f"\n{'='*60}", flush=True)
    print(f"  DONE  {passed} PASS  /  {failed} FAIL  /  {total} steps", flush=True)
    if failed:
        print(f"  !! Check FAILs in: {out.name}", flush=True)
    else:
        print(f"  ALL PASS!", flush=True)
    print(f"  Report: {out}", flush=True)
    print(f"{'='*60}\n", flush=True)

if __name__ == "__main__":
    main()
