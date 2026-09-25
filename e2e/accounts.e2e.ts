import {
	expect,
	test,
	type Browser,
	type BrowserContextOptions,
	type Page
} from '@playwright/test';
import { signInAs, signInWithForm } from './sessions';

const ORIGIN = 'http://localhost:4173';

/** A fresh browser context, so a link is opened by someone who isn't the admin. */
async function stranger(browser: Browser) {
	return (await browser.newContext()).newPage();
}

const DANE = '55025';

test.describe('reporter permissions', () => {
	test('a reporter reaches neither users nor import — pages, actions, or endpoints', async ({
		page
	}) => {
		await signInAs(page, 'reporter');
		const nav = page.locator('header');
		await expect(nav.getByRole('link', { name: 'Users' })).toHaveCount(0);
		await expect(nav.getByRole('link', { name: 'Import CSV' })).toHaveCount(0);
		await expect(nav).toContainText('E2E Reporter');
		// Reporters don't administer anything, so the top bar calls it their account.
		await expect(page.getByRole('link', { name: 'Account', exact: true })).toBeVisible();
		await expect(nav.getByRole('link', { name: 'Back to map' })).toHaveAttribute('href', '/');

		for (const path of ['/admin/users', '/admin/import', '/admin/import/template.csv']) {
			expect((await page.request.get(path, { maxRedirects: 0 })).status(), path).toBe(403);
		}
		// Same-origin, so SvelteKit's CSRF check passes and the request reaches guardAdmin.
		const invite = await page.request.post('/admin/users?/invite', {
			headers: { origin: ORIGIN },
			form: { email: 'sneaky@example.com', role: 'admin' }
		});
		expect(invite.status()).toBe(403);
		const importPost = await page.request.post('/admin/import?/confirm', {
			headers: { origin: ORIGIN },
			form: { csv: 'disease,county_fips,observed_on\nlate-blight,55025,2023-01-01', signature: '' }
		});
		expect(importPost.status()).toBe(403);

		// Better Auth's own profile endpoint is closed, so it can't be used to self-promote.
		const promote = await page.request.post('/api/auth/update-user', {
			headers: { origin: ORIGIN },
			data: { role: 'admin', name: 'Sneaky' }
		});
		expect(promote.status()).toBe(404);
		// Refused by Better Auth itself, not SvelteKit's 404 page for a path it never reached.
		expect(promote.headers()['x-sveltekit-page']).toBeUndefined();
		await page.goto('/admin');
		await expect(page.locator('header')).toContainText('E2E Reporter (Reporter)');
	});

	test('a reporter edits their own detections but not anyone else’s', async ({ page }) => {
		await signInAs(page, 'reporter');

		// Seeded: detection 1 (Dane, 3 days ago) is the reporter's; detection 2 the admin's.
		// `seed:dev` restarts the identity, so these IDs are stable.
		await page.goto('/admin?diseaseId=&year=2026');
		const own = page
			.locator('tbody tr', { hasText: 'Dane, WI' })
			.filter({ hasText: 'E2E Reporter' });
		await expect(own.first().getByRole('link', { name: 'Edit' })).toBeVisible();
		const others = page.locator('tbody tr', { hasText: 'E2E Admin' });
		await expect(others.first()).toBeVisible();
		await expect(others.getByRole('link', { name: 'Edit' })).toHaveCount(0);

		expect((await page.request.get('/admin/incidents/1')).status()).toBe(200);
		expect((await page.request.get('/admin/incidents/2')).status()).toBe(403);
		for (const action of ['save', 'retract', 'restore', 'delete']) {
			const res = await page.request.post(`/admin/incidents/2?/${action}`, {
				headers: { origin: ORIGIN },
				form: { diseaseId: '1', countyFips: '55078', observedOn: '2026-01-01' }
			});
			expect(res.status(), action).toBe(403);
		}
		// Nor can they delete even their own: that is for admins.
		const del = await page.request.post('/admin/incidents/1?/delete', {
			headers: { origin: ORIGIN },
			form: {}
		});
		expect(del.status()).toBe(403);

		// On the public map, Edit appears only on their own detection.
		await page.goto('/?disease=late-blight&year=2026');
		const dialog = page.getByRole('dialog');
		await page
			.locator(`li[data-fips="${DANE}"]`)
			.first()
			.getByRole('button', { name: /^Details:/ })
			.click();
		await expect(dialog.getByRole('button', { name: 'Edit' })).toBeVisible();
		await page.keyboard.press('Escape');
		await page
			.locator('li[data-fips="55078"]')
			.first()
			.getByRole('button', { name: /^Details:/ })
			.click();
		await expect(dialog).toContainText('E2E Admin');
		await expect(dialog.getByRole('button', { name: 'Edit' })).toHaveCount(0);
	});
});

