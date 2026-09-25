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

	test('search filters the rows as you type, without reloading', async ({ page }) => {
		await page.goto('/detections');
		const rows = page.locator('tbody tr');
		const total = await rows.count();
		const search = page.getByRole('searchbox', { name: 'Search detections' });

		await search.fill('dane potato');
		await expect(rows.first()).toContainText('Dane, WI');
		const matched = await rows.count();
		expect(matched).toBeLessThan(total);
		for (const text of await rows.allTextContents()) {
			expect(text).toMatch(/Dane, WI/);
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
		const row = page.locator('tbody tr', { hasText: 'Dane, WI' }).first();

		await row.getByRole('button', { name: /^Details/ }).click();
		const dialog = page.getByRole('dialog');
		await expect(dialog.getByRole('heading', { name: 'Dane, WI' })).toBeVisible();
		await expect(dialog).toContainText('Late blight');
		await page.keyboard.press('Escape');

		await row.getByRole('link', { name: 'Dane, WI' }).click();
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
