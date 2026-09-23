import { expect, test } from '@playwright/test';

const DANE = '55025';

test('selection and view changes are announced to screen readers', async ({ page }) => {
	await page.goto('/?disease=late-blight&year=2026');
	const live = page.locator('[aria-live="polite"][aria-atomic="true"]');
	// Nothing is read out over the page load itself.
	await expect(live).toHaveText('');

	await page.locator(`li[data-fips="${DANE}"] button[aria-pressed]`).first().click();
	await expect(live).toHaveText('Selected Dane, WI: 2 detections.');

	await page.getByRole('button', { name: 'Clear' }).click();
	await expect(live).toHaveText('Selection cleared.');

	await page.getByRole('button', { name: /Cucurbit downy mildew/ }).click();
	await expect(live).toHaveText(/^Showing cucurbit downy mildew, 2026: \d+ detections?\.$/);
});

test('the map shows a loading state until the counties are drawn', async ({ page }) => {
	// Hold the county topology back so the loading state is observable.
	let release: () => void = () => {};
	const held = new Promise<void>((r) => (release = r));
	await page.route('**/geo/counties.topo.json', async (route) => {
		await held;
		await route.continue();
	});

	await page.goto('/');
	const status = page.getByRole('status').filter({ hasText: 'Loading map…' });
	await expect(status).toBeVisible();
	release();
	await expect(status).toHaveCount(0);
});

test('an unknown address gets a real 404 page with a way back', async ({ page }) => {
	const res = await page.goto('/no-such-page');
	expect(res?.status()).toBe(404);
	await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
	await page.getByRole('link', { name: 'Go to the detection map' }).click();
	await expect(page).toHaveURL(/\/$/);
});

test('a shared link previews the view it opens', async ({ request }) => {
	const html = await (await request.get('/?disease=late-blight&year=2025')).text();
	expect(html).toContain('<meta property="og:title" content="Late blight detections, 2025"');
	expect(html).toMatch(/<meta property="og:description" content="\d+ confirmed late blight/);
	expect(html).toContain('<meta name="twitter:card" content="summary"');
});

test.describe('on a 360 px phone', () => {
	test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

	test('nothing scrolls sideways, and the legend starts folded', async ({ page }) => {
		await page.goto('/');
		const width = await page.evaluate(() => document.documentElement.scrollWidth);
		expect(width).toBeLessThanOrEqual(360);

		const legendToggle = page.getByRole('button', { name: 'Legend' });
		await expect(legendToggle).toHaveAttribute('aria-expanded', 'false');
		const legend = page.locator('#map-legend');
		await expect(legend.getByText('Within 7 days')).toBeHidden();
		await legendToggle.click();
		await expect(legend.getByText('Within 7 days')).toBeVisible();
	});

	test('the map keeps most of the screen', async ({ page }) => {
		await page.goto('/');
		const box = await page.getByRole('application', { name: 'County detection map' }).boundingBox();
		expect(box?.height ?? 0).toBeGreaterThan(740 * 0.55);
	});
});
