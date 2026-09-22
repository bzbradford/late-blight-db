import { expect, test } from '@playwright/test';

test('map renders county polygons and the legend', async ({ page }) => {
	const errors: string[] = [];
	page.on('pageerror', (e) => errors.push(e.message));

	await page.goto('/?disease=late-blight&year=2026');

	// MapLibre renders to a canvas inside the labelled application region.
	const mapRegion = page.getByRole('application', { name: 'County detection map' });
	await expect(mapRegion).toBeVisible();
	await expect(mapRegion.locator('canvas')).toBeVisible();

	await expect(page.getByText('Time since most recent detection')).toBeVisible();
	expect(errors).toEqual([]);
});

test('map loads the county topology successfully', async ({ page }) => {
	const responses: number[] = [];
	page.on('response', (r) => {
		if (r.url().includes('/geo/counties.topo.json')) responses.push(r.status());
	});

	await page.goto('/?disease=late-blight&year=2026');
	await expect(page.getByRole('application', { name: 'County detection map' })).toBeVisible();
	await page.waitForResponse((r) => r.url().includes('/geo/counties.topo.json'), {
		timeout: 20_000
	});

	expect(responses).toContain(200);
});

test('clicking a county selects it', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	const canvas = page.getByRole('application', { name: 'County detection map' }).locator('canvas');
	await expect(canvas).toBeVisible();
	await page.waitForResponse((r) => r.url().includes('/geo/counties.topo.json'));
	// MapLibre needs a frame or two after the topology lands before the fill layer is
	// hit-testable; there is no public event for "layer is queryable".
	await page.waitForTimeout(3000);

	const box = await canvas.boundingBox();
	if (!box) throw new Error('map canvas has no bounding box');
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

	await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible({ timeout: 10_000 });
});
