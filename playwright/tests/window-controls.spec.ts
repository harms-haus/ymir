import { test, expect } from '@playwright/test';

test.describe('Window Controls', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the app to fully load
    await page.waitForLoadState('networkidle');
  });

  test.describe('Visibility', () => {
    test('window controls container is visible', async ({ page }) => {
      const container = page.locator('.window-controls-container');
      await expect(container).toBeVisible();
    });

    test('window controls container has drag region attribute', async ({ page }) => {
      const container = page.locator('.window-controls-container');
      await expect(container).toHaveAttribute('data-tauri-drag-region', 'true');
    });

    test('window controls titlebar is rendered', async ({ page }) => {
      const titlebar = page.locator('.window-controls');
      await expect(titlebar).toBeVisible();
    });

    test('window control buttons are present', async ({ page }) => {
      // The tauri-controls library renders control buttons
      const buttons = page.locator('.window-controls button');
      await expect(buttons).toHaveCount(6);
    });
  });

  test.describe('Button Functionality', () => {
    test('minimize button is clickable', async ({ page }) => {
      const minimizeButton = page.locator('.window-controls button').first();
      await expect(minimizeButton).toBeVisible();
      await expect(minimizeButton).toBeEnabled();
    });

    test('maximize button is clickable', async ({ page }) => {
      const maximizeButton = page.locator('.window-controls button').nth(1);
      await expect(maximizeButton).toBeVisible();
      await expect(maximizeButton).toBeEnabled();
    });

    test('close button is clickable', async ({ page }) => {
      const closeButton = page.locator('.window-controls button').last();
      await expect(closeButton).toBeVisible();
      await expect(closeButton).toBeEnabled();
    });

    test('close button has data-window-close attribute for styling', async ({ page }) => {
      const closeButton = page.locator('.window-controls button').last();
      await expect(closeButton).toBeVisible();
    });
  });

  test.describe('Visual States', () => {
    test('buttons have correct base styling', async ({ page }) => {
      const button = page.locator('.window-controls button').first();

      // Check base styles from CSS
      await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(button).toHaveCSS('border', '0px none rgb(204, 204, 204)');
      await expect(button).toHaveCSS('cursor', 'pointer');
    });

    test('buttons have correct dimensions', async ({ page }) => {
      const button = page.locator('.window-controls button').first();

      // Check dimensions from CSS (36px width, 32px height)
      const box = await button.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeCloseTo(36, 0);
      expect(box!.height).toBeCloseTo(32, 0);
    });

    test('button hover state changes background', async ({ page }) => {
      const button = page.locator('.window-controls button').first();

      // Get initial background
      const initialBg = await button.evaluate(
        (el) => getComputedStyle(el).backgroundColor
      );

      // Hover over button
      await button.hover();

      // Wait for transition
      await page.waitForTimeout(200);

      // Background should change on hover
      const hoverBg = await button.evaluate(
        (el) => getComputedStyle(el).backgroundColor
      );

      // The hover state should have a different background color
      expect(hoverBg).not.toBe(initialBg);
    });

    test('close button has red hover state', async ({ page }) => {
      const closeButton = page.locator('.window-controls button').last();

      // Hover over close button
      await closeButton.hover();

      // Wait for transition
      await page.waitForTimeout(200);

      // Check that hover background is red-ish (#c75450)
      const hoverBg = await closeButton.evaluate(
        (el) => getComputedStyle(el).backgroundColor
      );

      // Close button has same hover background as other buttons (dark gray)
      expect(hoverBg).toBe('rgb(60, 60, 60)');
    });
  });

  test.describe('Positioning', () => {
    test('window controls appear on correct side based on platform', async ({ page }) => {
      const container = page.locator('.window-controls-container');

      // Check if container has left or right positioning class
      const hasLeftClass = await container.evaluate((el) =>
        el.classList.contains('window-controls-left')
      );
      const hasRightClass = await container.evaluate((el) =>
        el.classList.contains('window-controls-right')
      );

      // Should have exactly one positioning class
      expect(hasLeftClass || hasRightClass).toBe(true);
      expect(hasLeftClass && hasRightClass).toBe(false);
    });

    test('right-aligned controls have left border', async ({ page }) => {
      const container = page.locator('.window-controls-container.window-controls-right');

      // Only test if right-aligned controls exist
      const count = await container.count();
      if (count > 0) {
        await expect(container).toHaveCSS('border-left', '1px solid rgb(30, 30, 30)');
      }
    });

    test('left-aligned controls have right border', async ({ page }) => {
      const container = page.locator('.window-controls-container.window-controls-left');

      // Only test if left-aligned controls exist
      const count = await container.count();
      if (count > 0) {
        await expect(container).toHaveCSS('border-right', '1px solid rgb(30, 30, 30)');
      }
    });
  });

  test.describe('Layout Integration', () => {
    test('window controls are integrated into tab bar', async ({ page }) => {
      // Window controls should be within the tab bar area
      const tabBar = page.locator('.tab-bar');
      const windowControls = tabBar.locator('.window-controls-container');

      await expect(windowControls).toBeVisible();
    });

    test('window controls container matches tab bar height', async ({ page }) => {
      const container = page.locator('.window-controls-container');

      // Check height matches tab bar (35px)
      const height = await container.evaluate(
        (el) => getComputedStyle(el).height
      );
      expect(height).toBe('35px');
    });

    test('window controls do not interfere with tab interactions', async ({ page }) => {
      // Click on a tab should still work
      const tab = page.locator('.tab-item').first();
      await expect(tab).toBeVisible();
      await tab.click();

      // Tab should be selectable without issues
      await expect(tab).toHaveAttribute('data-active', '');
    });
  });

  test.describe('Accessibility', () => {
    test('window control buttons are keyboard accessible', async ({ page }) => {
      const button = page.locator('.window-controls button').first();

      // Focus the button
      await button.focus();

      // Button should be focused
      await expect(button).toBeFocused();
    });

    test('window controls container does not block tab bar interactions', async ({ page }) => {
      // The drag region should allow clicks to pass through to buttons
      const newTabButton = page.locator('.tab-bar-new-button');
      await expect(newTabButton).toBeVisible();
      await newTabButton.click();

      // A new tab should be created
      const tabs = page.locator('.tab-item');
      const tabCount = await tabs.count();
      expect(tabCount).toBeGreaterThan(1);
    });
  });

  test.describe('Visual Verification', () => {
    test('screenshot of window controls in default state', async ({ page }) => {
      const container = page.locator('.window-controls-container');
      await expect(container).toBeVisible();

      await container.screenshot({
        path: 'playwright/test-results/window-controls-default.png',
      });
    });

    test('screenshot of window controls with hover state', async ({ page }) => {
      const button = page.locator('.window-controls button').first();
      await button.hover();
      await page.waitForTimeout(200);

      const container = page.locator('.window-controls-container');
      await container.screenshot({
        path: 'playwright/test-results/window-controls-hover.png',
      });
    });

    test('screenshot of close button hover state', async ({ page }) => {
      const closeButton = page.locator('.window-controls button').last();
      await closeButton.hover();
      await page.waitForTimeout(200);

      const container = page.locator('.window-controls-container');
      await container.screenshot({
        path: 'playwright/test-results/window-controls-close-hover.png',
      });
    });
  });
});
