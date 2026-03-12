import { test, expect } from '@playwright/test';

test('smoke test - basic page load', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Ymir/);
});
