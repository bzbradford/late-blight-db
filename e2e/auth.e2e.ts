import { expect, test } from '@playwright/test';

const EMAIL = 'e2e-admin@example.com';
const PASSWORD = 'e2e-test-password-123';

test.describe('admin authentication', () => {
	test('an unauthenticated visit to /admin redirects to sign in', async ({ page }) => {
		await page.goto('/admin');
		await expect(page).toHaveURL(/\/login\?redirectTo=/);
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	});

	test('the public map never exposes an admin link to anonymous visitors', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('link', { name: 'Administration' })).toHaveCount(0);
		await expect(page.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
	});

	test('wrong credentials are refused without revealing whether the account exists', async ({
		page
	}) => {
		await page.goto('/login');
		await page.getByLabel('Email').fill(EMAIL);
		await page.getByLabel('Password').fill('definitely-not-the-password');
		await page.getByRole('button', { name: /Sign in/ }).click();

		const error = page.getByRole('alert');
		await expect(error).toBeVisible();
		await expect(error).toHaveText('Incorrect email address or password.');

		// The same message must appear for an address with no account at all.
		await page.goto('/login');
		await page.getByLabel('Email').fill('nobody-at-all@example.com');
		await page.getByLabel('Password').fill('definitely-not-the-password');
		await page.getByRole('button', { name: /Sign in/ }).click();
		await expect(page.getByRole('alert')).toHaveText('Incorrect email address or password.');
	});

	test('signing in reaches the admin area, and signing out revokes access', async ({ page }) => {
		await page.goto('/login');
		await page.getByLabel('Email').fill(EMAIL);
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: /Sign in/ }).click();

		await expect(page).toHaveURL(/\/admin$/);
		await expect(page.getByText(/Signed in as/)).toBeVisible();

		// The session must survive a fresh page load, not just live in memory.
		await page.reload();
		await expect(page.getByText(/Signed in as/)).toBeVisible();

		// And the public map now offers a way back in.
		await page.goto('/');
		await expect(page.getByRole('link', { name: 'Administration' })).toBeVisible();

		await page.goto('/admin');
		await page.getByRole('button', { name: 'Sign out' }).click();
		await expect(page).toHaveURL(/\/$/);

		await page.goto('/admin');
		await expect(page).toHaveURL(/\/login/);
	});

	test('redirectTo returns the visitor to the page they asked for', async ({ page }) => {
		await page.goto('/admin');
		await expect(page).toHaveURL(/redirectTo=%2Fadmin/);

		await page.getByLabel('Email').fill(EMAIL);
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: /Sign in/ }).click();
		await expect(page).toHaveURL(/\/admin$/);
	});
});