test.describe('attribution', () => {
	test('the public detail names who reported or imported a detection, never their email', async ({
		page
	}) => {
		await page.goto('/?disease=late-blight&year=2026');
		const dialog = page.getByRole('dialog');
		await page
			.locator(`li[data-fips="${DANE}"]`)
			.first()
			.getByRole('button', { name: /^Details:/ })
			.click();
		await expect(dialog).toContainText('Reported by');
		await expect(dialog).toContainText('E2E Reporter · Dev County Extension');
		await expect(dialog).not.toContainText('@');
		await page.keyboard.press('Escape');

		// Last season's fixtures came in by CSV import.
		await page.goto(`/?disease=late-blight&year=${new Date().getFullYear() - 1}`);
		await page
			.locator('li[data-fips]')
			.first()
			.getByRole('button', { name: /^Details:/ })
			.click();
		await expect(dialog).toContainText('Imported by');
		await expect(dialog).toContainText('E2E Admin');
	});

	test('the admin list filters by who reported', async ({ page }) => {
		await signInAs(page, 'admin');
		await page.selectOption('#filter-reported-by', { label: 'E2E Reporter' });
		await expect(page).toHaveURL(/reportedBy=/);
		const rows = page.locator('tbody tr');
		await expect(rows.first()).toBeVisible();
		await expect(rows.filter({ hasNotText: 'E2E Reporter' })).toHaveCount(0);

		await page.selectOption('#filter-reported-by', { label: 'Me' });
		await expect(rows.first()).toBeVisible();
		await expect(rows.filter({ hasNotText: 'E2E Admin' })).toHaveCount(0);
	});
});

