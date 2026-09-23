import { expect, test, type Page } from '@playwright/test';

// Seeded late blight 2026: Dane WI 3 and 28 days ago, Menominee WI 9, Cayuga NY 19,
// Centre PA 41. So the default 7-day window holds only Dane.
const DANE = '55025';

async function openWithLabels(page: Page) {
	await page.goto('/?disease=late-blight&year=2026');
	const region = page.getByRole('application', { name: 'County detection map' });
	await region.and(page.locator('[data-map-settled]')).waitFor({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Map tools' }).click();
	// Click the visible label, as a person would; the switch input itself is sr-only.
	await page.getByText('Label counties with detections').click();
	await expect(page.getByRole('switch', { name: 'Label counties with detections' })).toBeChecked();
}

const label = (page: Page, fips: string) => page.locator(`[data-county-label="${fips}"]`);

test('labels default to the last week, and the slider widens the window', async ({ page }) => {
	await openWithLabels(page);
	await expect(page.getByText('1 county labelled')).toBeVisible();
	await expect(label(page, DANE)).toBeVisible();
	await expect(label(page, DANE)).toContainText('Dane County, WI');
	await expect(page.locator('[data-county-label]')).toHaveCount(1);

	// Back to January 1: every 2026 county, one label each (Dane has two detections).
	await page.locator('#label-since').fill('0');
	await expect(page.getByText('4 counties labelled')).toBeVisible();
	await expect(page.locator('[data-county-label]')).toHaveCount(4);
});

test('placed labels do not overlap', async ({ page }) => {
	await openWithLabels(page);
	await page.locator('#label-since').fill('0');
	const labels = page.locator('[data-county-label]');
	await expect(labels).toHaveCount(4);
	// Placement runs after measuring; give it the frame it needs.
	await expect(labels.first()).toBeVisible();
	const boxes = await labels.evaluateAll((els) =>
		els.map((el) => el.getBoundingClientRect()).map((r) => [r.left, r.top, r.right, r.bottom])
	);
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			const [al, at, ar, ab] = boxes[i];
			const [bl, bt, br, bb] = boxes[j];
			expect(al < br && bl < ar && at < bb && bt < ab, `labels ${i} and ${j} overlap`).toBe(false);
		}
	}
});

test('a label can be dragged, and clicking one selects its county', async ({ page }) => {
	await openWithLabels(page);
	const dane = label(page, DANE);
	await expect(dane).toBeVisible();
	const before = await dane.boundingBox();
	if (!before) throw new Error('no label box');

	await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
	await page.mouse.down();
	await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40, {
		steps: 5
	});
	await page.mouse.up();
	const after = await dane.boundingBox();
	expect(after!.x - before.x).toBeCloseTo(60, 0);
	expect(after!.y - before.y).toBeCloseTo(40, 0);
	// A drag is not a click.
	await expect(page.getByRole('button', { name: 'Clear' })).toHaveCount(0);

	await dane.click();
	await expect(page.getByText('Dane, WI — 2 detections')).toBeVisible();
});

test('no hover tooltip while labelling, so none ends up in a screenshot', async ({ page }) => {
	await openWithLabels(page);
	const box = await page.getByRole('application', { name: 'County detection map' }).boundingBox();
	if (!box) throw new Error('no map box');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.move(box.x + box.width / 2 + 5, box.y + box.height / 2 + 5);
	await expect(page.locator('.county-tooltip')).toHaveCount(0);
});

test('a share link carries the label date and reopens with labels on', async ({
	page,
	context
}) => {
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await openWithLabels(page);
	await page.locator('#label-since').fill('0');
	await page.getByRole('button', { name: 'Share' }).click();
	const link = await page.evaluate(() => navigator.clipboard.readText());
	expect(new URL(link).searchParams.get('since')).toBe('2026-01-01');

	const fresh = await context.newPage();
	await fresh.goto(link);
	await expect(fresh.locator('[data-county-label]')).toHaveCount(4, { timeout: 20_000 });
	await expect(fresh.getByText('Labels since Jan 1, 2026')).toBeVisible();
});

test('switching disease keeps labels on, with a fresh window', async ({ page }) => {
	await openWithLabels(page);
	await page.locator('#label-since').fill('0');
	await page.getByRole('button', { name: /Cucurbit downy mildew/ }).click();
	await expect(page).toHaveTitle(/Cucurbit downy mildew/);
	await expect(page.getByRole('switch', { name: 'Label counties with detections' })).toBeChecked();
	// Seeded CDM 2026: Martin NC 5 days ago is the only one within the last week.
	await expect(page.locator('[data-county-label]')).toHaveCount(1);
	await expect(page.locator('[data-county-label="37117"]')).toBeVisible();
});
