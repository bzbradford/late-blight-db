import { expect, test } from '@playwright/test';
import { signInAs } from './sessions';

test.describe('public detections table', () => {
	test('anyone can read it, with no editing or account-only filters', async ({ page }) => {
		await page.goto('/');
		await page
			.getByRole('navigation', { name: 'Site' })
			.getByRole('link', { name: 'Detections' })
			.click();
		await expect(page).toHaveURL(/\/detections$/);
		await expect(page.getByRole('heading', { name: 'Detections' })).toBeVisible();

		const rows = page.locator('tbody tr');
		await expect(rows.first()).toBeVisible();
		await expect(page.getByRole('link', { name: 'Add detection' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: /^Edit/ })).toHaveCount(0);
		// Its option values are user IDs, so it never reaches the public.
		await expect(page.locator('#filter-reported-by')).toHaveCount(0);
		await expect(page.getByLabel('Show retracted')).toHaveCount(0);
	});

	test('columns sort, and filters reach the download', async ({ page }) => {
		await page.goto('/detections?year=2026');

		// Newest first by default.
		await expect(page.getByRole('button', { name: 'Observed' })).toBeVisible();
		const county = page.locator('tbody tr td:nth-child(3)');
		await page.getByRole('button', { name: 'County' }).click();
		const names = await county.allTextContents();
		expect(names.map((n) => n.trim())).toEqual(
			[...names.map((n) => n.trim())].sort((a, b) => a.localeCompare(b))
		);

		await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
			'href',
			'/detections.csv?disease=all&year=2026'
		);
		await page.selectOption('#filter-disease', { label: 'Late blight' });
		await expect(page).toHaveURL(/\/detections\?disease=late-blight&year=2026$/);
		await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
			'href',
			'/detections.csv?disease=late-blight&year=2026'
		);
	});

	test('State is a column that sorts, filters, and narrows the download', async ({ page }) => {
		await page.goto('/detections?year=2026');
		const state = page.locator('tbody tr td:nth-child(4)');

		await page.getByRole('button', { name: 'State/Province' }).click();
		const names = (await state.allTextContents()).map((n) => n.trim());
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
		expect(names).toContain('Wisconsin');

		// The filter lists states by name, and only those with detections.
		const options = await page.locator('#filter-state option').allTextContents();
		expect(options[0]).toBe('All states and provinces');
		expect(options.slice(1)).toEqual([...options.slice(1)].sort((a, b) => a.localeCompare(b)));

		await page.selectOption('#filter-state', { label: 'Wisconsin' });
		await expect(page).toHaveURL(/\/detections\?year=2026&state=WI$/);
		await expect(state.first()).toHaveText('Wisconsin');
		expect(new Set((await state.allTextContents()).map((n) => n.trim()))).toEqual(
			new Set(['Wisconsin'])
		);

		const download = page.getByRole('link', { name: 'Download CSV' });
		await expect(download).toHaveAttribute(
			'href',
			'/detections.csv?disease=all&year=2026&state=WI'
		);
		const csv = await page.request.get((await download.getAttribute('href'))!);
		expect(csv.headers()['content-disposition']).toContain('all-diseases-wi-2026.csv');
		const lines = (await csv.text()).trim().split('\n').slice(1);
		expect(lines.length).toBeGreaterThan(0);
		for (const line of lines) expect(line.split(',')[3]).toBe('WI');
	});

	test('search filters the rows as you type, without reloading', async ({ page }) => {
		await page.goto('/detections');
		const rows = page.locator('tbody tr');
		const total = await rows.count();
		const search = page.getByRole('searchbox', { name: 'Search detections' });

		await search.fill('dane potato');
		await expect(rows.first()).toContainText('Dane County');
		const matched = await rows.count();
		expect(matched).toBeLessThan(total);
		for (const text of await rows.allTextContents()) {
			expect(text).toMatch(/Dane County/);
			expect(text).toMatch(/Potato/);
		}
		await expect(page.getByText(`${matched} of ${total} detections`)).toBeVisible();
		await expect(page).toHaveURL(/\/detections$/);

		await search.fill('no such thing anywhere');
		await expect(page.getByText('No detections match “no such thing anywhere”.')).toBeVisible();

		await search.fill('');
		await expect(rows).toHaveCount(total);
	});

	test('a county links to the map, and Details shows the whole record', async ({ page }) => {
		await page.goto('/detections?disease=late-blight&year=2026');
		const row = page.locator('tbody tr', { hasText: 'Dane County' }).first();

		await row.getByRole('button', { name: /^Details/ }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Late blight' })).toBeVisible();
		await expect(dialog).toContainText('Location Dane County, Wisconsin');
		await page.keyboard.press('Escape');

		await row.getByRole('link', { name: 'Dane County' }).click();
		// The map opens on that county, then clears the share parameters from the address.
		await expect(page.getByText(/Dane, WI — \d+\s+detections?/)).toBeVisible();
		await expect(page).toHaveURL(/\/$/);
	});

	test('signed in, the table offers adding, editing, and retracted rows', async ({ page }) => {
		await signInAs(page, 'reporter');
		await expect(page.getByRole('link', { name: 'Add detection' })).toBeVisible();
		await expect(page.locator('#filter-reported-by')).toBeVisible();
		await expect(page.getByLabel('Show retracted')).toBeVisible();

		// Reporters edit only their own.
		const own = page.locator('tbody tr', { hasText: 'E2E Reporter' });
		await expect(own.first().getByRole('link', { name: /^Edit/ })).toBeVisible();
		const others = page.locator('tbody tr', { hasText: 'E2E Admin' });
		await expect(others.first()).toBeVisible();
		await expect(others.getByRole('link', { name: /^Edit/ })).toHaveCount(0);
	});
});
