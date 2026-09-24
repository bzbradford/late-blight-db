import { test as setup } from '@playwright/test';
import { ACCOUNTS, signInWithForm, statePath, type Account } from './sessions';

for (const account of Object.keys(ACCOUNTS) as Account[]) {
	setup(`sign in as the dev ${account}`, async ({ page }) => {
		await signInWithForm(page, ACCOUNTS[account]);
		await page.context().storageState({ path: statePath(account) });
	});
}
