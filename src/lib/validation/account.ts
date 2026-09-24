/**
 * Validation for account fields, shared by the invite, account, and reset forms and by
 * `scripts/create-admin.ts` — a plain module, so the script can import it too.
 */

/** Better Auth's `minPasswordLength`, and the floor every password form checks. */
export const MIN_PASSWORD_LENGTH = 12;
/** Better Auth's default maximum. */
export const MAX_PASSWORD_LENGTH = 128;

const MAX_NAME = 80;
const MAX_AFFILIATION = 120;

/**
 * Display names and affiliations are shown publicly beside detections. Collapse
 * whitespace, but leave casing alone — unlike crop names, a person's name or an
 * institution's is spelled the way its owner spells it.
 */
function clean(value: FormDataEntryValue | null): string {
	return value === null ? '' : String(value).trim().replace(/\s+/g, ' ');
}

export type Profile = { name: string; affiliation: string | null };
export type ProfileErrors = Partial<Record<keyof Profile, string>>;

export function parseProfile(data: { get(name: string): FormDataEntryValue | null }): {
	values: Profile;
	errors: ProfileErrors;
} {
	const name = clean(data.get('name'));
	const affiliation = clean(data.get('affiliation'));
	const errors: ProfileErrors = {};

	if (!name) errors.name = 'Enter the name to show beside your detections.';
	else if (name.length > MAX_NAME) errors.name = `Keep it under ${MAX_NAME} characters.`;
	if (affiliation.length > MAX_AFFILIATION) {
		errors.affiliation = `Keep it under ${MAX_AFFILIATION} characters.`;
	}

	return { values: { name, affiliation: affiliation || null }, errors };
}

/** Why a new password is unacceptable, or null. */
export function checkNewPassword(password: string, confirm: string): string | null {
	if (password.length < MIN_PASSWORD_LENGTH) {
		return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
	}
	if (password.length > MAX_PASSWORD_LENGTH) {
		return `Use at most ${MAX_PASSWORD_LENGTH} characters.`;
	}
	if (password !== confirm) return 'The two passwords do not match.';
	return null;
}

export function normalizeEmail(value: FormDataEntryValue | null): string {
	return value === null ? '' : String(value).trim().toLowerCase();
}

export function isEmail(value: string): boolean {
	return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) && value.length <= 254;
}

/** "Jane Doe · UW–Madison Plant Pathology", or just the name. */
export function formatReporter(r: { name: string; affiliation: string | null }): string {
	return r.affiliation ? `${r.name} · ${r.affiliation}` : r.name;
}
