import { expect, test, type Page } from '@playwright/test';

function captureBrowserErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

async function expectCenteredSubject(page: Page, selector: string) {
  await expect
    .poll(async () => {
      const subject = await page.locator(selector).boundingBox();
      const viewport = await page.locator('.camera-viewport').boundingBox();
      if (!subject || !viewport) return Infinity;
      return Math.max(
        Math.abs(subject.x + subject.width / 2 - viewport.x - viewport.width / 2),
        Math.abs(subject.y + subject.height / 2 - viewport.y - viewport.height / 2)
      );
    })
    .toBeLessThan(1);
}

test('narration drives product and camera while real UI leaves the step untouched', async ({
  page,
}) => {
  const errors = captureBrowserErrors(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await expect(page.getByText('Camera ready')).toBeVisible();
  const narrative = page.locator('.interaction-narrative');
  const sidebar = page.getByRole('group', { name: 'Sidebar section' });
  const stage = page.locator('.film-stage');
  const progress = page.locator('.guided-experience');
  const initialTransform = await stage.evaluate((node) => node.style.transform);

  await narrative.getByRole('button', { name: 'Media', exact: true }).hover();
  await expect(sidebar.getByRole('button', { name: 'Media', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(stage).toHaveAttribute('data-camera-anchor', 'media-content');
  await expect(page.getByAltText('Open road source footage')).toHaveJSProperty(
    'naturalWidth',
    1600
  );
  await expect
    .poll(() => stage.evaluate((node) => node.style.transform))
    .not.toBe(initialTransform);
  await expect
    .poll(async () => {
      const subject = await page.locator('.media-content').boundingBox();
      const viewport = await page.locator('.camera-viewport').boundingBox();
      return Boolean(
        subject &&
          viewport &&
          subject.x >= viewport.x &&
          subject.y >= viewport.y &&
          subject.x + subject.width <= viewport.x + viewport.width &&
          subject.y + subject.height <= viewport.y + viewport.height
      );
    })
    .toBe(true);
  await expectCenteredSubject(page, '.media-content');
  await page.screenshot({ path: 'test-results/triggers-desktop.png', fullPage: true });

  await sidebar.getByRole('button', { name: 'Scenes', exact: true }).click();
  await expect(sidebar.getByRole('button', { name: 'Scenes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(stage).toHaveAttribute('data-camera-anchor', 'media-content');
  await expect(progress).toHaveAttribute('data-step-id', 'workspace');
  await expect(progress).toHaveAttribute('data-step-revision', '0');

  await page.getByRole('button', { name: 'Full workspace' }).click();
  await page.locator('.scene-row').filter({ hasText: 'Cold open' }).click();
  await expect(page.locator('.canvas-toolbar')).toContainText('Frame 01');
  await expect(progress).toHaveAttribute('data-step-revision', '0');
  await narrative.getByRole('button', { name: 'frame', exact: true }).focus();
  await expect(stage).toHaveAttribute('data-camera-anchor', 'story-canvas');
  await expect(page.locator('.canvas-toolbar')).toContainText('Frame 01');

  await narrative.getByRole('button', { name: 'Media', exact: true }).hover();
  await narrative.getByRole('button', { name: 'Scenes', exact: true }).hover();
  await narrative.getByRole('button', { name: 'Media', exact: true }).hover();
  await expect(stage).toHaveAttribute('data-camera-anchor', 'media-content');
  await expect(progress).toHaveAttribute('data-step-revision', '0');
  await page.getByRole('button', { name: 'Story frame' }).click();
  await expect(progress).toHaveAttribute('data-step-id', 'story');
  await expect(progress).toHaveAttribute('data-step-revision', '1');
  await expect(stage).toHaveAttribute('data-camera-anchor', 'story-canvas');
  await expect(sidebar.getByRole('button', { name: 'Scenes', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  expect(errors).toEqual([]);
});

test('trigger narration works with touch and keyboard in a narrow viewport', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = captureBrowserErrors(page);
  await page.goto('http://127.0.0.1:4173');
  const narrative = page.locator('.interaction-narrative');
  await narrative.getByRole('button', { name: 'Media', exact: true }).tap();
  await expect(page.locator('.film-stage')).toHaveAttribute('data-camera-anchor', 'media-content');
  await expect(page.getByAltText('Open road source footage')).toBeVisible();
  await narrative.getByRole('button', { name: 'Scenes', exact: true }).focus();
  await expect(page.locator('.film-stage')).toHaveAttribute('data-camera-anchor', 'sidebar');
  await expect(page.locator('.guided-experience')).toHaveAttribute('data-step-revision', '0');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  ).toBeLessThanOrEqual(0);
  await expect(narrative).toBeInViewport();
  await expect(page.locator('.camera-frame')).toBeInViewport();
  await expectCenteredSubject(page, '.scene-sidebar');
  await page.screenshot({ path: 'test-results/triggers-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
  await context.close();
});

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
    'data-cuelens-anchor',
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

  const scrubber = page.locator('input[aria-label="Studio sequence time"]');
  await scrubber.fill('0.45');
  await page.getByRole('button', { name: 'Play studio sequence' }).click();
  await expect(page.getByText('edited-cue')).toBeVisible();
  await scrubber.fill('1.95');
  await expect(page.getByText('1 COMPLETE')).toBeVisible();

  await page.getByLabel('Loop').check();
  await page.getByLabel('Resolver').uncheck();
  await page.getByLabel('Autoplay').check();
  await expect(page.getByRole('button', { name: 'Pause studio sequence' })).toBeVisible();
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

  await expect(page.getByLabel('Sequence duration')).toBeVisible();
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
  const scrubber = page.locator('input[aria-label="Sequence time"]');
  await scrubber.fill('4.9');
  await expect(scrubber).toHaveValue('4.9');
  await expect(page.getByText(/Cue crossed/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Play sequence' }).click();
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
