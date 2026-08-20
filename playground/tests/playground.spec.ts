import { expect, test, type Page } from '@playwright/test';

function captureBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('guided camera frames live anchors across shots', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');

  await expect(page.getByText('Camera ready')).toBeVisible();
  await expect(page.locator('.film-frame-image img')).toHaveJSProperty('complete', true);
  await expect(page.locator('.film-frame-image img')).toHaveJSProperty('naturalWidth', 1600);

  const initialTransform = await page
    .locator('.film-stage')
    .evaluate((node) => node.style.transform);
  await page.getByRole('button', { name: 'Story frame' }).click();
  await expect
    .poll(() => page.locator('.film-stage').evaluate((node) => node.style.transform))
    .not.toBe(initialTransform);

  await page.getByRole('button', { name: 'Show camera anchors' }).click();
  await expect(page.locator('[data-camera-subject="true"]')).toHaveAttribute(
    'data-film-anchor',
    'story-canvas'
  );
  await page.screenshot({ path: 'test-results/guided-desktop.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});

test('studio validates, applies, and runs an edited definition', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 1500, height: 960 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Studio' }).click();

  await expect(page.getByText('Runtime studio')).toBeVisible();
  await expect(page.getByText('Camera ready')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visual' })).toHaveAttribute('data-active', 'true');
  await page.getByRole('button', { name: 'Edit beat Custom resolver at 4 seconds' }).click();
  await expect(
    page.locator('.studio-preview-heading').getByText('Custom resolver', { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel('Camera anchor')).toHaveValue('virtual-focus');
  await page.getByLabel('Padding').fill('96');
  await expect(page.getByLabel('Padding')).toHaveValue('96');
  await expect(page.getByText('Runtime in sync')).toBeVisible();
  await page.screenshot({ path: 'test-results/studio-visual-desktop.png', fullPage: true });
  await page.getByRole('button', { name: 'Code' }).click();
  const editor = page.locator('.cm-content');
  await editor.fill('{');
  await expect(page.getByText('1 issue').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeDisabled();

  const definition = {
    duration: 2,
    tracks: {
      signal: [
        { time: 0, value: 0 },
        { time: 2, value: 1, easing: 'easeOutCubic' },
      ],
    },
    beats: [
      {
        id: 'canvas',
        at: 0,
        title: 'Edited canvas',
        shot: { anchor: 'studio-canvas', padding: 44, maxScale: 1.1 },
      },
      {
        id: 'resolver',
        at: 1,
        title: 'Edited resolver',
        shot: { anchor: 'virtual-focus', padding: 72, maxScale: 1.8 },
      },
    ],
    cues: [{ id: 'edited-cue', at: 0.5, anchor: 'studio-canvas', kind: 'marker' }],
  };
  await editor.fill(JSON.stringify(definition, null, 2));
  await expect(page.getByText('Ready to apply')).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('v2')).toBeVisible();
  await expect(
    page.locator('.studio-preview-heading').getByText('Edited canvas', { exact: true })
  ).toBeVisible();

  const scrubber = page.locator('input[aria-label="Studio film time"]');
  await scrubber.fill('0.45');
  await page.getByRole('button', { name: 'Play studio film' }).click();
  await expect(page.getByText('edited-cue')).toBeVisible();
  await scrubber.fill('1.95');
  await expect(page.getByText('1 COMPLETE')).toBeVisible();

  await page.getByLabel('Loop').check();
  await page.getByLabel('Resolver').uncheck();
  await page.getByLabel('Autoplay').check();
  await expect(page.getByRole('button', { name: 'Pause studio film' })).toBeVisible();
  await page.getByLabel('x').fill('580');
  await expect(page.getByLabel('x')).toHaveValue('580');

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.screenshot({ path: 'test-results/studio-desktop.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});

test('studio remains operable in the narrow layout', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Studio' }).click();

  await expect(page.getByLabel('Film duration')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visual' })).toHaveAttribute('data-active', 'true');
  await page.screenshot({ path: 'test-results/studio-mobile-authoring.png' });
  await page.getByRole('button', { name: 'Code' }).click();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
  await expect(page.locator('.cm-content')).toBeVisible();
  const shellOverflow = await page
    .locator('.studio-shell')
    .evaluate((node) => node.scrollWidth - node.clientWidth);
  expect(shellOverflow).toBeLessThanOrEqual(0);

  await page.locator('.studio-preview-pane').scrollIntoViewIfNeeded();
  await expect(page.getByText('Camera ready')).toBeInViewport();
  await expect(page.locator('.studio-camera-viewport')).toBeInViewport();
  await page.screenshot({ path: 'test-results/studio-mobile.png' });
  expect(browserErrors).toEqual([]);
});

test('timeline plays and the narrow layout stays within the viewport', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Timeline' }).click();
  await expect(page.getByText('Phone · 390 × 680')).toBeVisible();
  const scrubber = page.locator('input[aria-label="Film time"]');
  await scrubber.fill('4.9');
  await expect(scrubber).toHaveValue('4.9');
  await expect(page.getByText(/Cue crossed/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Play film' }).click();
  await expect(page.getByText('Cue crossed · select-scene')).toBeVisible();

  const elapsed = await scrubber.inputValue();
  expect(Number(elapsed)).toBeGreaterThan(5);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await expect(page.locator('.camera-frame')).toBeInViewport();
  await page.screenshot({ path: 'test-results/timeline-mobile.png', fullPage: true });
  expect(browserErrors).toEqual([]);
});