test.describe('accounts', () => {
	test.describe.configure({ mode: 'serial' });

	// Unique per run: accounts are never deleted, and seed:dev leaves other users alone.
	// Changed partway through, by the email test.
	let email = `invitee-${Date.now()}@example.com`;
	const firstPassword = 'first-password-1234';
	const secondPassword = 'second-password-1234';
	const thirdPassword = 'third-password-1234';

	/** The invitee's signed-in session, handed from one step to the next. */
	let session: BrowserContextOptions['storageState'];

	/** Their row on the users page. Located by address: names repeat across runs. */
	const rowFor = (page: Page) => page.locator('tbody tr', { hasText: email });

	async function asInvitee(browser: Browser) {
		return (await browser.newContext({ storageState: session })).newPage();
	}

	test('an admin invites a reporter, who sets up their own account', async ({ page, browser }) => {
		await signInAs(page, 'admin');
		await page.goto('/admin/users');
		await page.fill('#invite-email', email);
		await page.selectOption('#invite-role', 'reporter');
		await page.getByRole('button', { name: 'Create invite link' }).click();

		const link = await page.locator('#issued-link').inputValue();
		expect(link).toMatch(/\/invite\/[\w-]{43}$/);
		await expect(page.getByRole('row', { name: new RegExp(email) })).toBeVisible();
		// The link can't be shown again, but the admin can put it away once it's copied.
		await page.getByRole('button', { name: 'Dismiss link' }).click();
		await expect(page.locator('#issued-link')).toHaveCount(0);

		const invitee = await stranger(browser);
		await invitee.goto(link);
		await expect(invitee.getByRole('heading', { name: 'Accept invitation' })).toBeVisible();
		await expect(invitee.getByText(email)).toBeVisible();
		await invitee.getByLabel('Your name').fill('  Pat   Grower ');
		await invitee.getByLabel(/^Affiliation/).fill('Test County Extension');
		await invitee.getByLabel(/^Password/).fill(firstPassword);
		await invitee.getByLabel('Confirm password').fill('not the same password');
		await invitee.getByRole('button', { name: 'Create account and sign in' }).click();
		await expect(invitee.getByText('The two passwords do not match.')).toBeVisible();
		// What was typed survives the refusal.
		await expect(invitee.getByLabel('Your name')).toHaveValue('Pat Grower');

		await invitee.getByLabel(/^Password/).fill(firstPassword);
		await invitee.getByLabel('Confirm password').fill(firstPassword);
		await invitee.getByRole('button', { name: 'Create account and sign in' }).click();
		await expect(invitee).toHaveURL(/\/admin$/, { timeout: 15_000 });
		await expect(invitee.locator('header')).toContainText('Pat Grower (Reporter)');
		session = await invitee.context().storageState();

		// The link was single-use.
		await invitee.goto(link);
		await expect(
			invitee.getByRole('heading', { name: 'This link is no longer valid' })
		).toBeVisible();

		// One row for the address: the account, no longer a pending invitation.
		await page.reload();
		await expect(page.getByRole('row', { name: new RegExp(email) })).toHaveCount(1);
		await expect(rowFor(page)).toContainText('Pat Grower');
	});

	test('an unknown link reads the same as a used one', async ({ page }) => {
		await page.goto('/invite/not-a-real-token');
		await expect(page.getByRole('heading', { name: 'This link is no longer valid' })).toBeVisible();
	});

	test('a user changes their own password and profile', async ({ browser }) => {
		const page = await asInvitee(browser);
		await page.goto('/admin');
		await page.locator('header').getByRole('link', { name: 'Pat Grower' }).click();
		await expect(page).toHaveURL(/\/admin\/account$/);

		await page.getByLabel('Current password').fill('wrong-password-123');
		await page.getByLabel('New password', { exact: true }).fill(secondPassword);
		await page.getByLabel('Confirm new password').fill(secondPassword);
		await page.getByRole('button', { name: 'Change password' }).click();
		await expect(page.getByText('Your current password is incorrect.')).toBeVisible();

		await page.getByLabel('Current password').fill(firstPassword);
		await page.getByLabel('New password', { exact: true }).fill(secondPassword);
		await page.getByLabel('Confirm new password').fill(secondPassword);
		await page.getByRole('button', { name: 'Change password' }).click();
		await expect(page.getByText('Password changed.')).toBeVisible();

		await page.getByLabel('Display name').fill('Pat Q. Grower');
		await page.getByRole('button', { name: 'Save profile' }).click();
		await expect(page.getByText('Saved.')).toBeVisible();
		await expect(page.locator('header')).toContainText('Pat Q. Grower');
		// Changing the password replaced this session's cookie.
		session = await page.context().storageState();
	});

	test('a reset link sets a new password, and the old one stops working', async ({
		page,
		browser
	}) => {
		await signInAs(page, 'admin');
		await page.goto('/admin/users');
		await rowFor(page).getByRole('button', { name: 'Reset password' }).click();
		await expect(page.getByText(`Password reset link for ${email}`)).toBeVisible();
		const link = await page.locator('#issued-link').inputValue();

		// Resetting signs the account out everywhere.
		const before = await asInvitee(browser);

		const user = await stranger(browser);
		await user.goto(link);
		await expect(user.getByRole('heading', { name: 'Set a new password' })).toBeVisible();
		await user.getByLabel('New password').fill(thirdPassword);
		await user.getByLabel('Confirm password').fill(thirdPassword);
		await user.getByRole('button', { name: 'Set password and sign in' }).click();
		await expect(user).toHaveURL(/\/admin$/, { timeout: 15_000 });
		session = await user.context().storageState();

		await before.goto('/admin');
		await expect(before).toHaveURL(/\/login/);
		await before.getByLabel('Email').fill(email);
		await before.getByLabel('Password').fill(secondPassword);
		await before.getByRole('button', { name: /Sign in/ }).click();
		await expect(before.getByText('Incorrect email address or password.')).toBeVisible();
	});

	test('a deactivated user is signed out and can’t sign in; reactivation restores them', async ({
		page,
		browser
	}) => {
		const user = await asInvitee(browser);

		await signInAs(page, 'admin');
		await page.goto('/admin/users');
		const row = rowFor(page);
		page.once('dialog', (d) => d.accept());
		await row.getByRole('button', { name: 'Deactivate' }).click();
		await expect(row).toContainText('Deactivated');

		// Their open session is gone…
		await user.goto('/admin');
		await expect(user).toHaveURL(/\/login/);
		// …and signing in fails exactly like a wrong password.
		await user.getByLabel('Email').fill(email);
		await user.getByLabel('Password').fill(thirdPassword);
		await user.getByRole('button', { name: /Sign in/ }).click();
		await expect(user.getByText('Incorrect email address or password.')).toBeVisible();

		await row.getByRole('button', { name: 'Reactivate' }).click();
		await expect(row).not.toContainText('Deactivated');
		await signInWithForm(user, { email, password: thirdPassword });
		session = await user.context().storageState();
	});

	test('roles change through a dialog, and a promoted admin can’t touch their seniors', async ({
		page,
		browser
	}) => {
		await signInAs(page, 'admin');
		const founderId = await page
			.locator('#filter-reported-by option', { hasText: 'Me' })
			.getAttribute('value');
		await page.goto('/admin/users');

		// Admins are listed before reporters.
		const roles = await page.locator('tbody tr td:nth-child(3)').allInnerTexts();
		const firstReporter = roles.findIndex((r) => r.startsWith('Reporter'));
		expect(roles.slice(firstReporter).some((r) => r.startsWith('Admin'))).toBe(false);

		const dialog = page.getByRole('dialog');
		await rowFor(page).getByRole('button', { name: 'Change role' }).click();
		await expect(dialog).toContainText('Currently reporter.');
		const change = dialog.getByRole('button', { name: 'Change role' });
		await expect(change).toBeDisabled();
		await dialog.getByRole('radio', { name: /^Admin/ }).check();
		await change.click();
		await expect(dialog).toHaveCount(0);
		await expect(rowFor(page)).toContainText(/Admin\s*since/);

		// The new admin can manage reporters, but not the admin who promoted them.
		const junior = await asInvitee(browser);
		await junior.goto('/admin/users');
		const founderRow = junior.locator('tbody tr', { hasText: 'e2e-admin@example.com' });
		await expect(founderRow).toContainText('Admin before you');
		await expect(founderRow.getByRole('button')).toHaveCount(0);
		const reporterRow = junior.locator('tbody tr', { hasText: 'e2e-reporter@example.com' });
		await expect(reporterRow.getByRole('button', { name: 'Change role' })).toBeVisible();

		for (const [action, form] of [
			['setRole', { userId: founderId ?? '', role: 'reporter' }],
			['deactivate', { userId: founderId ?? '' }],
			['resetLink', { userId: founderId ?? '' }],
			['setEmail', { userId: founderId ?? '', email: 'takeover@example.com' }]
		] as const) {
			const res = await junior.request.post(`/admin/users?/${action}`, {
				headers: { origin: ORIGIN, accept: 'application/json' },
				form
			});
			expect(await res.json(), action).toMatchObject({ type: 'failure', status: 400 });
		}

		// The senior admin can still demote them.
		await rowFor(page).getByRole('button', { name: 'Change role' }).click();
		await dialog.getByRole('radio', { name: /^Reporter/ }).check();
		await dialog.getByRole('button', { name: 'Change role' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(rowFor(page).locator('td').nth(2)).toHaveText('Reporter');
	});

	test('an admin changes someone’s email; they sign in with the new one', async ({
		page,
		browser
	}) => {
		const user = await asInvitee(browser);
		await signInAs(page, 'admin');
		await page.goto('/admin/users');

		const dialog = page.getByRole('dialog');
		await rowFor(page).getByRole('button', { name: 'Change email' }).click();
		// Taken addresses are refused inside the dialog.
		await dialog.getByLabel('Email').fill('e2e-reporter@example.com');
		await dialog.getByRole('button', { name: 'Save email' }).click();
		await expect(dialog).toContainText('already belongs to another account');

		const newEmail = email.replace('invitee-', 'invitee-moved-');
		await dialog.getByLabel('Email').fill(newEmail);
		await dialog.getByRole('button', { name: 'Save email' }).click();
		await expect(dialog).toHaveCount(0);
		email = newEmail;
		await expect(rowFor(page)).toBeVisible();

		// Signed out, and back in with the new address.
		await user.goto('/admin');
		await expect(user).toHaveURL(/\/login/);
		await signInWithForm(user, { email, password: thirdPassword });
	});

	test('an admin can’t demote or deactivate themselves', async ({ page }) => {
		await signInAs(page, 'admin');
		const selfId = await page
			.locator('#filter-reported-by option', { hasText: 'Me' })
			.getAttribute('value');

		await page.goto('/admin/users');
		const self = page.getByRole('row', { name: /E2E Admin\s\(you\)/ });
		await expect(self.getByRole('combobox')).toHaveCount(0);
		await expect(self.getByRole('button', { name: 'Deactivate' })).toHaveCount(0);

		// Nor by posting directly. A non-browser form post gets SvelteKit's JSON result.
		for (const [action, form] of [
			['deactivate', { userId: selfId ?? '' }],
			['setRole', { userId: selfId ?? '', role: 'reporter' }]
		] as const) {
			const res = await page.request.post(`/admin/users?/${action}`, {
				headers: { origin: ORIGIN, accept: 'application/json' },
				form
			});
			expect(await res.json(), action).toMatchObject({ type: 'failure', status: 400 });
		}
		await page.reload();
		await expect(self).not.toContainText('Deactivated');
		await expect(self).toContainText('Admin');
	});
});
