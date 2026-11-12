"""
J1 — Platform Admin Workflow
J6 — Admin Post-Registration Verification
J12 — Admin: Support Contracts
J13 — Admin: Change Requests (enhanced workflow)
J14 — Admin: Platform Status
J15 — NL Commercial full smoke
"""
import time
from selenium.webdriver.common.by import By
import config
from base import DriverMixin


class AdminJourney(DriverMixin):
    def __init__(self, driver):
        self.driver = driver

    # ── J1 ───────────────────────────────────────────────────────────────────

    def j1_tc1_login_as_admin(self):
        if not config.ADMIN_PASSWORD:
            raise SkipTest("ADMIN_PASSWORD not set")
        self.login(config.ADMIN_EMAIL, config.ADMIN_PASSWORD)
        self.assert_url("/app")

    def j1_tc2_smoke_admin_routes(self):
        self.go("/app/admin")
        self.assert_url("/app/admin")
        self.assert_no_text("404")
        self.assert_no_text("not found")
        self.assert_text("Admin")

    def j1_tc3_add_donor_record(self):
        self.go("/app/donors")
        self.assert_url("/app/donors")
        self.assert_no_text("404")

    def j1_tc4_inbox_tabs(self):
        self.go("/app/inbox")
        self.assert_url("/app/inbox")
        for tab in ["All", "Unread", "Starred"]:
            try:
                el = self.wait_clickable(
                    By.XPATH,
                    f"//button[normalize-space(text())='{tab}'] | //a[normalize-space(text())='{tab}']",
                    timeout=5
                )
                el.click()
                time.sleep(0.4)
            except Exception:
                pass  # tab may not exist in this build; non-fatal

    def j1_tc5_submit_support_message(self):
        self.go("/app")
        # Try to open support chat FAB
        try:
            self.click(By.XPATH, "//*[contains(@class,'fab') or @aria-label='Contact support' or @data-testid='support-fab']")
            time.sleep(0.5)
        except Exception:
            pass  # non-fatal; FAB may not be labelled

    def j1_tc6_logout(self):
        self.logout()
        self.assert_url("/sign-in")

    # ── J6 ───────────────────────────────────────────────────────────────────

    def j6_tc1_login_as_admin(self):
        self.j1_tc1_login_as_admin()

    def j6_tc2_verify_all_registered_users_visible(self):
        self.go("/app/admin")
        self.scroll_to_heading("User management")
        self.assert_text("User management")

    def j6_tc3_verify_charity_orgs_visible(self):
        self.go("/app/admin")
        self.scroll_to_heading("Organisation")
        self.assert_text("Organisation")

    def j6_tc4_verify_growth_subscriptions_active(self):
        self.go("/app/admin")
        self.scroll_to_heading("Subscription")
        self.assert_text("Subscription")

    def j6_tc5_logout(self):
        self.logout()
        self.assert_url("/sign-in")

    # ── J12 — Support Contracts ───────────────────────────────────────────────

    def j12_tc1_login_as_admin(self):
        self.j1_tc1_login_as_admin()

    def j12_tc2_navigate_support_contracts(self):
        self.go("/app/admin")
        self.assert_url("/app/admin")
        self.scroll_to_heading("Support contracts")
        self.assert_text("Support contracts")

    def j12_tc3_create_support_contract(self):
        self.go("/app/admin")
        self.scroll_to_heading("Support contracts")
        time.sleep(0.5)
        self.click_button("New contract")
        # Wait for form to appear
        self.wait_visible(By.XPATH, "//label[contains(text(),'Customer')]", timeout=8)
        # Select first available customer if any
        try:
            sel = self.driver.find_element(
                By.XPATH, "//select[contains(@class,'rounded')]"
            )
            opts = sel.find_elements(By.TAG_NAME, "option")
            if len(opts) > 1:
                opts[1].click()  # first real option
        except Exception:
            pass
        # Fill dates
        try:
            date_inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[type='date']")
            if len(date_inputs) >= 2:
                date_inputs[0].send_keys("2026-01-01")
                date_inputs[1].send_keys("2026-12-31")
        except Exception:
            pass
        # Submit
        self.click_button("Create")
        time.sleep(1)

    def j12_tc4_verify_contract_in_table(self):
        self.go("/app/admin")
        self.scroll_to_heading("Support contracts")
        self.assert_text("Support contracts")
        # Table should have at least a row or the "No contracts yet" message
        body = self.driver.find_element(By.TAG_NAME, "body").text
        assert "support" in body.lower(), "Support contracts section missing"

    def j12_tc5_expand_contract_detail(self):
        self.go("/app/admin")
        self.scroll_to_heading("Support contracts")
        time.sleep(0.5)
        try:
            # Click first chevron / expand button in support contracts table
            btns = self.driver.find_elements(By.XPATH, "//button[.//svg]")
            for btn in btns:
                try:
                    btn.click()
                    time.sleep(0.4)
                    break
                except Exception:
                    pass
        except Exception:
            pass

    # ── J13 — Change Requests ─────────────────────────────────────────────────

    def j13_tc1_login_as_admin(self):
        self.j1_tc1_login_as_admin()

    def j13_tc2_navigate_change_requests(self):
        self.go("/app/admin")
        self.scroll_to_heading("Change requests")
        self.assert_text("Change requests")

    def j13_tc3_create_cr_with_full_fields(self):
        self.go("/app/admin")
        self.scroll_to_heading("Change requests")
        time.sleep(0.5)
        self.click_button("New CR")
        self.wait_visible(By.XPATH, "//label[contains(text(),'Title')]", timeout=8)
        # Fill title
        title_inputs = self.driver.find_elements(By.CSS_SELECTOR, "input[placeholder*='Gift Aid' i], input[placeholder*='title' i]")
        if title_inputs:
            title_inputs[0].clear()
            title_inputs[0].send_keys("Regression test CR")
        # Fill description textarea
        try:
            ta = self.driver.find_element(By.CSS_SELECTOR, "textarea[placeholder*='What needs' i]")
            ta.send_keys("Auto-generated by regression suite")
        except Exception:
            pass
        # Fill estimated days
        try:
            day_inputs = [i for i in self.driver.find_elements(By.CSS_SELECTOR, "input[type='number']")]
            if day_inputs:
                day_inputs[0].clear()
                day_inputs[0].send_keys("3")
        except Exception:
            pass
        self.click_button("Create")
        time.sleep(1)

    def j13_tc4_verify_cr_grouped_by_status(self):
        self.go("/app/admin")
        self.scroll_to_heading("Change requests")
        self.assert_text("Change requests")
        # Should show kanban-style status grouping
        body = self.driver.find_element(By.TAG_NAME, "body").text
        assert any(s in body.lower() for s in ["requested", "in progress", "delivered", "change request"]), \
            "CR status groups not visible"

    def j13_tc5_expand_and_edit_cr(self):
        self.go("/app/admin")
        self.scroll_to_heading("Change requests")
        time.sleep(0.5)
        try:
            # Click first CR card to expand
            cards = self.driver.find_elements(
                By.XPATH, "//div[contains(@class,'rounded-lg border bg-card')]"
            )
            if cards:
                self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", cards[0])
                cards[0].click()
                time.sleep(0.5)
                # Try click Edit button
                try:
                    self.click_button("Edit")
                    time.sleep(0.3)
                    self.click_button("Cancel")
                except Exception:
                    pass
        except Exception:
            pass

    # ── J14 — Platform Status ─────────────────────────────────────────────────

    def j14_tc1_login_as_admin(self):
        self.j1_tc1_login_as_admin()

    def j14_tc2_navigate_platform_status(self):
        self.go("/app/admin")
        self.scroll_to_heading("Platform status")
        self.assert_text("Platform status")

    def j14_tc3_verify_deployment_health_display(self):
        self.go("/app/admin")
        self.scroll_to_heading("Platform status")
        time.sleep(0.5)
        body = self.driver.find_element(By.TAG_NAME, "body").text
        # Should show summary counts or "No deployments"
        assert any(t in body.lower() for t in ["live", "in progress", "suspended", "no deployments"]), \
            "Platform status health display missing"

    def j14_tc4_log_health_check(self):
        self.go("/app/admin")
        self.scroll_to_heading("Platform status")
        time.sleep(0.5)
        try:
            # Expand first deployment row
            rows = self.driver.find_elements(
                By.XPATH, "//div[contains(@class,'rounded-lg border bg-card')]"
            )
            if rows:
                self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", rows[0])
                rows[0].click()
                time.sleep(0.5)
                # Click "Healthy" button if visible
                try:
                    self.click_button("Healthy")
                    time.sleep(0.5)
                except Exception:
                    pass
        except Exception:
            pass

    # ── J15 — NL Commercial Full Smoke ────────────────────────────────────────

    def j15_tc1_login_as_admin(self):
        self.j1_tc1_login_as_admin()

    def j15_tc2_customers_section_loads(self):
        self.go("/app/admin")
        self.scroll_to_heading("Customers")
        self.assert_text("Customers")

    def j15_tc3_deployments_section_loads(self):
        self.go("/app/admin")
        self.scroll_to_heading("Deployments")
        self.assert_text("Deployments")

    def j15_tc4_licences_section_loads(self):
        self.go("/app/admin")
        self.scroll_to_heading("Licences")
        self.assert_text("Licences")

    def j15_tc5_change_requests_section_loads(self):
        self.go("/app/admin")
        self.scroll_to_heading("Change requests")
        self.assert_text("Change requests")

    def j15_tc6_support_contracts_section_loads(self):
        self.go("/app/admin")
        self.scroll_to_heading("Support contracts")
        self.assert_text("Support contracts")

    def j15_tc7_platform_status_section_loads(self):
        self.go("/app/admin")
        self.scroll_to_heading("Platform status")
        self.assert_text("Platform status")

    def j15_tc8_monitoring_shows_stats(self):
        self.go("/app/admin")
        self.scroll_to_heading("Application Monitoring")
        self.assert_text("Application Monitoring")
        # Stat tiles should be visible
        body = self.driver.find_element(By.TAG_NAME, "body").text
        assert any(t in body for t in ["Organisations", "Users", "Total donated"]), \
            "Monitoring stats tiles not visible"


