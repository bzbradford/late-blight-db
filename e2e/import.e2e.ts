import { expect, test, type Page } from '@playwright/test';

const EMAIL = 'e2e-admin@example.com';
const PASSWORD = 'e2e-test-password-123';

async function signIn(page: Page) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(EMAIL);
	await page.getByLabel('Password').fill(PASSWORD);
	await page.getByRole('button', { name: /Sign in/ }).click();
	await expect(page).toHaveURL(/\/admin$/);
}

const HEADER = 'disease,county_fips,state,county,observed_on,crop,strain,comments';

async function upload(page: Page, name: string, rows: string[]) {
	await page.goto('/admin/import');
	await page.setInputFiles('#file', {
		name,
		mimeType: 'text/csv',
		buffer: Buffer.from([HEADER, ...rows].join('\n'))
	});
	await page.getByRole('button', { name: 'Check file' }).click();
}

/** Rows in the admin list for one county in late blight 2023, which no fixture touches. */
function adminRows(page: Page, county: string) {
	return page.locator('tbody tr', { hasText: county });
}

async function openAdmin2023(page: Page) {
	await page.goto('/admin/incidents?year=2023');
}

// These tests write only to late blight 2023, in counties with no fixtures, so they
// cannot disturb the exact counts other tests assert on the 2026 map.
test.describe('CSV import', () => {
	test.describe.configure({ mode: 'serial' });

	test('new rows import, and an identical re-import changes nothing', async ({ page }) => {
		await signIn(page);
		const rows = [
			'late-blight,19169,,,2023-08-01,Potato,US-23,Imported by e2e',
			'late-blight,,NE,Lancaster County,2023-08-02,Tomato,,Imported by e2e'
		];

		await upload(page, 'first.csv', rows);
		await expect(page.getByText('2 new', { exact: true })).toBeVisible();
		await page.getByRole('button', { name: 'Import: add 2' }).click();
		await expect(page.getByRole('heading', { name: 'Imported first.csv' })).toBeVisible();
		await expect(page.getByText('2 added')).toBeVisible();

		await openAdmin2023(page);
		await expect(adminRows(page, 'Story, IA')).toHaveCount(1);
		await expect(adminRows(page, 'Lancaster, NE')).toHaveCount(1);

		// The same file again: everything is already present, nothing to do.
		await upload(page, 'first.csv', rows);
		await expect(page.getByText('2 already present')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Nothing to import' })).toBeDisabled();
	});

	test('a conflicting row is never inserted silently; "replace" updates in place', async ({
		page
	}) => {
		await signIn(page);
		await upload(page, 'changed.csv', [
			'late-blight,19169,,,2023-08-01,Tomato,US-23,Imported by e2e'
		]);

		await expect(page.getByText('1 needs a decision')).toBeVisible();
		const conflict = page.locator('li[data-row="2"]');
		// The safe choice is pre-selected.
		await expect(conflict.getByLabel('Keep existing')).toBeChecked();
		await conflict.getByLabel('Replace with this row').check();
		await page.getByRole('button', { name: 'Import: add 0, update 1' }).click();
		await expect(page.getByText('1 updated')).toBeVisible();

		await openAdmin2023(page);
		await expect(adminRows(page, 'Story, IA')).toHaveCount(1);
		await expect(adminRows(page, 'Story, IA')).toContainText('Tomato');
	});

	test('"keep both" adds a separate detection', async ({ page }) => {
		await signIn(page);
		await upload(page, 'second-crop.csv', [
			'late-blight,19169,,,2023-08-01,Onion,,Imported by e2e'
		]);
		await page.locator('li[data-row="2"]').getByLabel('Add as a separate detection').check();
		await page.getByRole('button', { name: 'Import: add 1' }).click();
		await expect(page.getByText('1 added')).toBeVisible();

		await openAdmin2023(page);
		await expect(adminRows(page, 'Story, IA')).toHaveCount(2);
	});

	test('one bad row blocks the whole file, and says which row and why', async ({ page }) => {
		await signIn(page);
		await upload(page, 'bad.csv', [
			'late-blight,31055,,,2023-09-01,Potato,,Imported by e2e',
			'late-blight,,VA,Richmond,2023-09-02,Potato,,Imported by e2e',
			'rust,99999,,,2099-01-01,,,'
		]);

		const alert = page.getByRole('alert');
		await expect(alert).toContainText("bad.csv can't be imported yet");
		await expect(alert).toContainText('Row 3:');
		await expect(alert).toContainText('matches 2 counties (51159, 51760)');
		await expect(alert).toContainText('Row 4:');
		await expect(alert).toContainText('disease "rust" is not recognised');

		// Row 2 was valid, but nothing was written.
		await openAdmin2023(page);
		await expect(adminRows(page, 'Douglas, NE')).toHaveCount(0);
	});

	test('a detection edited during review sends the admin back to review', async ({
		page,
		context
	}) => {
		await signIn(page);
		await upload(page, 'stale.csv', [
			'late-blight,,NE,Lancaster,2023-08-02,Pepper,,Imported by e2e'
		]);
		await expect(page.getByText('1 needs a decision')).toBeVisible();

		// Meanwhile, someone edits the matched detection.
		const other = await context.newPage();
		await openAdmin2023(other);
		await adminRows(other, 'Lancaster, NE').getByRole('link', { name: 'Edit' }).click();
		await other.fill('#strain', 'US-8');
		await other.getByRole('button', { name: 'Save changes' }).click();
		await expect(other).toHaveURL(/\/admin\/incidents$/);

		await page.locator('li[data-row="2"]').getByLabel('Replace with this row').check();
		await page.getByRole('button', { name: /^Import:/ }).click();
		await expect(page.getByRole('alert')).toContainText('changed while you were reviewing');
		// The choice was reset to the safe default, and nothing was written.
		await expect(page.locator('li[data-row="2"]').getByLabel('Keep existing')).toBeChecked();
		await openAdmin2023(other);
		await expect(adminRows(other, 'Lancaster, NE')).not.toContainText('Pepper');
	});

	test('the template downloads, and its example row cannot be imported as-is', async ({ page }) => {
		await signIn(page);
		const res = await page.request.get('/admin/import/template.csv');
		expect(res.status()).toBe(200);
		const text = await res.text();
		expect(text).toContain('id,disease,county_fips,state,county,observed_on');

		await page.goto('/admin/import');
		await page.setInputFiles('#file', {
			name: 'template.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(text)
		});
		await page.getByRole('button', { name: 'Check file' }).click();
		await expect(page.getByRole('alert')).toContainText("template's example row");
	});
});

test.describe('CSV download', () => {
	test('anyone can download the current disease-year, with public IDs', async ({ request }) => {
		const res = await request.get('/detections.csv?disease=late-blight&year=2026');
		expect(res.status()).toBe(200);
		expect(res.headers()['content-disposition']).toContain('late-blight-2026.csv');

		const lines = (await res.text())
			.replace(/^\uFEFF/, '')
			.trim()
			.split(/\r\n/);
		expect(lines[0]).toBe(
			'id,disease,county_fips,state,county,observed_on,reported_on,crop,operation_type,strain,source,comments'
		);
		// Every row carries a public ID, never the internal integer key.
		for (const line of lines.slice(1)) expect(line).toMatch(/^[bcdfghjkmnpqrstvwxz][2-9a-z]{4},/);
	});

	test('the feed links to the download for what it shows', async ({ page }) => {
		await page.goto('/?disease=cucurbit-downy-mildew&year=2026');
		await expect(page.getByRole('link', { name: 'Download CSV' })).toHaveAttribute(
			'href',
			'/detections.csv?disease=cucurbit-downy-mildew&year=2026'
		);
	});

	test('a download re-imports as entirely already present', async ({ page }) => {
		await signIn(page);
		const csv = await (
			await page.request.get('/detections.csv?disease=late-blight&year=2025')
		).text();
		await page.goto('/admin/import');
		await page.setInputFiles('#file', {
			name: 'roundtrip.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from(csv)
		});
		await page.getByRole('button', { name: 'Check file' }).click();
		await expect(page.getByText('0 new', { exact: true })).toBeVisible();
		await expect(page.getByText('0 need a decision')).toBeVisible();
		await expect(page.getByRole('button', { name: 'Nothing to import' })).toBeDisabled();
	});
});

test.describe('admin guard', () => {
	test('form actions and endpoints under /admin refuse anonymous requests', async ({ request }) => {
		// Same-origin, so SvelteKit's CSRF check passes and the request reaches guardAdmin.
		const post = await request.post('/admin/import?/confirm', {
			headers: { origin: 'http://localhost:4173' },
			form: { csv: 'disease,county_fips,observed_on\nlate-blight,55025,2023-01-01', signature: '' }
		});
		expect(post.status()).toBe(401);

		const get = await request.get('/admin/import/template.csv', { maxRedirects: 0 });
		expect(get.status()).toBe(303);
		expect(get.headers()['location']).toContain('/login');
	});
});

test.describe('single-entry duplicate warning', () => {
	test('a same-day detection warns, and "add anyway" saves it', async ({ page }) => {
		await signIn(page);
		const add = async () => {
			await page.goto('/admin/incidents/new');
			await page.selectOption('#diseaseId', { label: 'Late blight' });
			await page.selectOption('#countyFips', '31079'); // Hall, NE
			await page.fill('#observedOn', '2023-07-04');
			await page.fill('#crop', 'Potato');
		};

		await add();
		await page.getByRole('button', { name: 'Add detection' }).click();
		await expect(page).toHaveURL(/\/admin\/incidents$/);

		await add();
		await page.getByRole('button', { name: 'Add detection' }).click();
		await expect(page.getByRole('alert')).toContainText('already exists');
		await page.getByRole('button', { name: 'Add anyway' }).click();
		await expect(page).toHaveURL(/\/admin\/incidents$/);

		await openAdmin2023(page);
		await expect(adminRows(page, 'Hall, NE')).toHaveCount(2);
	});
});
