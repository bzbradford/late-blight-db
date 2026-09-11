import { expect, test } from '@playwright/test';

test('home page renders the disease map shell', async ({ page }) => {
	await page.goto('/');
	await expect(
		page.getByRole('heading', { name: 'Vegetable Disease Detection Map' })
	).toBeVisible();
});

test('both diseases are selectable', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('tab', { name: 'Late blight' })).toBeVisible();

	await page.getByRole('tab', { name: 'Cucurbit downy mildew' }).click();
	await expect(page.getByText('Pseudoperonospora cubensis')).toBeVisible();
});
