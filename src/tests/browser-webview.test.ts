import { test, expect } from '@playwright/test';
import { _electron } from '@playwright/test';

test.describe('Browser Webview Integration', () => {
  test.slow('should create webview and display about:blank', async () => {
    await _electron.app!.launch('http://localhost:5173');
    await _electron.app!.waitForSelector('.workspace-container', { timeout: 10000 });
    
    const globeButton = await _electron.app!.$('.globe-button');
    await globeButton.click();
    
    await _electron.app!.waitForSelector('.tab.browser', { timeout: 5000 });
    
    const browserTab = await _electron.app!.$('.tab.browser');
    expect(await browserTab.isVisible()).toBe(true);
    
    await _electron.app!.waitForSelector('.browser-container', { timeout: 5000 });
    
    const browserContainer = await _electron.app!.$('.browser-container');
    expect(await browserContainer.isVisible()).toBe(true);
    
    const boundingBox = await browserContainer.boundingBox();
    expect(boundingBox.width).toBeGreaterThan(0);
    expect(boundingBox.height).toBeGreaterThan(0);
    
    const errorState = await _electron.app!.$('.browser-error');
    expect(await errorState.count()).toBe(0);
  });
});
});
});
