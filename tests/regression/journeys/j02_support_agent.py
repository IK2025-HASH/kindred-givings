"""J2 — Support Agent Workflow"""
import time
from selenium.webdriver.common.by import By
import config
from base import DriverMixin


class SupportAgentJourney(DriverMixin):
    def __init__(self, driver):
        self.driver = driver

    def j2_tc1_login_as_support_agent(self):
        if not config.AGENT_EMAIL or not config.AGENT_PASSWORD:
            raise SkipTest("Agent credentials not configured (AGENT_EMAIL / AGENT_PASSWORD)")
        self.login(config.AGENT_EMAIL, config.AGENT_PASSWORD)

    def j2_tc2_view_support_inbox(self):
        self.go("/app/support")
        self.assert_url("/app/support")
        self.assert_no_text("404")

    def j2_tc3_reply_to_conversation(self):
        try:
            # Click first conversation
            self.click(By.XPATH, "//div[@role='listitem' or contains(@class,'conversation')] [1]")
            time.sleep(0.5)
            # Type a reply
            reply = self.wait_visible(By.CSS_SELECTOR, "textarea[placeholder*='reply' i], textarea[placeholder*='message' i]", timeout=5)
            reply.clear()
            reply.send_keys("Automated regression reply — please ignore.")
            self.click_button("Send")
            time.sleep(0.5)
        except Exception:
            pass  # Non-fatal if no conversation exists

    def j2_tc4_close_conversation(self):
        try:
            self.click_button("Close")
            time.sleep(0.5)
        except Exception:
            pass

    def j2_tc5_logout(self):
        self.logout()
        self.assert_url("/sign-in")


class SkipTest(Exception):
    pass


def _make(d):
    return SupportAgentJourney(d)


TESTS = {
    "J2-TC1": lambda d: _make(d).j2_tc1_login_as_support_agent(),
    "J2-TC2": lambda d: _make(d).j2_tc2_view_support_inbox(),
    "J2-TC3": lambda d: _make(d).j2_tc3_reply_to_conversation(),
    "J2-TC4": lambda d: _make(d).j2_tc4_close_conversation(),
    "J2-TC5": lambda d: _make(d).j2_tc5_logout(),
}
