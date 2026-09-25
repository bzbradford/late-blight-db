import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/**
 * Signed-in sessions for the two seeded accounts, created once by `auth.setup.ts`.
 *
 * Signing in through the form in every test hashes a password each time, and under a
 * parallel run that alone was slow enough to time tests out. Tests that are *about*
 * signing in still use the form.
 */
export const ACCOUNTS = {
	admin: { email: 'e2e-admin@example.com', password: 'e2e-test-password-123' },
	reporter: { email: 'e2e-reporter@example.com', password: 'e2e-test-password-456' }
} as const;

export type Account = keyof typeof ACCOUNTS;

export function statePath(account: Account) {
	return `e2e/.auth/${account}.json`;
}

/** Puts the saved session's cookie into this page's context and opens the detections table. */
export async function signInAs(page: Page, account: Account) {
	const state: { cookies: Parameters<ReturnType<Page['context']>['addCookies']>[0] } = JSON.parse(
		readFileSync(statePath(account), 'utf8')
	);
	await page.context().addCookies(state.cookies);
	await page.goto('/detections');
	await expect(page).toHaveURL(/\/detections$/);
}

/** Signs in through the form, as a person would. */
export async function signInWithForm(page: Page, account: { email: string; password: string }) {
	await page.goto('/login');
	await page.getByLabel('Email').fill(account.email);
	await page.getByLabel('Password').fill(account.password);
	await page.getByRole('button', { name: /Sign in/ }).click();
	await expect(page).toHaveURL(/\/detections$/);
}
