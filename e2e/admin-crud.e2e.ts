import { expect, test, type Page } from '@playwright/test';
import { signInAs } from './sessions';

/** Types into the county picker and takes the first match with Enter, as a keyboard user would. */
async function pickCounty(page: Page, query: string) {
	await page.fill('#countyFips', query);
	await page.keyboard.press('Enter');
}

/** A county with no seeded detections, so assertions cannot collide with fixtures. */
const COUNTY_FIPS = '19153'; // Polk, IA
const COUNTY_LABEL = 'Polk, IA';
const ORIGIN = 'http://localhost:4173';

test.describe('admin detection management', () => {
	test('the full lifecycle, through the modal: create, appear publicly, edit, retract, restore', async ({
		page
	}) => {
		await signInAs(page, 'admin');
		const dialog = page.getByRole('dialog');
		const row = () => page.locator('tr', { hasText: COUNTY_LABEL });

		// --- create ---
		await page.getByRole('link', { name: 'Add detection' }).click();
		await expect(dialog).toBeVisible();
		await page.selectOption('#diseaseId', { label: 'Late blight' });
		await pickCounty(page, 'Polk Iowa');
		// 2024: a season no other test counts, so this row can't race the feed tests.
		await page.fill('#observedOn', '2024-09-05');
		await page.fill('#crop', '  sweet   corn ');
		await page.fill('#operationType', 'commercial farm');
		await page.fill('#comments', 'Created by the end-to-end test.');
		await dialog.getByRole('button', { name: 'Add detection' }).click();

		// The modal closes over the same page, and the list refreshes behind it.
		await expect(dialog).toHaveCount(0);
		await expect(page).toHaveURL(/\/admin$/);
		await expect(row()).toBeVisible();
		// Free text is normalised on the way in: collapsed whitespace, sentence case.
		await expect(row()).toContainText('Sweet corn');

		// --- it reaches the public map ---
		await page.goto(`/?disease=late-blight&year=2024&county=${COUNTY_FIPS}`);
		await expect(page.getByText(`${COUNTY_LABEL} — 1 detection`)).toBeVisible();
		await expect(page.getByText('Created by the end-to-end test.')).toBeVisible();

		// --- edit ---
		await page.goto('/admin');
		await row().getByRole('link', { name: 'Edit' }).click();
		await expect(dialog).toBeVisible();
		await page.fill('#strain', 'US-24');
		await dialog.getByRole('button', { name: 'Save changes' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(row()).toContainText('US-24');

		// --- retract ---
		await row().getByRole('link', { name: 'Edit' }).click();
		await dialog.getByRole('button', { name: 'Retract' }).click();
		await dialog.getByRole('button', { name: 'Yes, retract it' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(row()).toHaveCount(0);

		// Gone from the public map.
		await page.goto(`/?disease=late-blight&year=2024&county=${COUNTY_FIPS}`);
		await expect(page.getByText('Created by the end-to-end test.')).toHaveCount(0);

		// --- restore ---
		await page.goto('/admin?includeDeleted=1');
		await expect(row()).toContainText('Retracted');
		await row().getByRole('link', { name: 'Edit' }).click();
		await dialog.getByRole('button', { name: 'Restore' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(row()).not.toContainText('Retracted');

		// --- delete: only once retracted, and only after confirming ---
		await row().getByRole('link', { name: 'Edit' }).click();
		await expect(dialog.getByRole('button', { name: 'Delete' })).toHaveCount(0);
		await dialog.getByRole('button', { name: 'Retract' }).click();
		await dialog.getByRole('button', { name: 'Yes, retract it' }).click();
		await expect(dialog).toHaveCount(0);

		await row().getByRole('link', { name: 'Edit' }).click();
		await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
		const confirm = page.getByRole('dialog', { name: 'Delete this detection permanently?' });
		await expect(confirm).toContainText('cannot be undone');
		await confirm.getByRole('button', { name: 'Cancel' }).click();
		await expect(confirm).toHaveCount(0);
		await expect(row()).toBeVisible();

		await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
		await confirm.getByRole('button', { name: 'Delete permanently' }).click();
		await expect(page.getByRole('dialog')).toHaveCount(0);
		await expect(row()).toHaveCount(0);
		await page.goto('/admin?includeDeleted=1');
		await expect(row()).toHaveCount(0);
	});

	test('a detection that is not retracted can’t be deleted', async ({ page }) => {
		await signInAs(page, 'admin');
		const res = await page.request.post('/admin/incidents/2?/delete', {
			headers: { origin: ORIGIN },
			form: {}
		});
		expect(res.status()).toBe(409);
	});

	test('the edit page still works on its own, for direct links', async ({ page }) => {
		await signInAs(page, 'admin');
		const href = await page.getByRole('link', { name: 'Edit' }).first().getAttribute('href');
		await page.goto(href!);
		await expect(page.getByRole('button', { name: 'Save changes' })).toBeVisible();
		await expect(page.getByRole('dialog')).toHaveCount(0);
	});

	test('a modal with unsaved changes asks before closing', async ({ page }) => {
		await signInAs(page, 'admin');
		const dialog = page.getByRole('dialog');
		await page.getByRole('link', { name: 'Edit' }).first().click();
		// Focus moving in marks the dialog as ready; before that it ignores outside clicks,
		// so the click that opened it can't also close it.
		await expect(page.locator('#diseaseId')).toBeFocused();

		// Untouched: clicking outside closes it.
		await page.mouse.click(5, 5);
		await expect(dialog).toHaveCount(0);

		// A change, then undone: nothing to lose, so it still closes.
		await page.getByRole('link', { name: 'Edit' }).first().click();
		await expect(page.locator('#diseaseId')).toBeFocused();
		const original = await page.inputValue('#comments');
		await page.fill('#comments', original + ' draft');
		await page.fill('#comments', original);
		await page.keyboard.press('Escape');
		await expect(dialog).toHaveCount(0);

		// A real change: outside click, Escape, and Back all ask first.
		await page.getByRole('link', { name: 'Edit' }).first().click();
		await expect(page.locator('#diseaseId')).toBeFocused();
		await page.fill('#comments', original + ' unsaved');
		const prompt = dialog.getByText('Discard unsaved changes?');

		await page.mouse.click(5, 5);
		await expect(prompt).toBeVisible();
		await dialog.getByRole('button', { name: 'Keep editing' }).click();
		await expect(prompt).toHaveCount(0);
		await expect(page.locator('#comments')).toHaveValue(original + ' unsaved');

		await page.keyboard.press('Escape');
		await expect(prompt).toBeVisible();
		await dialog.getByRole('button', { name: 'Keep editing' }).click();

		await page.goBack();
		await expect(prompt).toBeVisible();
		await expect(page).toHaveURL(/\/admin$/);

		await dialog.getByRole('button', { name: 'Discard' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page).toHaveURL(/\/admin$/);
	});

	test('a refused save stays in the modal with what was typed', async ({ page }) => {
		await signInAs(page, 'admin');
		const dialog = page.getByRole('dialog');
		await page.getByRole('link', { name: 'Add detection' }).click();
		await pickCounty(page, 'Polk Iowa');
		await page.fill('#crop', 'Potato');
		await page.evaluate(() => {
			const el = document.querySelector<HTMLInputElement>('#observedOn');
			if (el) {
				el.removeAttribute('max');
				el.value = '2099-01-01';
			}
		});
		await dialog.getByRole('button', { name: 'Add detection' }).click();
		await expect(dialog.getByText('The observation date cannot be in the future.')).toBeVisible();
		await expect(page.locator('input[name="countyFips"]')).toHaveValue(COUNTY_FIPS);
		await expect(page.locator('#countyFips')).toHaveValue(COUNTY_LABEL);
		await expect(page.locator('#crop')).toHaveValue('Potato');
	});

	test('the county picker searches, and only a chosen county can be saved', async ({ page }) => {
		await signInAs(page, 'admin');
		const dialog = page.getByRole('dialog');
		await page.getByRole('link', { name: 'Add detection' }).click();
		const county = page.locator('#countyFips');
		const hidden = page.locator('input[name="countyFips"]');
		// Scoped to the picker: the page's native selects expose options too.
		const options = page.locator('#countyFips-options').getByRole('option');

		// Typing narrows the list; state names and "County" are understood.
		await county.fill('polk county');
		await expect(options.filter({ hasText: /Polk\s*Iowa/ })).toBeVisible();
		await county.fill('polk county, iowa');
		await expect(options).toHaveCount(1);

		// Escape closes the list, not the dialog.
		await page.keyboard.press('Escape');
		await expect(options).toHaveCount(0);
		await expect(dialog).toBeVisible();

		// Clicking an option chooses it.
		await county.fill('polk iow');
		await options.filter({ hasText: /Polk/ }).click();
		await expect(county).toHaveValue(COUNTY_LABEL);
		await expect(hidden).toHaveValue(COUNTY_FIPS);

		// Editing the text un-chooses it, and the form will not submit a typed name.
		await county.fill('Polk somewhere');
		await expect(hidden).toHaveValue('');
		await page.fill('#observedOn', '2026-09-05');
		await dialog.getByRole('button', { name: 'Add detection' }).click();
		await expect(dialog).toBeVisible();
		expect(await county.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);

		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await dialog.getByRole('button', { name: 'Discard' }).click();
		await expect(dialog).toHaveCount(0);
	});

	test('a report dated before the observation cannot be saved', async ({ page }) => {
		await signInAs(page, 'admin');
		const dialog = page.getByRole('dialog');
		await page.getByRole('link', { name: 'Edit' }).first().click();
		const save = dialog.getByRole('button', { name: 'Save changes' });

		const observed = await page.inputValue('#observedOn');
		const dayBefore = new Date(`${observed}T12:00:00`);
		dayBefore.setDate(dayBefore.getDate() - 1);
		const before = dayBefore.toISOString().slice(0, 10);

		await page.fill('#reportedOn', before);
		await expect(
			dialog.getByText('A detection cannot be reported before it was observed.')
		).toBeVisible();
		await expect(save).toBeDisabled();
		// The picker also greys out earlier dates.
		await expect(page.locator('#reportedOn')).toHaveAttribute('min', observed);

		await page.fill('#reportedOn', observed);
		await expect(save).toBeEnabled();
		await expect(dialog.getByText('cannot be reported before')).toHaveCount(0);
	});

	test('Cancel behaves like clicking outside the modal', async ({ page }) => {
		await signInAs(page, 'admin');
		const dialog = page.getByRole('dialog');

		await page.getByRole('link', { name: 'Edit' }).first().click();
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog).toHaveCount(0);

		await page.getByRole('link', { name: 'Edit' }).first().click();
		await page.fill('#crop', 'Something else');
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog.getByText('Discard unsaved changes?')).toBeVisible();
		await dialog.getByRole('button', { name: 'Discard' }).click();
		await expect(dialog).toHaveCount(0);
	});

	test('filters apply as they change, and can be reset', async ({ page }) => {
		await signInAs(page, 'admin');
		const reset = page.getByRole('link', { name: 'Reset filters' });
		await expect(reset).toHaveCount(0);

		// The year list comes from the data, newest first.
		const years = await page.locator('#filter-year option').allTextContents();
		expect(years[0]).toBe('All years');
		expect(years.slice(1)).toContain('2026');
		expect(years.slice(1)).toEqual([...years.slice(1)].sort().reverse());

		await page.selectOption('#filter-year', '2026');
		await expect(page).toHaveURL(/\/admin\?year=2026$/);
		await expect(page.locator('tbody tr').first()).toContainText('2026');
		await expect(reset).toBeVisible();

		await page.selectOption('#filter-disease', { label: 'Late blight' });
		await expect(page).toHaveURL(/diseaseId=\d+&year=2026/);
		await expect(page.locator('tbody tr', { hasText: 'Cucurbit downy mildew' })).toHaveCount(0);

		await reset.click();
		await expect(page).toHaveURL(/\/admin$/);
		await expect(page.locator('#filter-year')).toHaveValue('');
		await expect(reset).toHaveCount(0);
	});

	test('the old list URL redirects, keeping its filters', async ({ page }) => {
		await signInAs(page, 'admin');
		await page.goto('/admin/incidents?year=2026');
		await expect(page).toHaveURL(/\/admin\?year=2026$/);
	});

	test('an admin can edit a detection from the public map', async ({ page }) => {
		await signInAs(page, 'admin');
		await page.goto('/?disease=late-blight&year=2026');
		const card = page.locator('li[data-fips="55025"]').first();
		await card.getByRole('button', { name: /^Details:/ }).click();

		const dialog = page.getByRole('dialog');
		await dialog.getByRole('button', { name: 'Edit' }).click();
		await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeVisible();
		// The public address stays clean throughout.
		await expect(page).toHaveURL(/\/$/);

		const original = await page.inputValue('#source');
		await page.fill('#source', 'Edited from the map by e2e');
		await dialog.getByRole('button', { name: 'Save changes' }).click();
		await expect(dialog).toHaveCount(0);
		await expect(page).toHaveURL(/\/$/);
		// The feed refreshed without a reload.
		await expect(page.getByText('Edited from the map by e2e')).toBeVisible();

		// Put it back so other tests see the fixture.
		await card.getByRole('button', { name: /^Details:/ }).click();
		await dialog.getByRole('button', { name: 'Edit' }).click();
		await page.fill('#source', original);
		await dialog.getByRole('button', { name: 'Save changes' }).click();
		await expect(dialog).toHaveCount(0);
	});

	test('a future observation date is refused', async ({ page }) => {
		await signInAs(page, 'admin');
		await page.goto('/admin/incidents/new');
		await pickCounty(page, 'Polk Iowa');
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
		await signInAs(page, 'admin');
		await page.goto('/admin/incidents/new');
		await page.fill('#observedOn', '2026-09-05');
		// 02013 is an Alaska borough — real FIPS, deliberately out of scope. Forge the post
		// the way a crafted request would: past the picker, straight into the hidden field.
		await page.evaluate(() => {
			const hidden = document.querySelector<HTMLInputElement>('input[name="countyFips"]');
			const visible = document.querySelector<HTMLInputElement>('#countyFips');
			if (hidden && visible) {
				hidden.value = '02013';
				visible.value = 'Aleutians East, AK';
				visible.setCustomValidity('');
			}
		});
		await page.getByRole('button', { name: 'Add detection' }).click();
		await expect(page.getByText('That county is not in the database.')).toBeVisible();
	});

	test('anonymous visitors cannot reach the incident pages', async ({ page }) => {
		await page.goto('/admin');
		await expect(page).toHaveURL(/\/login/);
		await page.goto('/admin/incidents/new');
		await expect(page).toHaveURL(/\/login/);
	});
});
