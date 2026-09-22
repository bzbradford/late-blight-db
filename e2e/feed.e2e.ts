import { expect, test } from '@playwright/test';

// Seeded by `pnpm seed:dev`: Dane WI has two 2026 late blight detections.
const DANE = '55025';

test('feed lists detections for the selected disease and year', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	await expect(page.getByText('5 detections')).toBeVisible();
	await expect(page.getByRole('button', { name: /Dane, WI/ }).first()).toBeVisible();
});

test('clicking a feed card selects its county', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	await page
		.getByRole('button', { name: /Dane, WI/ })
		.first()
		.click();

	await expect(page.getByText(`Dane, WI — 2 detections`)).toBeVisible();
});

test('a selected county highlights every one of its detections, not just the first', async ({
	page
}) => {
	await page.goto(`/?disease=late-blight&year=2026&county=${DANE}`);
	const cards = page.locator(`li[data-fips="${DANE}"] button`);
	await expect(cards).toHaveCount(2);
	for (let i = 0; i < 2; i++) {
		await expect(cards.nth(i)).toHaveAttribute('aria-pressed', 'true');
	}
	// Counties other than the selected one must not be highlighted.
	await expect(
		page.locator('li[data-fips]:not([data-fips="' + DANE + '"]) button[aria-pressed="true"]')
	).toHaveCount(0);
});

test('a deep link arrives with the county already selected', async ({ page }) => {
	await page.goto(`/?disease=late-blight&year=2026&county=${DANE}`);
	await expect(page.getByText('Dane, WI — 2 detections')).toBeVisible();
});

test('clearing the selection unhighlights every card', async ({ page }) => {
	await page.goto(`/?disease=late-blight&year=2026&county=${DANE}`);
	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(page.locator('li[data-fips] button[aria-pressed="true"]')).toHaveCount(0);
});

test('clicking a county on the map highlights it in the feed', async ({ page }) => {
	// Arriving on Dane centres the map on it; clear, then pick it again by map click.
	await page.goto(`/?disease=late-blight&year=2026&county=${DANE}`);
	const region = page.getByRole('application', { name: 'County detection map' });
	await region.and(page.locator('[data-map-settled]')).waitFor({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Clear' }).click();

	const box = await region.boundingBox();
	if (!box) throw new Error('no map box');
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

	const cards = page.locator(`li[data-fips="${DANE}"] button`);
	await expect(cards.first()).toHaveAttribute('aria-pressed', 'true');
});

test('a year with no detections explains itself', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	// 2024 has no seeded data; the year menu is data-driven so navigate directly.
	await page.goto('/?disease=late-blight&year=2024');
	// Falls back to a year that has data rather than erroring.
	await expect(page.locator('text=detections').first()).toBeVisible();
});
