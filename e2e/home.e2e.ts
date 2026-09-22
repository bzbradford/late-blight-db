import { expect, test } from '@playwright/test';

test('defaults to the first disease and the current year', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/Late blight detections, \d{4}/);
	await expect(page.getByRole('button', { name: /Late blight/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});

test('switching disease updates the view and leaves the address bar clean', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Cucurbit downy mildew/ }).click();

	await expect(page).toHaveTitle(/Cucurbit downy mildew detections/);
	await expect(page.getByRole('button', { name: /Cucurbit downy mildew/ })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	expect(new URL(page.url()).search).toBe('');
});

test('switching year swaps the data without navigating', async ({ page }) => {
	const year = new Date().getFullYear();
	await page.goto('/');
	await expect(page.getByText('Time since most recent detection')).toBeVisible();

	await page.getByRole('button', { name: 'Year', exact: true }).click();
	await page.getByRole('option', { name: String(year - 1) }).click();

	await expect(page.getByText(`First detection during the ${year - 1} season`)).toBeVisible();
	await expect(page).toHaveTitle(new RegExp(`Late blight detections, ${year - 1}`));
	expect(new URL(page.url()).search).toBe('');
});

test('the legend swaps from recency to first-detection timing for a past year', async ({
	page
}) => {
	const year = new Date().getFullYear();

	await page.goto(`/?disease=late-blight&year=${year}`);
	await expect(page.getByText('Time since most recent detection')).toBeVisible();

	await page.goto(`/?disease=late-blight&year=${year - 1}`);
	await expect(page.getByText(`First detection during the ${year - 1} season`)).toBeVisible();
});

test('an unknown disease or year falls back instead of erroring', async ({ page }) => {
	const response = await page.goto('/?disease=nonsense&year=1999');
	expect(response?.status()).toBe(200);
	await expect(page).toHaveTitle(/Late blight detections/);
});

test('selecting a disease clears a county selected under the previous one', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026&county=55025');
	await expect(page.getByText('Dane, WI — 2 detections')).toBeVisible();

	await page.getByRole('button', { name: /Cucurbit downy mildew/ }).click();
	await expect(page).toHaveTitle(/Cucurbit downy mildew detections/);
	await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
});

test('a share link opens its view, then clears the address bar', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026&county=55025');
	await expect(page.getByText('Dane, WI — 2 detections')).toBeVisible();
	await expect.poll(() => new URL(page.url()).search).toBe('');
});

test('a share link naming a county with no detections selects nothing', async ({ page }) => {
	// Riley County, KS has no seeded detections.
	await page.goto('/?disease=late-blight&year=2026&county=20161');
	await expect(page.getByText('5 detections')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);
});

test('the Share button copies a link that reproduces the view', async ({ page, context }) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/');
	await page.getByRole('button', { name: /Cucurbit downy mildew/ }).click();
	await expect(page).toHaveTitle(/Cucurbit downy mildew detections/);
	await page
		.getByRole('button', { name: /Dane, WI/ })
		.first()
		.click();

	await page.getByRole('button', { name: 'Share' }).click();
	await expect(page.getByRole('button', { name: 'Link copied' })).toBeVisible();

	const link = await page.evaluate(() => navigator.clipboard.readText());
	const params = new URL(link).searchParams;
	expect(params.get('disease')).toBe('cucurbit-downy-mildew');
	expect(params.get('year')).toBe(String(new Date().getFullYear()));
	expect(params.get('county')).toBe('55025');

	// Opened fresh, the link lands in the same view.
	const fresh = await context.newPage();
	await fresh.goto(link);
	await expect(fresh).toHaveTitle(/Cucurbit downy mildew detections/);
	await expect(fresh.getByText('Dane, WI — 1 detection')).toBeVisible();
});

test('about page explains the two symbology modes', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByRole('heading', { name: 'About this map' })).toBeVisible();
	await expect(page.getByText(/when the disease first arrived/)).toBeVisible();
});
