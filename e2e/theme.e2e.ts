import { expect, test } from '@playwright/test';

test('the branding bar is on every page', async ({ page }) => {
	for (const path of ['/', '/about', '/login']) {
		await page.goto(path);
		await expect(page.getByRole('link', { name: 'University of Wisconsin–Madison' })).toBeVisible();
	}
});

test('the first paint is light, even when the OS prefers dark', async ({ browser }) => {
	const dark = await browser.newContext({ colorScheme: 'dark' });
	const page = await dark.newPage();
	// Checked before any client script runs beyond the inline one in app.html.
	await page.goto('/', { waitUntil: 'commit' });
	await expect(page.locator('html')).not.toHaveClass(/\bdark\b/);
	await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
	await dark.close();
});

test('choosing dark mode survives a reload', async ({ browser }) => {
	const context = await browser.newContext({ colorScheme: 'light' });
	const page = await context.newPage();
	await page.goto('/');

	await page.getByRole('button', { name: 'Switch to dark mode' }).click();
	await expect(page.locator('html')).toHaveClass(/\bdark\b/);
	await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();

	await page.reload();
	await expect(page.locator('html')).toHaveClass(/\bdark\b/);
	await context.close();
});

test('the page fits the viewport with the branding bar above it', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
	const overflow = await page.evaluate(
		() => document.documentElement.scrollHeight - window.innerHeight
	);
	expect(overflow).toBeLessThanOrEqual(0);
});
