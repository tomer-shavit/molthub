/**
 * E2E Tests - Multi-Bot UX Features (Channels, Add Bot, Compare)
 */
import { test, expect } from '@playwright/test';

test.describe('Channel Matrix Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/channels');
  });

  test('should display channel matrix heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /channel matrix/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display channel overview description', async ({ page }) => {
    await expect(
      page.getByText(/overview of all channel bindings/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show bot channels card', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /bot channels/i })
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Add Bot Wizard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/bots/new');
  });

  test('should display add bot heading', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /add new bot/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display wizard description', async ({ page }) => {
    await expect(
      page.getByText(/configure and deploy a new moltbot instance/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show fleet and bot name step by default', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /fleet & bot name/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show fleet selection dropdown', async ({ page }) => {
    await expect(
      page.getByText(/choose the fleet this bot will belong to/i)
    ).toBeVisible({ timeout: 10000 });

    const fleetSelect = page.locator('select').filter({ hasText: /select a fleet/i });
    await expect(fleetSelect).toBeVisible();
  });

  test('should show bot name input', async ({ page }) => {
    await expect(
      page.getByPlaceholder(/support-bot/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show step navigation buttons', async ({ page }) => {
    // Back button should be disabled on the first step
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible({ timeout: 10000 });
    await expect(backButton).toBeDisabled();

    // Next button should be visible
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeVisible();
  });

  test('should show cancel button', async ({ page }) => {
    await expect(
      page.getByRole('button', { name: /cancel/i })
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Bot Comparison Page', () => {
  test('should show error message when no IDs provided', async ({ page }) => {
    await page.goto('/bots/compare');

    await expect(
      page.getByText(/no bot ids provided/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show error when fewer than 2 IDs provided', async ({ page }) => {
    await page.goto('/bots/compare?ids=single-id');

    await expect(
      page.getByText(/at least 2 bot ids are required/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show error when more than 4 IDs provided', async ({ page }) => {
    await page.goto('/bots/compare?ids=id1,id2,id3,id4,id5');

    await expect(
      page.getByText(/maximum 4 bot ids can be compared/i)
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show Back to Bots button on error', async ({ page }) => {
    await page.goto('/bots/compare');

    await expect(
      page.getByRole('button', { name: /back to bots/i })
    ).toBeVisible({ timeout: 10000 });
  });

  test('should display comparison heading when valid IDs in query params', async ({ page }) => {
    // Use valid-looking IDs -- the API may fail but the heading should still render
    // if the API returns data, or we get an error state
    await page.goto('/bots/compare?ids=bot-1,bot-2');

    // Either the comparison heading loads or an error is displayed
    const comparisonHeading = page.getByRole('heading', { name: /bot comparison/i });
    const errorMessage = page.getByText(/failed to fetch/i);
    const loadingText = page.getByText(/loading comparison data/i);

    // First wait for the loading state to resolve
    await expect(
      comparisonHeading.or(errorMessage)
    ).toBeVisible({ timeout: 10000 });
  });
});