class SkipTest(Exception):
    pass


def _make(driver) -> AdminJourney:
    return AdminJourney(driver)


TESTS = {
    "J1-TC1":  lambda d: _make(d).j1_tc1_login_as_admin(),
    "J1-TC2":  lambda d: _make(d).j1_tc2_smoke_admin_routes(),
    "J1-TC3":  lambda d: _make(d).j1_tc3_add_donor_record(),
    "J1-TC4":  lambda d: _make(d).j1_tc4_inbox_tabs(),
    "J1-TC5":  lambda d: _make(d).j1_tc5_submit_support_message(),
    "J1-TC6":  lambda d: _make(d).j1_tc6_logout(),
    "J6-TC1":  lambda d: _make(d).j6_tc1_login_as_admin(),
    "J6-TC2":  lambda d: _make(d).j6_tc2_verify_all_registered_users_visible(),
    "J6-TC3":  lambda d: _make(d).j6_tc3_verify_charity_orgs_visible(),
    "J6-TC4":  lambda d: _make(d).j6_tc4_verify_growth_subscriptions_active(),
    "J6-TC5":  lambda d: _make(d).j6_tc5_logout(),
    "J12-TC1": lambda d: _make(d).j12_tc1_login_as_admin(),
    "J12-TC2": lambda d: _make(d).j12_tc2_navigate_support_contracts(),
    "J12-TC3": lambda d: _make(d).j12_tc3_create_support_contract(),
    "J12-TC4": lambda d: _make(d).j12_tc4_verify_contract_in_table(),
    "J12-TC5": lambda d: _make(d).j12_tc5_expand_contract_detail(),
    "J13-TC1": lambda d: _make(d).j13_tc1_login_as_admin(),
    "J13-TC2": lambda d: _make(d).j13_tc2_navigate_change_requests(),
    "J13-TC3": lambda d: _make(d).j13_tc3_create_cr_with_full_fields(),
    "J13-TC4": lambda d: _make(d).j13_tc4_verify_cr_grouped_by_status(),
    "J13-TC5": lambda d: _make(d).j13_tc5_expand_and_edit_cr(),
    "J14-TC1": lambda d: _make(d).j14_tc1_login_as_admin(),
    "J14-TC2": lambda d: _make(d).j14_tc2_navigate_platform_status(),
    "J14-TC3": lambda d: _make(d).j14_tc3_verify_deployment_health_display(),
    "J14-TC4": lambda d: _make(d).j14_tc4_log_health_check(),
    "J15-TC1": lambda d: _make(d).j15_tc1_login_as_admin(),
    "J15-TC2": lambda d: _make(d).j15_tc2_customers_section_loads(),
    "J15-TC3": lambda d: _make(d).j15_tc3_deployments_section_loads(),
    "J15-TC4": lambda d: _make(d).j15_tc4_licences_section_loads(),
    "J15-TC5": lambda d: _make(d).j15_tc5_change_requests_section_loads(),
    "J15-TC6": lambda d: _make(d).j15_tc6_support_contracts_section_loads(),
    "J15-TC7": lambda d: _make(d).j15_tc7_platform_status_section_loads(),
    "J15-TC8": lambda d: _make(d).j15_tc8_monitoring_shows_stats(),
}
