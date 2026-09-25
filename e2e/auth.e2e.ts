import { expect, test } from '@playwright/test';

const EMAIL = 'e2e-admin@example.com';
const PASSWORD = 'e2e-test-password-123';
const ORIGIN = 'http://localhost:4173';

test.describe('admin authentication', () => {
	test('an unauthenticated visit to /admin redirects to sign in', async ({ page }) => {
		await page.goto('/admin');
		await expect(page).toHaveURL(/\/login\?redirectTo=/);
		await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
	});

	test('the public map never exposes account links to anonymous visitors', async ({ page }) => {
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Site' });
		await expect(nav.getByRole('link')).toHaveText(['Map', 'Detections']);
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

		await expect(page).toHaveURL(/\/detections$/);
		await expect(page.getByText('Signed in as E2E Admin (Admin)')).toBeVisible();

		// The session must survive a fresh page load, not just live in memory.
		await page.reload();
		await expect(page.getByText('Signed in as E2E Admin (Admin)')).toBeVisible();

		// And the public map now carries the account tabs.
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Site' });
		await expect(nav.getByRole('link')).toHaveText([
			'Map',
			'Detections',
			'Account',
			'Users',
			'Import CSV'
		]);

		await page.getByRole('button', { name: 'Sign out' }).click();
		// Already on `/`, so the URL can't show that sign-out finished; the bar can.
		await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect(page).toHaveURL(/\/$/);

		await page.goto('/admin');
		await expect(page).toHaveURL(/\/login/);
	});

	test('redirectTo returns the visitor to the page they asked for', async ({ page }) => {
		await page.goto('/admin');
		await page.goto('/admin/account');
		await expect(page).toHaveURL(/redirectTo=%2Fadmin%2Faccount/);

		await page.getByLabel('Email').fill(EMAIL);
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: /Sign in/ }).click();
		await expect(page).toHaveURL(/\/admin\/account$/);
	});

	test('redirectTo cannot send the visitor to another site', async ({ page }) => {
		await page.goto('/login?redirectTo=' + encodeURIComponent('//example.com/admin'));
		await page.getByLabel('Email').fill(EMAIL);
		await page.getByLabel('Password').fill(PASSWORD);
		await page.getByRole('button', { name: /Sign in/ }).click();
		await expect(page).toHaveURL(/^http:\/\/localhost:\d+\/detections$/);
	});
});

test.describe('sign-in rate limits', () => {
	test('the form refuses an address after 5 wrong passwords', async ({ page }) => {
		// An address with no account, so no other test's sign-in is locked out.
		const email = `limit-${Date.now()}@example.com`;
		const attempt = async () => {
			await page.goto('/login');
			await page.getByLabel('Email').fill(email);
			await page.getByLabel('Password').fill('definitely-not-the-password');
			await page.getByRole('button', { name: /Sign in/ }).click();
			return page.getByRole('alert');
		};
		for (let i = 0; i < 5; i++) {
			await expect(await attempt()).toHaveText('Incorrect email address or password.');
		}
		await expect(await attempt()).toHaveText(/^Too many attempts\. Try again in 5 minutes\.$/);
	});

	test('a client cannot pick its own address for Better Auth’s limiter', async ({ request }) => {
		// Better Auth allows 5 sign-ins a minute per client. The hook replaces the address
		// header, so claiming a new address on each request doesn't earn more tries.
		const statuses: number[] = [];
		for (let i = 0; i < 6; i++) {
			const response = await request.post('/api/auth/sign-in/email', {
				headers: { origin: ORIGIN, 'x-lateblight-client-ip': `203.0.113.${i + 1}` },
				data: { email: 'nobody-at-all@example.com', password: 'definitely-not-the-password' }
			});
			statuses.push(response.status());
		}
		expect(statuses.slice(0, 5)).not.toContain(429);
		expect(statuses[5]).toBe(429);
	});
});
