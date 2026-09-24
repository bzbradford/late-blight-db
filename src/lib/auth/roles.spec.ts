import { describe, expect, it } from 'vitest';
import { canEditIncident, canManageUser, isAdminOnlyPath, isRole } from './roles';

const admin = { id: 'a', role: 'admin' } as const;
const reporter = { id: 'r', role: 'reporter' } as const;

describe('canEditIncident', () => {
	it('lets admins edit anything, including rows with no creator', () => {
		expect(canEditIncident(admin, 'r')).toBe(true);
		expect(canEditIncident(admin, null)).toBe(true);
	});

	it('lets reporters edit only what they entered', () => {
		expect(canEditIncident(reporter, 'r')).toBe(true);
		expect(canEditIncident(reporter, 'a')).toBe(false);
		expect(canEditIncident(reporter, null)).toBe(false);
	});

	it('refuses the public', () => {
		expect(canEditIncident(null, null)).toBe(false);
		expect(canEditIncident(null, 'r')).toBe(false);
	});
});

describe('isAdminOnlyPath', () => {
	it('covers the users and import areas, and everything under them', () => {
		for (const p of ['/admin/users', '/admin/import', '/admin/import/template.csv']) {
			expect(isAdminOnlyPath(p)).toBe(true);
		}
	});

	it('leaves the shared admin area and look-alike paths alone', () => {
		for (const p of ['/admin', '/admin/account', '/admin/incidents/new', '/admin/importer']) {
			expect(isAdminOnlyPath(p)).toBe(false);
		}
	});
});

describe('isRole', () => {
	it('accepts only known roles', () => {
		expect(isRole('admin')).toBe(true);
		expect(isRole('reporter')).toBe(true);
		expect(isRole('Admin')).toBe(false);
		expect(isRole(null)).toBe(false);
	});
});

describe('canManageUser', () => {
	const at = (day: number) => new Date(Date.UTC(2026, 0, day));
	const founder = { id: 'f', role: 'admin', adminSince: at(1) } as const;
	const promoted = { id: 'p', role: 'admin', adminSince: at(10) } as const;
	const rep = { id: 'r', role: 'reporter', adminSince: null } as const;

	it('lets any admin manage reporters', () => {
		expect(canManageUser(founder, rep)).toBe(true);
		expect(canManageUser(promoted, rep)).toBe(true);
	});

	it('lets an admin manage only admins who became admins after them', () => {
		expect(canManageUser(founder, promoted)).toBe(true);
		expect(canManageUser(promoted, founder)).toBe(false);
		expect(canManageUser(founder, { ...founder, id: 'twin' })).toBe(false);
	});

	it('never lets anyone manage themselves, and never lets reporters manage anyone', () => {
		expect(canManageUser(founder, founder)).toBe(false);
		expect(canManageUser(rep, { ...rep, id: 'other' })).toBe(false);
	});
});
