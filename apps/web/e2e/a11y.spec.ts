import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test.describe('axe baseline', () => {
  test('home has no serious A/AA violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'OpenBahía' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    const blocking = results.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });

  test('selected line and vehicle panel', async ({ page }) => {
    await page.goto('/');
    const unit = page.getByRole('button', { name: /unidad M-/ }).first();
    await expect(unit).toBeVisible({ timeout: 20_000 });
    await unit.click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(tags).analyze();
    const blocking = results.violations.filter(
      (item) => item.impact === 'serious' || item.impact === 'critical',
    );
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([]);
  });
});
