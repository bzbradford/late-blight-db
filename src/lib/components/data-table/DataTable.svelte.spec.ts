import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ColumnDef } from '@tanstack/table-core';
import DataTable from './DataTable.svelte';

type Row = { id: number; name: string };

// Names run opposite to IDs, so sorting by one visibly reverses the other.
const rows: Row[] = Array.from({ length: 60 }, (_, i) => ({
	id: i + 1,
	name: `Name ${String(60 - i).padStart(2, '0')}`
}));

const columns: ColumnDef<Row>[] = [
	{ accessorKey: 'id', header: 'ID' },
	{ accessorKey: 'name', header: 'Name' }
];

function renderTable(data = rows, search = '') {
	return render(DataTable<Row>, {
		data,
		columns,
		getRowId: (r) => String(r.id),
		noun: ['thing', 'things'],
		search,
		searchText: (r) => `${r.name} ${r.id % 2 ? 'odd' : 'even'}`
	});
}

/** The Name column's `aria-sort`, read off the header cell holding its sort button. */
function nameSort() {
	return page
		.getByRole('button', { name: 'Name' })
		.element()
		.closest('th')
		?.getAttribute('aria-sort');
}

/** The first cell of each body row. */
function firstColumn() {
	return [...document.querySelectorAll('tbody tr')].map(
		(tr) => tr.querySelector('td')?.textContent
	);
}

describe('DataTable', () => {
	it('pages through the rows', async () => {
		renderTable();

		await expect.element(page.getByText('1–25 of 60 things')).toBeInTheDocument();
		await expect.element(page.getByText('Page 1 of 3')).toBeInTheDocument();
		expect(firstColumn()).toHaveLength(25);
		expect(page.getByRole('button', { name: 'Previous' })).toBeDisabled();

		await page.getByRole('button', { name: 'Next' }).click();
		await page.getByRole('button', { name: 'Next' }).click();
		await expect.element(page.getByText('51–60 of 60 things')).toBeInTheDocument();
		expect(firstColumn()[0]).toBe('51');
		expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();
	});

	it('sorts by a column and starts again from the first page', async () => {
		renderTable();
		await page.getByRole('button', { name: 'Next' }).click();

		// Text sorts ascending first.
		await page.getByRole('button', { name: 'Name' }).click();
		await expect.element(page.getByText('Page 1 of 3')).toBeInTheDocument();
		expect(firstColumn()[0]).toBe('60');
		expect(nameSort()).toBe('ascending');

		await page.getByRole('button', { name: 'Name' }).click();
		expect(firstColumn()[0]).toBe('1');
		expect(nameSort()).toBe('descending');
	});

	it('changes the page size', async () => {
		renderTable();
		await page.getByRole('combobox', { name: 'Rows per page' }).selectOptions('50');
		await expect.element(page.getByText('1–50 of 60 things')).toBeInTheDocument();
		await expect.element(page.getByText('Page 1 of 2')).toBeInTheDocument();
	});

	it('hides the pager when everything fits on one page', async () => {
		renderTable(rows.slice(0, 1));
		await expect.element(page.getByText('1 thing')).toBeInTheDocument();
		expect(page.getByRole('button', { name: 'Next' }).query()).toBeNull();
		expect(page.getByRole('combobox', { name: 'Rows per page' }).query()).toBeNull();
	});

	it('keeps only rows matching every searched word', async () => {
		// Name 01 is row 60, which is even: both words must match.
		renderTable(rows, 'even 01');
		await expect.element(page.getByText('1 of 60 things')).toBeInTheDocument();
		expect(firstColumn()).toEqual(['60']);
		expect(page.getByRole('button', { name: 'Next' }).query()).toBeNull();
	});

	it('says so when nothing matches', async () => {
		renderTable(rows, 'odd 01');
		await expect.element(page.getByText('No results.')).toBeInTheDocument();
		await expect.element(page.getByText('0 of 60 things')).toBeInTheDocument();
	});

	it('pages the matches when there are more than fit', async () => {
		renderTable(rows, 'odd');
		await expect.element(page.getByText('1–25 of 30 matching, of 60 things')).toBeInTheDocument();
		await expect.element(page.getByText('Page 1 of 2')).toBeInTheDocument();
	});
});
