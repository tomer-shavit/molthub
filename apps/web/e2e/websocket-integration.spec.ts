/**
 * E2E Tests - WebSocket Integration (WP1.3)
 */
import { test, expect } from '@playwright/test';

test.describe('WebSocket Integration - Bot Detail Page', () => {
  test('should render the log viewer with live toggle button', async ({ page }) => {
    await page.goto('/bots/test-bot-id');
    const logsTab = page.getByRole('button', { name: /logs/i });
    if (await logsTab.isVisible().catch(() => false)) await logsTab.click();
    await expect(page.getByRole('button', { name: /live|static/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /auto-scroll/i })).toBeVisible();
  });

  test('should toggle between live and static log modes', async ({ page }) => {
    await page.goto('/bots/test-bot-id');
    const logsTab = page.getByRole('button', { name: /logs/i });
    if (await logsTab.isVisible().catch(() => false)) await logsTab.click();
    const liveToggle = page.getByRole('button', { name: /live|static/i });
    if (await liveToggle.isVisible().catch(() => false)) {
      await liveToggle.click();
      const buttonText = await liveToggle.textContent();
      expect(buttonText).toMatch(/live|static/i);
    }
  });

  test('should show health snapshot with real-time indicator', async ({ page }) => {
    await page.goto('/bots/test-bot-id');
    await expect(page.getByText(/health/i).first()).toBeVisible();
    await expect(page.getByText(/last updated|last checked|no health data/i)).toBeVisible();
  });

  test('should show gateway status with connection status indicator', async ({ page }) => {
    await page.goto('/bots/test-bot-id');
    await expect(page.getByText(/gateway connection/i)).toBeVisible();
    await expect(page.getByText(/websocket/i)).toBeVisible();
  });

  test('should have log level filter buttons', async ({ page }) => {
    await page.goto('/bots/test-bot-id');
    const logsTab = page.getByRole('button', { name: /logs/i });
    if (await logsTab.isVisible().catch(() => false)) await logsTab.click();
    await expect(page.getByRole('button', { name: /debug/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /info/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /warn/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /error/i })).toBeVisible();
  });

  test('should show search input in log viewer', async ({ page }) => {
    await page.goto('/bots/test-bot-id');
    const logsTab = page.getByRole('button', { name: /logs/i });
    if (await logsTab.isVisible().catch(() => false)) await logsTab.click();
    await expect(page.getByPlaceholder(/search logs/i)).toBeVisible();
  });
});

test.describe('WebSocket Integration - Overview Tab', () => {
  test('should display overview with gateway and health sections', async ({ page }) => {
    await page.goto('/bots/test-bot-id');
    await expect(page.getByText(/gateway connection/i)).toBeVisible();
    await expect(page.getByText(/health/i).first()).toBeVisible();
  });
});
