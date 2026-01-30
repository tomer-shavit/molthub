/**
 * E2E Tests - Cost Management Flow
 */
import { test, expect } from '@playwright/test';

test.describe('Cost Management Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/costs');
  });

  test('should display the costs page heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /cost management/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display cost summary cards', async ({ page }) => {
    await expect(page.getByText(/total spend/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/daily average/i)).toBeVisible();
    await expect(page.getByText(/top provider/i)).toBeVisible();
    await expect(page.getByText(/active budgets/i)).toBeVisible();
  });

  test('should display cost breakdown section', async ({ page }) => {
    // The cost breakdown heading may or may not appear depending on data availability
    const breakdownHeading = page.getByRole('heading', { name: /cost breakdown/i });
    const noBreakdown = page.getByText(/\$0\.00/i);

    await expect(breakdownHeading.or(noBreakdown)).toBeVisible({ timeout: 10000 });
  });

  test('should display budget status section', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /budget status/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display recent cost events table or empty state', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /recent cost events/i })
    ).toBeVisible({ timeout: 10000 });

    // Table should be visible with headers or an empty-state message
    const table = page.getByRole('table');
    await expect(table).toBeVisible();

    // Check for either data rows or the empty state text
    const dataRow = page.locator('table tbody tr').first();
    const emptyMessage = page.getByText(/no cost events recorded yet/i);

    await expect(dataRow.or(emptyMessage)).toBeVisible();
  });

  test('should display cost events table headers', async ({ page }) => {
    await expect(page.getByRole('columnheader', { name: /time/i })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('columnheader', { name: /provider/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /model/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /cost/i })).toBeVisible();
  });
});
