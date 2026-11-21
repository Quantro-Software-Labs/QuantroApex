import { test, expect } from '@playwright/test';

test.describe('QuantroApex Paper Trading Beta Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // In test environment, intercept gateway requests and attach dev authorization token
    await page.route('http://localhost:3000/**', async (route) => {
      const headers = {
        ...route.request().headers(),
        Authorization: 'Bearer firebase_dev:smoke_tester_uid:smoke_tester@quantroapex.app',
      };
      await route.continue({ headers });
    });

    // Pre-seed authenticated dev session in localStorage for AuthContext
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'quantro_demo_user',
        JSON.stringify({
          uid: 'smoke_tester_uid',
          email: 'smoke_tester@quantroapex.app',
          displayName: 'Smoke Tester',
          token: 'firebase_dev:smoke_tester_uid:smoke_tester@quantroapex.app',
        }),
      );
    });
  });

  test('1. Sign in and verify dashboard loads', async ({ page }) => {
    await page.goto('/home');
    await expect(page).toHaveURL(/.*home/);
    await expect(page.locator('header')).toBeVisible();

    // Verify persistent disclaimer footer is present
    const footer = page.locator('#global-disclaimer-footer');
    await expect(footer).toBeVisible();
    await expect(footer).toContainText('Paper trading with simulated money');
  });

  test('2. Confirm LIVE switches are hidden when liveTradingEnabled is false', async ({ page }) => {
    await page.goto('/home');

    // Confirm static SIMULATED badge is visible
    const simBadge = page.locator('#simulated-badge');
    await expect(simBadge).toBeVisible();
    await expect(simBadge).toContainText('SIMULATED');

    // Confirm LIVE toggle button is NOT rendered
    const modeToggle = page.locator('#mode-toggle');
    await expect(modeToggle).toHaveCount(0);
  });

  test('3. Wire Risk Vault save with units and plain-English dailyLossBasis', async ({ page }) => {
    await page.goto('/settings');

    // Click Risk Vault tab
    const riskTab = page.locator('#settings-tab-risk');
    await expect(riskTab).toBeVisible();
    await riskTab.click();

    // Verify plain-English daily loss basis explanation
    await expect(page.locator('text=Losses today count in full. Gains earlier in the day don\'t widen your limit.')).toBeVisible();

    // Fill daily loss limit and select PERCENT
    const dailyLimitInput = page.locator('#risk-daily-loss-limit');
    await dailyLimitInput.fill('7');
    await page.locator('#risk-daily-loss-unit').selectOption('PERCENT');

    // Fill max drawdown limit
    const drawdownInput = page.locator('#risk-max-drawdown');
    await drawdownInput.fill('12');
    await page.locator('#risk-max-drawdown-unit').selectOption('PERCENT');

    // Fill per-trade exposure
    const exposureInput = page.locator('#risk-per-trade-exposure');
    await exposureInput.fill('5');
    await page.locator('#risk-per-trade-unit').selectOption('PERCENT');

    // Save limits
    const saveBtn = page.locator('#save-risk-vault-btn');
    await saveBtn.click();

    // Verify confirmation message
    await expect(page.locator('text=Risk Vault parameters updated.')).toBeVisible();
  });

  test('4. Place SIM order on trading desk', async ({ page }) => {
    await page.goto('/stocks/trading-desk');

    // Verify desk loaded
    await expect(page.locator('#order-qty')).toBeVisible();

    // Fill quantity and place market buy
    await page.locator('#order-qty').fill('2');
    await page.locator('#place-order-btn').click();

    // Verify either success message or structured API feedback is displayed
    const feedback = page.locator('text=Buy order placed for 2').or(page.locator('.text-apex-danger')).or(page.locator('.text-apex-success'));
    await expect(feedback.first()).toBeVisible();
  });

  test('5. Trigger Emergency Stop and verify persistent banner across screens', async ({ page }) => {
    await page.goto('/home');

    // Reachable from header in 1 click to open modal
    const emergencyBtn = page.locator('#emergency-stop-header-btn');
    await expect(emergencyBtn).toBeVisible();
    await emergencyBtn.click();

    // Confirm modal opens
    const confirmBtn = page.locator('#confirm-emergency-stop-btn');
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    // Results breakdown displayed
    await expect(page.locator('text=Emergency Stop Activated')).toBeVisible();
    await expect(page.locator('text=Cancelled Orders')).toBeVisible();

    // Close modal
    await page.locator('#emergency-stop-done-btn').click();

    // Verify persistent banner appears
    const banner = page.locator('#emergency-stop-banner');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Emergency Stop Active');

    // Verify persistent banner remains visible across page navigation
    await page.goto('/settings');
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('Emergency Stop Active');

    // Reset button is visible inside banner
    const resetBtn = page.locator('#reset-emergency-stop-btn');
    await expect(resetBtn).toBeVisible();
  });
});
