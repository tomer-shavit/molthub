/**
 * E2E Tests - Health Alerts Flow
 */
import { test, expect } from '@playwright/test';

test.describe('Health Alerts Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/alerts');
  });

  test('should display the alerts page heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /health alerts/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display alert summary cards', async ({ page }) => {
    await expect(page.getByText(/^active$/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/acknowledged/i)).toBeVisible();
    await expect(page.getByText(/^resolved$/i)).toBeVisible();
    await expect(page.getByText(/total open/i)).toBeVisible();
  });

  test('should display severity filter control', async ({ page }) => {
    const severityFilter = page.locator('select').filter({ hasText: /all severities/i });
    await expect(severityFilter).toBeVisible({ timeout: 10000 });

    // Verify severity options exist
    await expect(page.getByRole('option', { name: /critical/i })).toBeAttached();
    await expect(page.getByRole('option', { name: /warning/i })).toBeAttached();
    await expect(page.getByRole('option', { name: /info/i })).toBeAttached();
  });

  test('should display status filter control', async ({ page }) => {
    const statusFilter = page.locator('select').filter({ hasText: /all statuses/i });
    await expect(statusFilter).toBeVisible({ timeout: 10000 });

    // Verify status options exist
    await expect(page.getByRole('option', { name: /^active$/i })).toBeAttached();
    await expect(page.getByRole('option', { name: /acknowledged/i })).toBeAttached();
    await expect(page.getByRole('option', { name: /^resolved$/i })).toBeAttached();
  });

  test('should show alert cards or empty state message', async ({ page }) => {
    // Wait for the alerts section to load
    const alertCard = page.locator('[class*="space-y"] [class*="card"]').first();
    const emptyState = page.getByText(/no alerts found/i);

    await expect(alertCard.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test('should show the Apply Filters button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /apply filters/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show refresh button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /refresh/i })
    ).toBeVisible({ timeout: 10000 });
  });
});
