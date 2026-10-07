/**
 * Account roles. Both can record detections; only admins manage accounts and import CSVs.
 * See plan.md D15–D20.
 *
 * Shared by the server (which enforces) and the client (which only hides what would be
 * refused anyway).
 */
export const ROLES = ['admin', 'reporter'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = { admin: 'Admin', reporter: 'Reporter' };

export function isRole(value: unknown): value is Role {
	return ROLES.some((r) => r === value);
}

/** Anything that knows who is acting and as what. */
export type Viewer = { id: string; role: Role };

/**
 * Reporters change only the detections they entered; admins change any. A detection with
 * no creator (seeded, or its creator's account gone) is admin-only.
 */
export function canEditIncident(viewer: Viewer | null, createdBy: string | null): boolean {
	if (!viewer) return false;
	return viewer.role === 'admin' || (createdBy !== null && createdBy === viewer.id);
}

/**
 * Permanent deletion is for a detection entered in error, and only an admin may do it —
 * and only once it is retracted, so it has already left the public map.
 */
export function canDeleteIncident(viewer: Viewer | null): boolean {
	return viewer?.role === 'admin';
}

/** Paths under /admin that only admins may reach — pages, form actions, and endpoints. */
export const ADMIN_ONLY_PATHS = ['/admin/users', '/admin/import', '/admin/detections.csv'];

export function isAdminOnlyPath(pathname: string): boolean {
	return ADMIN_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Just the ID and role — what mutations and permission checks need from a signed-in user. */
export function viewerOf(user: Viewer): Viewer {
	return { id: user.id, role: user.role };
}

/** An account as the seniority rule sees it. `adminSince` is null for reporters. */
export type Member = { id: string; role: Role; adminSince: Date | null };

/**
 * Whether `actor` may change `target`'s account — role, email, password reset,
 * deactivation. Admins manage every reporter, but another admin only if they became an
 * admin first, so someone you promote can never demote or lock you out. Nobody manages
 * their own account from here; the earliest admin is effectively the owner.
 *
 * A senior admin who has left is removed with `pnpm create-admin --deactivate`.
 */
export function canManageUser(actor: Member, target: Member): boolean {
	if (actor.role !== 'admin' || !actor.adminSince || actor.id === target.id) return false;
	if (target.role !== 'admin') return true;
	return target.adminSince !== null && actor.adminSince.getTime() < target.adminSince.getTime();
}
