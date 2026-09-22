/**
 * Public detection IDs — see `drizzle/0002_public_id_function.sql`, which generates them.
 *
 * Five characters, lowercase, always starting with a letter. The database generates
 * them; this module only recognises them, e.g. in an imported CSV.
 */
export const PUBLIC_ID_LETTERS = 'bcdfghjkmnpqrstvwxz';
export const PUBLIC_ID_ALPHABET = '23456789bcdfghjkmnpqrstvwxz';

const PATTERN = new RegExp(`^[${PUBLIC_ID_LETTERS}][${PUBLIC_ID_ALPHABET}]{4}$`);

/** Case-insensitive: someone retyping an ID from a printout may capitalise it. */
export function normalizePublicId(value: string): string | null {
	const id = value.trim().toLowerCase();
	return PATTERN.test(id) ? id : null;
}
