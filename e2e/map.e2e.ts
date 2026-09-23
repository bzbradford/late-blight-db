import { expect, test, type Page } from '@playwright/test';

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

	// Listen before navigating: the topology is fetched as the map starts, in parallel with
	// the basemap, and can arrive before any later listener exists.
	const topology = page.waitForResponse((r) => r.url().includes('/geo/counties.topo.json'), {
		timeout: 20_000
	});
	await page.goto('/?disease=late-blight&year=2026');
	await expect(page.getByRole('application', { name: 'County detection map' })).toBeVisible();
	await topology;

	expect(responses).toContain(200);
});

/** The map has loaded its data and finished its first render (and any arrival fly). */
async function mapSettled(page: Page) {
	const region = page.getByRole('application', { name: 'County detection map' });
	await region.and(page.locator('[data-map-settled]')).waitFor({ timeout: 20_000 });
	const box = await region.boundingBox();
	if (!box) throw new Error('map has no bounding box');
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Seeded: Dane County, WI has two 2026 late blight detections. A share link naming it
// centres the map on it, so the map's centre point is inside Dane.
const DANE_LINK = '/?disease=late-blight&year=2026&county=55025';

test('clicking a county with detections selects it', async ({ page }) => {
	await page.goto(DANE_LINK);
	const centre = await mapSettled(page);
	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);

	await page.mouse.click(centre.x, centre.y);
	await expect(page.getByText('Dane, WI — 2 detections')).toBeVisible();
});

test('clicking a county with no detections selects nothing', async ({ page }) => {
	// The centre of the default view is in the southern Plains, where nothing is seeded.
	await page.goto('/?disease=late-blight&year=2026');
	const centre = await mapSettled(page);
	await page.mouse.click(centre.x, centre.y);

	await expect(page.locator('.county-tooltip')).toContainText('No detections in 2026');
	await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
});

test('hovering a county shows its full name and latest detection', async ({ page }) => {
	await page.goto(DANE_LINK);
	const centre = await mapSettled(page);
	await page.mouse.move(centre.x, centre.y);

	const tooltip = page.locator('.county-tooltip');
	await expect(tooltip).toContainText('Dane County, Wisconsin');
	await expect(tooltip).toContainText('2 detections in 2026');
	await expect(tooltip).toContainText('Most recent:');
	await expect(tooltip).toContainText('Potato · US-23');
});

test('the tooltip reports the selected year, not the current one', async ({ page }) => {
	const lastYear = new Date().getFullYear() - 1;
	await page.goto(`/?disease=late-blight&year=${lastYear}`);
	const centre = await mapSettled(page);
	await page.mouse.move(centre.x, centre.y);
	await expect(page.locator('.county-tooltip')).toContainText(`No detections in ${lastYear}`);
});

// The disabled state for a disease-year with no detections isn't covered: the seed has
// detections in every disease-year the year menu offers.
test('the view buttons run without errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

	await page.goto('/?disease=late-blight&year=2026');
	await mapSettled(page);
	await expect(page.getByRole('button', { name: 'Zoom to detections' })).toBeEnabled();
	await page.getByRole('button', { name: 'Zoom to detections' }).click();
	await page.getByRole('button', { name: 'Reset view' }).click();
	expect(errors).toEqual([]);
});

test('switching theme rebuilds the map without MapLibre errors', async ({ page }) => {
	const errors: string[] = [];
	page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
	page.on('pageerror', (e) => errors.push(e.message));

	await page.goto(DANE_LINK);
	const centre = await mapSettled(page);
	await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
	await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();
	await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click();

	// Still interactive after the rebuild: the county layer is back and hit-testable.
	await expect(async () => {
		await page.mouse.move(centre.x, centre.y + 1);
		await page.mouse.move(centre.x, centre.y);
		await expect(page.locator('.county-tooltip')).toContainText('Dane County', { timeout: 500 });
	}).toPass({ timeout: 10_000 });
	expect(errors).toEqual([]);
});
