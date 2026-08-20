import { expect, test } from '@playwright/test';

test.describe('OpenBahía mock journey', () => {
  test('open, select line, list units, filter, follow, change line', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'OpenBahía' })).toBeVisible();
    await expect(page.getByText('Colectivos de Bahía Blanca')).toBeVisible();
    const select = page.getByLabel(/colectivo querés ver/i);
    await expect(select).toBeVisible();
    await select.selectOption('503');
    await expect(page.getByRole('button', { name: 'IDA' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'VUELTA' })).toBeVisible();
    await expect(page.getByRole('application', { name: 'Mapa de colectivos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acercar' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Alejar' })).toBeVisible();
    await expect(page.getByText('En vivo ·')).toHaveCount(0);
    await expect(page.getByText('Ver colectivos de esta línea')).toHaveCount(0);
    await expect(page.getByText(/Volver a/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /unidad M-32|unidad M-18/ }).first()).toBeVisible(
      {
        timeout: 20_000,
      },
    );
    await page
      .getByRole('button', { name: /unidad M-32|unidad M-18/ })
      .first()
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Seguir colectivo' }).click();
    await expect(page.getByRole('button', { name: 'Dejar de seguir' })).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(select.locator('option[value="504"]')).toHaveCount(1, { timeout: 15_000 });
    await select.selectOption('504');
    await expect(page.getByText(/Volver a/)).toHaveCount(0);
  });

  test('no units, upstream fail, mobile, zoom, offline', async ({ page, context }) => {
    await page.goto('/');
    await expect(
      page.getByLabel(/colectivo querés ver/i).locator('option[value="599"]'),
    ).toHaveCount(1, {
      timeout: 15_000,
    });
    await page.getByLabel(/colectivo querés ver/i).selectOption('599');
    await expect(
      page.getByRole('status').filter({ hasText: /ubicaciones recientes/i }),
    ).toBeVisible({
      timeout: 20_000,
    });

    await page.route('**/api/vehicles**', (route) => route.abort());
    await page.route('**/api/realtime/vehicles**', (route) => route.abort());
    await page.getByLabel(/colectivo querés ver/i).selectOption('512');
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /No pudimos actualizar|Está tardando|Sin conexión/i }),
    ).toBeVisible({
      timeout: 25_000,
    });

    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'OpenBahía' })).toBeVisible();
    await page.evaluate(() => {
      document.documentElement.style.zoom = '2';
    });
    await expect(page.getByLabel(/colectivo querés ver/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mostrar mi ubicación' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Acercar' })).toBeVisible();

    await context.setOffline(true);
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.getByText(/Sin conexión/)).toBeVisible();
  });

  test('keyboard can reach the line selector', async ({ page }) => {
    await page.goto('/');
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/colectivo querés ver/i)).toBeFocused();
  });

  test('user location is a toggle with a distinct marker', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -38.7183, longitude: -62.2663 });
    await page.goto('/');
    const locate = page.getByRole('button', { name: 'Mostrar mi ubicación' });
    await expect(locate).toBeVisible();
    await expect(locate).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.user-marker')).toHaveCount(0);
    await locate.click();
    await expect(page.getByRole('button', { name: 'Ocultar mi ubicación' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.user-marker')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Ocultar mi ubicación' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar mi ubicación' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('.user-marker')).toHaveCount(0);
  });
});
