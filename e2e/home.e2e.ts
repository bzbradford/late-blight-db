import { expect, test } from '@playwright/test';

test('defaults to the first disease and the current year', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveTitle(/Late blight detections, \d{4}/);
	await expect(page.getByRole('link', { name: /Late blight/ })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('switching disease updates the URL and the active tab', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('link', { name: /Cucurbit downy mildew/ }).click();

	await expect(page).toHaveURL(/disease=cucurbit-downy-mildew/);
	await expect(page).toHaveTitle(/Cucurbit downy mildew detections/);
	await expect(page.getByRole('link', { name: /Cucurbit downy mildew/ })).toHaveAttribute(
		'aria-current',
		'page'
	);
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
	await expect(page.getByText('Filtered to county 55025')).toBeVisible();

	await page.getByRole('link', { name: /Cucurbit downy mildew/ }).click();
	await expect(page).not.toHaveURL(/county=/);
});

test('about page explains the two symbology modes', async ({ page }) => {
	await page.goto('/about');
	await expect(page.getByRole('heading', { name: 'About this map' })).toBeVisible();
	await expect(page.getByText(/when the disease first arrived/)).toBeVisible();
});
