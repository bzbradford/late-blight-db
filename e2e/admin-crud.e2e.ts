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

/** A county with no seeded detections, so assertions cannot collide with fixtures. */
const COUNTY_FIPS = '19153'; // Polk, IA
const COUNTY_LABEL = 'Polk, IA';

test.describe('admin detection management', () => {
	test('the full lifecycle: create, appear publicly, edit, retract, restore', async ({ page }) => {
		await signIn(page);

		// --- create ---
		await page.goto('/admin/incidents/new');
		await page.selectOption('#diseaseId', { label: 'Late blight' });
		await page.selectOption('#countyFips', COUNTY_FIPS);
		await page.fill('#observedOn', '2026-09-05');
		await page.fill('#crop', '  sweet   corn ');
		await page.fill('#operationType', 'commercial farm');
		await page.fill('#comments', 'Created by the end-to-end test.');
		await page.getByRole('button', { name: 'Add detection' }).click();

		await expect(page).toHaveURL(/\/admin\/incidents$/);
		const row = page.locator('tr', { hasText: COUNTY_LABEL });
		await expect(row).toBeVisible();

		// Free text is normalised on the way in: collapsed whitespace, sentence case.
		await expect(row).toContainText('Sweet corn');

		// --- it reaches the public map ---
		await page.goto(`/?disease=late-blight&year=2026&county=${COUNTY_FIPS}`);
		await expect(page.getByText(`${COUNTY_LABEL} — 1 detection`)).toBeVisible();
		await expect(page.getByText('Created by the end-to-end test.')).toBeVisible();

		// --- edit ---
		await page.goto('/admin/incidents');
		await page.locator('tr', { hasText: COUNTY_LABEL }).getByRole('link', { name: 'Edit' }).click();
		await page.fill('#strain', 'US-24');
		await page.getByRole('button', { name: 'Save changes' }).click();
		await expect(page).toHaveURL(/\/admin\/incidents$/);
		await expect(page.locator('tr', { hasText: COUNTY_LABEL })).toContainText('US-24');

		// --- retract ---
		await page.locator('tr', { hasText: COUNTY_LABEL }).getByRole('link', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Retract' }).click();
		await page.getByRole('button', { name: 'Yes, retract it' }).click();
		await expect(page).toHaveURL(/includeDeleted=1/);
		await expect(page.locator('tr', { hasText: COUNTY_LABEL })).toContainText('Retracted');

		// Gone from the public map.
		await page.goto(`/?disease=late-blight&year=2026&county=${COUNTY_FIPS}`);
		await expect(page.getByText('Created by the end-to-end test.')).toHaveCount(0);

		// --- restore ---
		await page.goto('/admin/incidents?includeDeleted=1');
		await page.locator('tr', { hasText: COUNTY_LABEL }).getByRole('link', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Restore' }).click();
		await expect(page).toHaveURL(/\/admin\/incidents$/);
		await expect(page.locator('tr', { hasText: COUNTY_LABEL })).not.toContainText('Retracted');

		// Clean up so the suite can run repeatedly.
		await page.locator('tr', { hasText: COUNTY_LABEL }).getByRole('link', { name: 'Edit' }).click();
		await page.getByRole('button', { name: 'Retract' }).click();
		await page.getByRole('button', { name: 'Yes, retract it' }).click();
	});

	test('a future observation date is refused', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/incidents/new');
		await page.selectOption('#countyFips', COUNTY_FIPS);
		// Bypass the input's max attribute the way a crafted request would.
		await page.evaluate(() => {
			const el = document.querySelector<HTMLInputElement>('#observedOn');
			if (el) {
				el.removeAttribute('max');
				el.value = '2099-01-01';
			}
		});
		await page.getByRole('button', { name: 'Add detection' }).click();
		await expect(page.getByText('The observation date cannot be in the future.')).toBeVisible();
	});

	test('a county outside the database is refused', async ({ page }) => {
		await signIn(page);
		await page.goto('/admin/incidents/new');
		await page.fill('#observedOn', '2026-09-05');
		// 02013 is an Alaska borough — real FIPS, deliberately out of scope.
		await page.evaluate(() => {
			const sel = document.querySelector<HTMLSelectElement>('#countyFips');
			if (sel) {
				const opt = document.createElement('option');
				opt.value = '02013';
				sel.appendChild(opt);
				sel.value = '02013';
			}
		});
		await page.getByRole('button', { name: 'Add detection' }).click();
		await expect(page.getByText('That county is not in the database.')).toBeVisible();
	});

	test('anonymous visitors cannot reach the incident pages', async ({ page }) => {
		await page.goto('/admin/incidents');
		await expect(page).toHaveURL(/\/login/);
		await page.goto('/admin/incidents/new');
		await expect(page).toHaveURL(/\/login/);
	});
});
