/**
 * E2E Tests - SLO Tracking Flow
 */
import { test, expect } from '@playwright/test';

test.describe('SLO Tracking Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/slos');
  });

  test('should display the SLOs page heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /slo tracking/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display SLO summary cards', async ({ page }) => {
    await expect(page.getByText(/total slos/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/breached/i)).toBeVisible();
    await expect(page.getByText(/healthy/i)).toBeVisible();
    await expect(page.getByText(/compliance/i)).toBeVisible();
  });

  test('should display SLO filter controls', async ({ page }) => {
    // Status filter dropdown
    const statusFilter = page.locator('select').filter({ hasText: /all/i }).first();
    await expect(statusFilter).toBeVisible({ timeout: 10000 });

    // Instance filter dropdown
    const instanceFilter = page.locator('select').filter({ hasText: /all instances/i });
    await expect(instanceFilter).toBeVisible();
  });

  test('should show "Create SLO" button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /create slo/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should open create SLO form when clicking create button', async ({ page }) => {
    const createButton = page.getByRole('button', { name: /create slo/i });
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await createButton.click();

    // After clicking, button text should change to "Close Form"
    await expect(
      page.getByRole('button', { name: /close form/i })
    ).toBeVisible();
  });

  test('should show SLO cards or empty state', async ({ page }) => {
    // Wait for content to load, then check for either SLO cards or the empty state message
    const sloCard = page.locator('[class*="grid"] [class*="card"]').first();
    const emptyState = page.getByText(/no slo definitions yet/i);

    await expect(sloCard.or(emptyState)).toBeVisible({ timeout: 10000 });
  });
});
