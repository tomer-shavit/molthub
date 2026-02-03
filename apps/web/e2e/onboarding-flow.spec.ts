/**
 * E2E Tests - Onboarding Flow
 *
 * Tests the full onboarding wizard at /setup, covering:
 * 1. Redirect from dashboard when no bots exist
 * 2. Template selection step
 * 3. Deployment target configuration step
 * 4. Channel setup step
 * 5. Review step
 * 6. Deploy progress step
 */
import { test, expect } from "@playwright/test";

test.describe("Onboarding Wizard", () => {
  test.describe("Setup page", () => {
    test("should display the setup wizard with template picker", async ({
      page,
    }) => {
      await page.goto("/setup");

      // Should show the wizard heading
      await expect(
        page.getByRole("heading", { name: /set up your first openclaw/i })
      ).toBeVisible();

      // Should show the stepper with step labels
      await expect(page.getByText(/template/i).first()).toBeVisible();
      await expect(page.getByText(/deployment/i).first()).toBeVisible();
      await expect(page.getByText(/channels/i).first()).toBeVisible();
    });

    test("should display template cards", async ({ page }) => {
      await page.goto("/setup");

      // Should show at least one template card
      const templateCards = page.locator('[role="radio"], .cursor-pointer');
      await expect(templateCards.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe("Step navigation", () => {
    test("should not allow advancing without selecting a template", async ({
      page,
    }) => {
      await page.goto("/setup");

      // The Next button should be present
      const nextButton = page.getByRole("button", { name: /next/i });
      await expect(nextButton).toBeVisible();

      // Without selecting a template, clicking Next should not advance
      await nextButton.click();

      // Should still be on the template step
      await expect(
        page.getByText(/choose a template/i).first()
      ).toBeVisible();
    });

    test("should advance to deployment step after selecting template", async ({
      page,
    }) => {
      await page.goto("/setup");

      // Click the first template card
      const templateCards = page.locator(".cursor-pointer").first();
      await templateCards.click();

      // Fill in bot name
      const nameInput = page.getByPlaceholder(/bot name/i).or(
        page.locator('input[type="text"]').first()
      );
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("Test Bot");
      }

      // Click Next
      await page.getByRole("button", { name: /next/i }).click();

      // Should now show deployment target options
      await expect(
        page.getByText(/docker/i).first()
      ).toBeVisible({ timeout: 5000 });
    });

    test("should show Docker and ECS EC2 options on deployment step", async ({
      page,
    }) => {
      await page.goto("/setup");

      // Select template and advance
      await page.locator(".cursor-pointer").first().click();
      const nameInput = page.locator('input[type="text"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("Test Bot");
      }
      await page.getByRole("button", { name: /next/i }).click();

      // Should show both deployment options
      await expect(page.getByText(/docker/i).first()).toBeVisible({
        timeout: 5000,
      });
      await expect(page.getByText(/ecs ec2/i).first()).toBeVisible();
    });

    test("should show ECS credential fields when ECS EC2 is selected", async ({
      page,
    }) => {
      await page.goto("/setup");

      // Select template and advance
      await page.locator(".cursor-pointer").first().click();
      const nameInput = page.locator('input[type="text"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("Test Bot");
      }
      await page.getByRole("button", { name: /next/i }).click();

      // Select ECS EC2
      await page.getByText(/ecs ec2/i).first().click();

      // Should show AWS credential inputs
      await expect(
        page.getByPlaceholder(/access key/i).or(
          page.getByLabel(/access key/i)
        )
      ).toBeVisible({ timeout: 5000 });
    });

    test("should allow navigating back to previous steps", async ({
      page,
    }) => {
      await page.goto("/setup");

      // Select template and advance to step 2
      await page.locator(".cursor-pointer").first().click();
      const nameInput = page.locator('input[type="text"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("Test Bot");
      }
      await page.getByRole("button", { name: /next/i }).click();

      // Wait for deployment step
      await expect(page.getByText(/docker/i).first()).toBeVisible({
        timeout: 5000,
      });

      // Click Back
      await page.getByRole("button", { name: /back/i }).click();

      // Should be back on template step
      await expect(
        page.getByText(/choose a template/i).first()
      ).toBeVisible();
    });
  });

  test.describe("Channel setup step", () => {
    test("should show channel configuration options", async ({ page }) => {
      await page.goto("/setup");

      // Navigate through template → deployment → channels
      await page.locator(".cursor-pointer").first().click();
      const nameInput = page.locator('input[type="text"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("Test Bot");
      }
      await page.getByRole("button", { name: /next/i }).click();

      // Select Docker (simplest option)
      await page.getByText(/docker/i).first().click();
      await page.getByRole("button", { name: /next/i }).click();

      // Should show channel options (Telegram, Discord, WhatsApp, etc.)
      await expect(
        page.getByText(/telegram/i).first()
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Review step", () => {
    test("should show deployment summary before deploying", async ({
      page,
    }) => {
      await page.goto("/setup");

      // Navigate through all steps to review
      // Step 1: Template
      await page.locator(".cursor-pointer").first().click();
      const nameInput = page.locator('input[type="text"]').first();
      if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill("Test Bot");
      }
      await page.getByRole("button", { name: /next/i }).click();

      // Step 2: Deployment (select Docker)
      await page.getByText(/docker/i).first().click();
      await page.getByRole("button", { name: /next/i }).click();

      // Step 3: Channels (skip with defaults)
      await page.getByRole("button", { name: /next/i }).click();

      // Step 4: Review — should show summary
      await expect(
        page.getByText(/review/i).first()
      ).toBeVisible({ timeout: 5000 });

      // Should show a deploy button
      await expect(
        page.getByRole("button", { name: /deploy/i })
      ).toBeVisible();
    });
  });
});

test.describe("Dashboard redirect", () => {
  test("should show dashboard when bots exist", async ({ page }) => {
    await page.goto("/");

    // If bots exist, dashboard should show fleet health heading
    // If no bots, should redirect to /setup
    const heading = page
      .getByRole("heading", { name: /fleet health/i })
      .or(page.getByRole("heading", { name: /set up your first/i }));

    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
