import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './sessions';

/**
 * Private coordinates. These tests write only to cucurbit downy mildew 2022, which no
 * fixture or other test touches, so counts asserted elsewhere are undisturbed.
 *
 * Madison's coordinates carry a distinctive last digit, so finding them in a response
 * can only mean they leaked.
 */
const MADISON = '43.07311, -89.40123';
const LEAK = /43\.07311|-89\.40123/;
/** About 4.9 km off the Milwaukee County shore, on this map's simplified coastline. */
const OFFSHORE = '43.04, -87.82';

async function openNew(page: Page) {
	await page.goto('/admin/incidents/new');
	await page.selectOption('#diseaseId', { label: 'Cucurbit downy mildew' });
	await page.fill('#observedOn', '2022-08-10');
	await page.fill('#reportedOn', '2022-08-11');
}

const save = (page: Page) => page.getByRole('button', { name: 'Add detection' });

test.describe('private coordinates', () => {
	test.describe.configure({ mode: 'serial' });

	test('coordinates choose the county, and save', async ({ page }) => {
		await signInAs(page, 'admin');
		await openNew(page);
		await page.fill('#coordinates', MADISON);
		await expect(page.locator('#countyFips')).toHaveValue('Dane, WI');
		await expect(page.getByText('In Dane County, Wisconsin.')).toBeVisible();
		await page.fill('#comments', 'Coordinates e2e: Madison.');
		await save(page).click();
		await expect(page).toHaveURL(/\/detections$/);

		// Back in the editor, the coordinates are there for an admin.
		await page.goto('/detections?year=2022&disease=cucurbit-downy-mildew');
		const row = page.locator('tbody tr', { hasText: 'Dane County' });
		await row.getByRole('link', { name: 'Edit' }).click();
		await expect(page.locator('#coordinates')).toHaveValue(MADISON);
	});

	test('a county the coordinates are not in blocks saving, with a fix', async ({ page }) => {
		await signInAs(page, 'admin');
		await openNew(page);
		await page.fill('#countyFips', 'Polk Iowa');
		await page.keyboard.press('Enter');
		await page.fill('#coordinates', MADISON);
		await expect(
			page.getByText('These coordinates are in Dane County, Wisconsin, not Polk County, Iowa.')
		).toBeVisible();
		await expect(save(page)).toBeDisabled();

		await page.getByRole('button', { name: 'Use Dane County' }).click();
		await expect(page.locator('#countyFips')).toHaveValue('Dane, WI');
		await expect(save(page)).toBeEnabled();
	});

	test('the server refuses mismatched coordinates even past the form', async ({ page }) => {
		await signInAs(page, 'admin');
		await openNew(page);
		await page.fill('#countyFips', 'Polk Iowa');
		await page.keyboard.press('Enter');
		await page.fill('#coordinates', MADISON);
		await expect(save(page)).toBeDisabled();

		// A crafted request: the client-side check is no guard.
		await page.evaluate(() =>
			document.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((b) => {
				b.disabled = false;
			})
		);
		const response = page.waitForResponse(
			(r) => r.url().includes('/admin/incidents/new') && r.request().method() === 'POST'
		);
		await save(page).click();
		const body = await (await response).text();
		expect(body).toContain(
			'These coordinates are in Dane County, Wisconsin, not Polk County, Iowa.'
		);
		await expect(page).toHaveURL(/\/admin\/incidents\/new$/);
	});

	test('a point just off the coast can be confirmed, and then saves', async ({ page }) => {
		await signInAs(page, 'admin');
		await openNew(page);
		await page.fill('#coordinates', OFFSHORE);
		await expect(
			page.getByText(/The nearest is Milwaukee County, Wisconsin, 4\.9 km away/)
		).toBeVisible();
		await page.getByRole('button', { name: 'Use Milwaukee County' }).click();
		await expect(page.getByText(/4\.9 km outside Milwaukee County, Wisconsin/)).toBeVisible();
		await expect(save(page)).toBeDisabled();

		await page.getByRole('button', { name: 'Use these coordinates anyway' }).click();
		await expect(save(page)).toBeEnabled();
		await save(page).click();
		await expect(page).toHaveURL(/\/detections$/);
	});

	test('a dropped minus sign is offered its fix', async ({ page }) => {
		await signInAs(page, 'admin');
		await openNew(page);
		await page.fill('#coordinates', '43.07311, 89.40123');
		await expect(
			page.getByText('These coordinates are not in any county on this map.')
		).toBeVisible();
		await page.getByRole('button', { name: '43.07311, -89.40123' }).click();
		await expect(page.locator('#coordinates')).toHaveValue(MADISON);
		await expect(page.locator('#countyFips')).toHaveValue('Dane, WI');
	});

	test('coordinates never reach a visitor or another reporter', async ({ page, browser }) => {
		const visitor = await (await browser.newContext()).newPage();
		for (const path of [
			'/',
			'/?disease=cucurbit-downy-mildew&year=2022&county=55025',
			'/api/view?disease=cucurbit-downy-mildew&year=2022',
			'/detections?disease=cucurbit-downy-mildew&year=2022',
			'/detections.csv?disease=all&year=all'
		]) {
			const res = await visitor.request.get(path);
			expect(res.ok(), path).toBe(true);
			expect(await res.text(), path).not.toMatch(LEAK);
		}
		// The admin download is refused outright.
		const refused = await visitor.request.get('/admin/detections.csv?disease=all&year=all', {
			maxRedirects: 0
		});
		expect(refused.ok()).toBe(false);
		await visitor.context().close();

		// A reporter sees the public table, and can't open an admin's detection to read them.
		await signInAs(page, 'reporter');
		const table = await page.request.get('/detections?disease=cucurbit-downy-mildew&year=2022');
		expect(await table.text()).not.toMatch(LEAK);
		const download = await page.request.get('/admin/detections.csv?disease=all&year=all', {
			maxRedirects: 0
		});
		expect(download.ok()).toBe(false);
	});

	test('the admin download has them, the public one has no coordinate columns', async ({
		page
	}) => {
		await signInAs(page, 'admin');
		await page.goto('/detections?year=2022&disease=cucurbit-downy-mildew');
		const href = await page.getByRole('link', { name: 'With coordinates' }).getAttribute('href');
		const admin = await (await page.request.get(href!)).text();
		expect(admin.split('\r\n')[0]).toContain('latitude,longitude');
		expect(admin).toContain('43.07311,-89.40123');

		const pub = await (await page.request.get('/detections.csv?disease=all&year=all')).text();
		expect(pub.split('\r\n')[0]).not.toMatch(/latitude|longitude/);
	});

	test('an import can choose the county from coordinates', async ({ page }) => {
		await signInAs(page, 'admin');
		await page.goto('/admin/import');
		await page.setInputFiles('#file', {
			name: 'coords.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(
				[
					'disease,county_fips,latitude,longitude,observed_on,comments',
					'cucurbit-downy-mildew,,41.5868,-93.625,2022-09-01,Coordinates e2e: Des Moines',
					'cucurbit-downy-mildew,55025,41.5868,-93.625,2022-09-02,Coordinates e2e: mismatch'
				].join('\n')
			)
		});
		await page.getByRole('button', { name: 'Check file' }).click();
		// The mismatched row blocks the file, saying where the point really is.
		await expect(
			page.getByText(
				'latitude/longitude: These coordinates are in Polk County, Iowa, not Dane County, Wisconsin.'
			)
		).toBeVisible();

		// Without it, the row takes Polk County from its coordinates and imports.
		await page.goto('/admin/import');
		await page.setInputFiles('#file', {
			name: 'coords.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(
				[
					'disease,county_fips,latitude,longitude,observed_on,comments',
					'cucurbit-downy-mildew,,41.5868,-93.625,2022-09-01,Coordinates e2e: Des Moines'
				].join('\n')
			)
		});
		await page.getByRole('button', { name: 'Check file' }).click();
		await page.getByRole('button', { name: 'Import: add 1' }).click();
		await expect(page.getByText('1 added')).toBeVisible();
		await page.goto('/detections?year=2022&disease=cucurbit-downy-mildew');
		await expect(page.locator('tbody tr', { hasText: 'Polk County' })).toHaveCount(1);
	});
});
