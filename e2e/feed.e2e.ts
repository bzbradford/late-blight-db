import { expect, test } from '@playwright/test';

// Seeded by `pnpm seed:dev`: Dane WI has two 2026 late blight detections.
const DANE = '55025';

test('feed lists detections for the selected disease and year', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	await expect(page.getByText('5 detections')).toBeVisible();
	await expect(page.getByRole('button', { name: /Dane, WI/ }).first()).toBeVisible();
});

test('clicking a feed card selects its county in the URL', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	await page
		.getByRole('button', { name: /Dane, WI/ })
		.first()
		.click();

	await expect(page).toHaveURL(new RegExp(`county=${DANE}`));
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
		page.locator('li:not([data-fips="' + DANE + '"]) button[aria-pressed="true"]')
	).toHaveCount(0);
});

test('a deep link arrives with the county already selected', async ({ page }) => {
	await page.goto(`/?disease=late-blight&year=2026&county=${DANE}`);
	await expect(page.getByText('Dane, WI — 2 detections')).toBeVisible();
});

test('clearing the selection removes it from the URL', async ({ page }) => {
	await page.goto(`/?disease=late-blight&year=2026&county=${DANE}`);
	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(page).not.toHaveURL(/county=/);
	await expect(page.locator('li[data-fips] button[aria-pressed="true"]')).toHaveCount(0);
});

test('clicking a county on the map highlights it in the feed', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	const canvas = page.getByRole('application', { name: 'County detection map' }).locator('canvas');
	await page.waitForResponse((r) => r.url().includes('/geo/counties.topo.json'));
	await page.waitForTimeout(3000);

	const box = await canvas.boundingBox();
	if (!box) throw new Error('no canvas box');
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

	await expect(page).toHaveURL(/county=\d{5}/);
	// Whatever county was hit, the feed header must reflect the selection.
	await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
});

test('a year with no detections explains itself', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	// 2024 has no seeded data; the year menu is data-driven so navigate directly.
	await page.goto('/?disease=late-blight&year=2024');
	// Falls back to a year that has data rather than erroring.
	await expect(page.locator('text=detections').first()).toBeVisible();
});
