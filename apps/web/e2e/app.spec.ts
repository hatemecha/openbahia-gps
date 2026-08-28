import { expect, test } from '@playwright/test';

test.describe('OpenBahía mock journey', () => {
  test('open, select line, list units, filter, follow, change line', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'OpenBahía' })).toBeVisible();
    await expect(page.getByText('Colectivos de Bahía Blanca')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Código fuente' })).toHaveAttribute(
      'href',
      'https://github.com/hatemecha/openbahia-gps',
    );
    const select = page.getByLabel(/colectivo querés ver/i);
    await expect(select).toBeVisible();
    await select.selectOption('503');
    await expect(page.getByRole('button', { name: 'IDA', exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('button', { name: 'VUELTA', exact: true })).toBeVisible();
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
    const firstBusMarker = page.locator('.bus-marker').first();
    await expect(firstBusMarker).toHaveClass(/maplibregl-marker/);
    await expect(firstBusMarker).toHaveCSS('position', 'absolute');
    await expect(firstBusMarker.locator('.bus-dot')).toHaveCSS(
      'background-color',
      'rgb(180, 35, 24)',
    );
    await expect(firstBusMarker.locator('.bus-arrow')).toBeVisible();
    await expect(page.locator('.bus-marker.outbound').first()).toBeVisible();
    await expect(page.locator('.bus-marker.inbound').first()).toBeVisible();
    await expect(page.locator('.bus-marker.inbound').first().locator('.bus-dot')).toHaveCSS(
      'background-color',
      'rgb(11, 110, 153)',
    );
    await expect(firstBusMarker).toHaveCSS('width', '44px');
    await expect(firstBusMarker).toHaveCSS('height', '44px');
    await expect(firstBusMarker.locator('.bus-dot')).toHaveCSS('width', '26px');
    await expect(firstBusMarker.locator('.bus-dot')).toHaveCSS('height', '26px');
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

  test('layout stays usable at supported mobile and desktop widths', async ({ page }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      await page.goto('/');
      await expect(page.getByLabel(/colectivo querés ver/i)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Mostrar mi ubicación' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'IDA', exact: true })).toBeVisible({
        timeout: 20_000,
      });
      await expect(page.getByRole('button', { name: 'VUELTA', exact: true })).toBeVisible();
      const viewport = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.clientWidth);
      for (const control of [
        page.getByRole('button', { name: 'IDA', exact: true }),
        page.getByRole('button', { name: 'VUELTA', exact: true }),
        page.getByRole('button', { name: 'Mostrar mi ubicación' }),
      ]) {
        const box = await control.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
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

  test('keyboard can reach source and line selector', async ({ page }) => {
    await page.goto('/');
    await page.locator('.skip-link').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Código fuente' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/colectivo querés ver/i)).toBeFocused();
  });

  test('user location is a toggle with a distinct marker', async ({ page, context }) => {
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ latitude: -38.742, longitude: -62.294 });
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
    await expect(page.locator('.user-marker')).toHaveAttribute(
      'aria-label',
      /precisión aproximada/i,
    );
    await expect(page.locator('.user-marker')).toHaveAttribute(
      'style',
      /--user-accuracy-diameter:/,
    );
    await expect(
      page.getByRole('status').filter({ hasText: /Ubicación precisa|precisión aproximada/i }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const mapBox = await page
          .getByRole('application', { name: 'Mapa de colectivos' })
          .boundingBox();
        const markerBox = await page.locator('.user-marker').boundingBox();
        if (!mapBox || !markerBox) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(markerBox.x + markerBox.width / 2 - (mapBox.x + mapBox.width / 2)),
          Math.abs(markerBox.y + markerBox.height / 2 - (mapBox.y + mapBox.height / 2)),
        );
      })
      .toBeLessThan(35);
    await page.getByRole('button', { name: 'Ocultar mi ubicación' }).click();
    await expect(page.getByRole('button', { name: 'Mostrar mi ubicación' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator('.user-marker')).toHaveCount(0);
  });

  test('a coarse first fix still responds, centers, and reports its uncertainty', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const position = {
        coords: {
          latitude: -38.742,
          longitude: -62.294,
          accuracy: 250,
          altitude: null,
          altitudeAccuracy: null,
          heading: null,
          speed: null,
        },
        timestamp: Date.now(),
      } as GeolocationPosition;
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          watchPosition(success: PositionCallback) {
            window.setTimeout(() => success(position), 20);
            return 1;
          },
          clearWatch() {},
        },
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Mostrar mi ubicación' }).click();
    await expect(page.locator('.user-marker')).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('status').filter({ hasText: /Ubicación aproximada \(±250 m\)/i }),
    ).toBeVisible();
    await expect
      .poll(async () => {
        const mapBox = await page
          .getByRole('application', { name: 'Mapa de colectivos' })
          .boundingBox();
        const markerBox = await page.locator('.user-marker').boundingBox();
        if (!mapBox || !markerBox) {
          return Number.POSITIVE_INFINITY;
        }
        return Math.max(
          Math.abs(markerBox.x + markerBox.width / 2 - (mapBox.x + mapBox.width / 2)),
          Math.abs(markerBox.y + markerBox.height / 2 - (mapBox.y + mapBox.height / 2)),
        );
      })
      .toBeLessThan(35);
  });
});
