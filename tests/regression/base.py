"""
BaseDriver — Selenium helpers shared by all journey modules.
"""
import os
import time
import base64
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions

import config


def build_driver() -> webdriver.Remote:
    """Create and return a configured WebDriver instance."""
    browser = config.BROWSER.lower()
    if browser == "firefox":
        opts = FirefoxOptions()
        if config.HEADLESS:
            opts.add_argument("--headless")
        driver = webdriver.Firefox(options=opts)
    else:
        from selenium.webdriver.chrome.service import Service as ChromeService
        try:
            from webdriver_manager.chrome import ChromeDriverManager
            service = ChromeService(ChromeDriverManager().install())
        except Exception:
            service = ChromeService()
        opts = ChromeOptions()
        if config.HEADLESS:
            opts.add_argument("--headless=new")
        opts.add_argument("--no-sandbox")
        opts.add_argument("--disable-dev-shm-usage")
        opts.add_argument(f"--window-size={config.WINDOW_WIDTH},{config.WINDOW_HEIGHT}")
        driver = webdriver.Chrome(service=service, options=opts)

    driver.set_page_load_timeout(config.PAGE_LOAD)
    driver.set_window_size(config.WINDOW_WIDTH, config.WINDOW_HEIGHT)
    return driver


class DriverMixin:
    """Mixin providing helpers — attach to test context via self.driver."""

    # ── Navigation ───────────────────────────────────────────────────────────

    def go(self, path: str):
        url = config.BASE_URL.rstrip("/") + path
        self.driver.get(url)

    def url_contains(self, fragment: str, timeout: int | None = None) -> bool:
        t = timeout or config.TIMEOUT
        try:
            WebDriverWait(self.driver, t).until(EC.url_contains(fragment))
            return True
        except TimeoutException:
            return False

    # ── Waiting ──────────────────────────────────────────────────────────────

    def wait_for(self, by: str, value: str, timeout: int | None = None):
        t = timeout or config.TIMEOUT
        return WebDriverWait(self.driver, t).until(
            EC.presence_of_element_located((by, value))
        )

    def wait_visible(self, by: str, value: str, timeout: int | None = None):
        t = timeout or config.TIMEOUT
        return WebDriverWait(self.driver, t).until(
            EC.visibility_of_element_located((by, value))
        )

    def wait_clickable(self, by: str, value: str, timeout: int | None = None):
        t = timeout or config.TIMEOUT
        return WebDriverWait(self.driver, t).until(
            EC.element_to_be_clickable((by, value))
        )

    def wait_text(self, text: str, timeout: int | None = None) -> bool:
        """Wait until *text* appears anywhere in the page body."""
        t = timeout or config.TIMEOUT
        try:
            WebDriverWait(self.driver, t).until(
                lambda d: text.lower() in d.find_element(By.TAG_NAME, "body").text.lower()
            )
            return True
        except TimeoutException:
            return False

    def wait_gone(self, by: str, value: str, timeout: int | None = None) -> bool:
        t = timeout or config.TIMEOUT
        try:
            WebDriverWait(self.driver, t).until(
                EC.invisibility_of_element_located((by, value))
            )
            return True
        except TimeoutException:
            return False

    # ── Interaction ──────────────────────────────────────────────────────────

    def click(self, by: str, value: str):
        el = self.wait_clickable(by, value)
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        el.click()
        return el

    def type_into(self, by: str, value: str, text: str, clear: bool = True):
        el = self.wait_visible(by, value)
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        if clear:
            el.clear()
        el.send_keys(text)
        return el

    def select_by_text(self, by: str, value: str, text: str):
        from selenium.webdriver.support.select import Select
        el = self.wait_visible(by, value)
        Select(el).select_by_visible_text(text)

    def scroll_to_text(self, text: str):
        """Scroll until an element containing text is visible."""
        try:
            el = self.driver.find_element(By.XPATH, f"//*[contains(text(), '{text}')]")
            self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
            time.sleep(0.3)
        except NoSuchElementException:
            pass

    # ── Assertions ───────────────────────────────────────────────────────────

    def assert_text(self, text: str, timeout: int | None = None):
        """Raise AssertionError if text not found in page within timeout."""
        if not self.wait_text(text, timeout):
            body = self.driver.find_element(By.TAG_NAME, "body").text[:400]
            raise AssertionError(f"Expected text not found: '{text}'\nPage snippet: {body}")

    def assert_url(self, fragment: str, timeout: int | None = None):
        if not self.url_contains(fragment, timeout):
            raise AssertionError(f"URL '{self.driver.current_url}' does not contain '{fragment}'")

    def assert_element(self, by: str, value: str, timeout: int | None = None):
        try:
            el = self.wait_for(by, value, timeout)
            return el
        except TimeoutException:
            raise AssertionError(f"Element not found: {by}='{value}'")

    def assert_no_text(self, text: str):
        body = self.driver.find_element(By.TAG_NAME, "body").text
        if text.lower() in body.lower():
            raise AssertionError(f"Unexpected text found on page: '{text}'")

    # ── Auth ─────────────────────────────────────────────────────────────────

    def login(self, email: str, password: str, expect_path: str = "/app"):
        self.go("/sign-in")
        self.wait_visible(By.CSS_SELECTOR, "input[type='email']")
        self.type_into(By.CSS_SELECTOR, "input[type='email']", email)
        self.type_into(By.CSS_SELECTOR, "input[type='password']", password)
        self.click(By.CSS_SELECTOR, "button[type='submit']")
        self.assert_url(expect_path)

    def logout(self):
        """Click user menu then sign out."""
        try:
            # Try avatar / user menu button
            self.click(By.XPATH, "//*[@aria-label='User menu' or @data-testid='user-menu']")
        except Exception:
            # Fallback: look for any button with sign out / log out text
            pass
        try:
            self.click(By.XPATH, "//*[contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'sign out') or contains(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), 'log out')]")
        except Exception:
            self.go("/sign-out")
        self.url_contains("/sign-in", timeout=10)

    # ── Screenshot ───────────────────────────────────────────────────────────

    def screenshot_b64(self) -> str:
        """Return base64-encoded PNG screenshot."""
        return self.driver.get_screenshot_as_base64()

    def screenshot_file(self, path: str):
        self.driver.save_screenshot(path)

    # ── Misc ─────────────────────────────────────────────────────────────────

    def scroll_to_heading(self, heading_text: str):
        """Scroll admin page to a section heading."""
        try:
            els = self.driver.find_elements(By.TAG_NAME, "h2")
            for el in els:
                if heading_text.lower() in el.text.lower():
                    self.driver.execute_script("arguments[0].scrollIntoView({block:'start'});", el)
                    time.sleep(0.4)
                    return el
        except Exception:
            pass
        return None

    def find_button(self, label: str):
        """Find a button containing label text."""
        return self.wait_clickable(
            By.XPATH,
            f"//button[contains(translate(normalize-space(.), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'), '{label.lower()}')]"
        )

    def click_button(self, label: str):
        el = self.find_button(label)
        self.driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
        el.click()
        return el
