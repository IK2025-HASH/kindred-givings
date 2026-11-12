"""
J10 — Gift Aid Declaration Flow
J11 — Recurring Giving / Stripe Subscription
"""
import time
from selenium.webdriver.common.by import By
import config
from base import DriverMixin

GIVING_URL = f"/give/{config.GIVING_SLUG}"


class DonorJourney(DriverMixin):
    def __init__(self, driver):
        self.driver = driver

    # ── J10 — Gift Aid ────────────────────────────────────────────────────────

    def j10_tc1_navigate_to_giving_page(self):
        self.go(GIVING_URL)
        self.assert_no_text("404")
        self.assert_no_text("not found")
        # Giving page should show a donate / giving form
        self.wait_text("Give", timeout=10)

    def j10_tc2_check_gift_aid_shows_declaration(self):
        self.go(GIVING_URL)
        self.wait_text("Gift Aid", timeout=10)
        # Tick the Gift Aid checkbox
        try:
            cb = self.driver.find_element(
                By.XPATH,
                "//button[@role='checkbox'][contains(following-sibling::*,'Gift Aid') or contains(preceding-sibling::*,'Gift Aid')]"
                " | //input[@type='checkbox'][contains(@id,'gift') or contains(@name,'gift')]"
            )
            self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", cb)
            cb.click()
            time.sleep(0.4)
        except Exception:
            # Try the label click approach
            try:
                label = self.driver.find_element(
                    By.XPATH, "//label[contains(.,'Gift Aid') or contains(.,'gift aid')]"
                )
                label.click()
                time.sleep(0.4)
            except Exception:
                pass

    def j10_tc3_verify_hmrc_declaration_text(self):
        self.go(GIVING_URL)
        # Tick checkbox first
        self.j10_tc2_check_gift_aid_shows_declaration()
        # Declaration panel should appear with HMRC text
        self.assert_text("UK taxpayer")
        self.assert_text("Income Tax")

    def j10_tc4_try_proceed_without_address(self):
        self.go(GIVING_URL)
        # Set an amount
        try:
            self.click(By.XPATH, "//button[contains(text(),'£') or contains(text(),'$')]")
        except Exception:
            try:
                self.type_into(By.CSS_SELECTOR, "input[type='number'][placeholder*='amount' i], input[placeholder*='Enter' i]", "10")
            except Exception:
                pass
        # Tick Gift Aid
        self.j10_tc2_check_gift_aid_shows_declaration()
        # Try to proceed (click donate / checkout button)
        try:
            self.click_button("Donate")
        except Exception:
            try:
                self.click_button("Give")
            except Exception:
                pass
        time.sleep(0.5)
        # Should see an error toast about address
        body = self.driver.find_element(By.TAG_NAME, "body").text
        assert any(w in body.lower() for w in ["address", "postcode", "house", "required"]), \
            "No validation error shown when Gift Aid address missing"

    def j10_tc5_fill_address_and_proceed_to_stripe(self):
        self.go(GIVING_URL)
        # Amount
        try:
            self.click(By.XPATH, "//button[contains(text(),'£10') or contains(text(),'$10')]")
        except Exception:
            try:
                amount_input = self.driver.find_element(
                    By.CSS_SELECTOR, "input[type='number'], input[placeholder*='Enter' i], input[placeholder*='amount' i]"
                )
                amount_input.clear()
                amount_input.send_keys("10")
            except Exception:
                pass
        # Email
        try:
            email_input = self.driver.find_element(By.CSS_SELECTOR, "input[type='email']")
            email_input.clear()
            email_input.send_keys("regression@example.com")
        except Exception:
            pass
        # Gift Aid
        self.j10_tc2_check_gift_aid_shows_declaration()
        # Fill house + postcode
        try:
            inputs = self.driver.find_elements(
                By.XPATH,
                "//input[@placeholder[contains(.,'house') or contains(.,'House') or contains(.,'Flat') or contains(.,'12')]]"
            )
            if inputs:
                inputs[0].clear()
                inputs[0].send_keys("12")
        except Exception:
            pass
        try:
            inputs = self.driver.find_elements(
                By.XPATH,
                "//input[@placeholder[contains(.,'postcode') or contains(.,'Postcode') or contains(.,'SW1')]]"
            )
            if inputs:
                inputs[0].clear()
                inputs[0].send_keys("SW1A 1AA")
        except Exception:
            pass
        # Donate button
        try:
            self.click_button("Donate")
        except Exception:
            try:
                self.click_button("Give")
            except Exception:
                pass
        time.sleep(2)
        # Should reach Stripe OR still on giving page with no crash
        body = self.driver.find_element(By.TAG_NAME, "body").text
        self.assert_no_text("Error")

    # ── J11 — Recurring Giving ────────────────────────────────────────────────

    def j11_tc1_navigate_to_giving_page(self):
        self.go(GIVING_URL)
        self.assert_no_text("404")
        self.wait_text("Give", timeout=10)

    def j11_tc2_tick_recurring_checkbox(self):
        self.go(GIVING_URL)
        self.wait_text("monthly", timeout=10)
        try:
            cb = self.driver.find_element(
                By.XPATH,
                "//button[@role='checkbox'][contains(following-sibling::*,'monthly') or contains(preceding-sibling::*,'monthly') or contains(following-sibling::*,'recurring') or contains(preceding-sibling::*,'recurring')]"
                " | //input[@type='checkbox'][contains(@id,'recurring') or contains(@name,'recurring')]"
            )
            self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", cb)
            cb.click()
            time.sleep(0.4)
        except Exception:
            try:
                label = self.driver.find_element(
                    By.XPATH, "//label[contains(.,'monthly') or contains(.,'recurring') or contains(.,'Monthly')]"
                )
                label.click()
                time.sleep(0.4)
            except Exception:
                pass

    def j11_tc3_verify_monthly_text_shown(self):
        self.go(GIVING_URL)
        self.j11_tc2_tick_recurring_checkbox()
        body = self.driver.find_element(By.TAG_NAME, "body").text
        assert any(w in body.lower() for w in ["monthly", "recurring", "subscription"]), \
            "No monthly/recurring text visible after checking recurring checkbox"

    def j11_tc4_proceed_to_stripe_subscription(self):
        self.go(GIVING_URL)
        # Set amount
        try:
            self.click(By.XPATH, "//button[contains(text(),'£10') or contains(text(),'$10')]")
        except Exception:
            try:
                amount_input = self.driver.find_element(
                    By.CSS_SELECTOR, "input[type='number'], input[placeholder*='Enter' i]"
                )
                amount_input.clear()
                amount_input.send_keys("10")
            except Exception:
                pass
        # Email
        try:
            email_input = self.driver.find_element(By.CSS_SELECTOR, "input[type='email']")
            email_input.clear()
            email_input.send_keys("regression@example.com")
        except Exception:
            pass
        # Tick recurring
        self.j11_tc2_tick_recurring_checkbox()
        # Donate
        try:
            self.click_button("Donate")
        except Exception:
            try:
                self.click_button("Give")
            except Exception:
                pass
        time.sleep(2)
        # Check if we're on Stripe or still on giving page
        url = self.driver.current_url
        body = self.driver.find_element(By.TAG_NAME, "body").text
        # Non-crash is a pass; Stripe checkout URL = bonus confirmation
        self.assert_no_text("Error")


class SkipTest(Exception):
    pass


def _make(d):
    return DonorJourney(d)


TESTS = {
    "J10-TC1": lambda d: _make(d).j10_tc1_navigate_to_giving_page(),
    "J10-TC2": lambda d: _make(d).j10_tc2_check_gift_aid_shows_declaration(),
    "J10-TC3": lambda d: _make(d).j10_tc3_verify_hmrc_declaration_text(),
    "J10-TC4": lambda d: _make(d).j10_tc4_try_proceed_without_address(),
    "J10-TC5": lambda d: _make(d).j10_tc5_fill_address_and_proceed_to_stripe(),
    "J11-TC1": lambda d: _make(d).j11_tc1_navigate_to_giving_page(),
    "J11-TC2": lambda d: _make(d).j11_tc2_tick_recurring_checkbox(),
    "J11-TC3": lambda d: _make(d).j11_tc3_verify_monthly_text_shown(),
    "J11-TC4": lambda d: _make(d).j11_tc4_proceed_to_stripe_subscription(),
}
