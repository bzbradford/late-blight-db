import { createHash, randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { canManageUser, type Member, type Role, type Viewer } from '$lib/auth/roles';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';
import { account, incidents, invitations, session, user } from '$lib/server/db/schema';
import { auth } from '$lib/server/auth';
import { recordAudit, type Tx } from '$lib/server/queries/audit';
import type { Profile } from '$lib/validation/account';

/**
 * Account management: invitations, reset links, roles, deactivation, profiles.
 *
 * Accounts never come from Better Auth's sign-up endpoint (it is disabled). They are
 * written here, in one transaction with their audit rows, using Better Auth's password
 * hasher so sign-in verifies them exactly as it would its own.
 */

const DAY = 24 * 60 * 60 * 1000;
/** Long enough to reach someone who is out in the field for a few days. */
export const INVITE_TTL_DAYS = 7;
/** Shorter: a reset link takes over an account that already has detections. */
export const RESET_TTL_DAYS = 2;

export type UserRow = {
	id: string;
	name: string;
	email: string;
	affiliation: string | null;
	role: Role;
	adminSince: Date | null;
	/** Who sent the invitation they accepted; null for accounts made by `create-admin`. */
	addedBy: string | null;
	createdAt: Date;
	lastSignInAt: Date | null;
	deactivatedAt: Date | null;
	/** Detections they entered that are still on the map. */
	detections: number;
};

/** Active admins (most senior first), then active reporters, then deactivated accounts. */
export async function listUsers(): Promise<UserRow[]> {
	const detections = db
		.select({ createdBy: incidents.createdBy, n: count().as('n') })
		.from(incidents)
		.where(isNull(incidents.deletedAt))
		.groupBy(incidents.createdBy)
		.as('detections');

	const inviter = alias(user, 'inviter');
	const accepted = db
		.select({ userId: invitations.userId, addedBy: inviter.name })
		.from(invitations)
		.innerJoin(inviter, eq(inviter.id, invitations.createdBy))
		.where(and(eq(invitations.kind, 'invite'), sql`${invitations.usedAt} is not null`))
		.as('accepted');

	const rows = await db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			affiliation: user.affiliation,
			role: user.role,
			adminSince: user.adminSince,
			addedBy: accepted.addedBy,
			createdAt: user.createdAt,
			lastSignInAt: user.lastSignInAt,
			deactivatedAt: user.deactivatedAt,
			detections: sql<number>`coalesce(${detections.n}, 0)::int`
		})
		.from(user)
		.leftJoin(detections, eq(detections.createdBy, user.id))
		.leftJoin(accepted, eq(accepted.userId, user.id))
		.orderBy(
			sql`${user.deactivatedAt} is not null`,
			sql`${user.role} <> 'admin'`,
			asc(user.adminSince),
			asc(user.name)
		);

	// The column has a check constraint; narrowing here keeps the type honest.
	return rows.map((r) => ({ ...r, role: r.role === 'admin' ? 'admin' : 'reporter' }));
}

export type PendingInvite = {
	id: number;
	email: string;
	role: Role;
	createdAt: Date;
	expiresAt: Date;
	invitedBy: string | null;
};

export async function listPendingInvites(): Promise<PendingInvite[]> {
	const rows = await db
		.select({
			id: invitations.id,
			email: invitations.email,
			role: invitations.role,
			createdAt: invitations.createdAt,
			expiresAt: invitations.expiresAt,
			invitedBy: user.name
		})
		.from(invitations)
		.leftJoin(user, eq(user.id, invitations.createdBy))
		.where(and(eq(invitations.kind, 'invite'), usable()))
		.orderBy(desc(invitations.createdAt));
	return rows.map((r) => ({ ...r, role: r.role === 'admin' ? 'admin' : 'reporter' }));
}

// --- tokens ---------------------------------------------------------------------------

/** 256 bits, URL-safe. Only its hash is stored. */
function newToken(): { token: string; hash: string } {
	const token = randomBytes(32).toString('base64url');
	return { token, hash: hashToken(token) };
}

function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Not used, not revoked, not expired. */
function usable() {
	return and(
		isNull(invitations.usedAt),
		isNull(invitations.revokedAt),
		gt(invitations.expiresAt, new Date())
	);
}

export type LinkInfo = { kind: 'invite' | 'reset'; email: string; role: Role | null };

/**
 * What a link is for, if it can still be used. Every other case — unknown, used,
 * revoked, expired — is null, so the page can't tell anyone which one it was.
 */
export async function findLink(token: string): Promise<LinkInfo | null> {
	const [row] = await db
		.select({ kind: invitations.kind, email: invitations.email, role: invitations.role })
		.from(invitations)
		.where(and(eq(invitations.tokenHash, hashToken(token)), usable()))
		.limit(1);
	if (!row) return null;
	return {
		kind: row.kind === 'reset' ? 'reset' : 'invite',
		email: row.email,
		role: row.role === 'admin' ? 'admin' : row.role === 'reporter' ? 'reporter' : null
	};
}

/**
 * Marks a link used and returns it, in the caller's transaction. The conditional update
 * is what makes a link single-use: of two concurrent submissions, only one gets a row.
 */
async function claimLink(tx: Tx, token: string, kind: 'invite' | 'reset') {
	const [row] = await tx
		.update(invitations)
		.set({ usedAt: new Date() })
		.where(and(eq(invitations.tokenHash, hashToken(token)), eq(invitations.kind, kind), usable()))
		.returning();
	return row;
}

// --- admin actions --------------------------------------------------------------------

/** A refusal to show the admin, or null on success. */
type Refusal = string | null;

export async function createInvite(
	email: string,
	role: Role,
	actor: Viewer
): Promise<{ token: string } | { error: string }> {
	return db.transaction(async (tx) => {
		const [existing] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email))
			.limit(1);
		if (existing) return { error: `${email} already has an account.` };

		// One live invitation per address: a new one replaces any still pending.
		await tx
			.update(invitations)
			.set({ revokedAt: new Date() })
			.where(and(eq(invitations.kind, 'invite'), eq(invitations.email, email), usable()));

		const { token, hash } = newToken();
		const [row] = await tx
			.insert(invitations)
			.values({
				tokenHash: hash,
				kind: 'invite',
				email,
				role,
				createdBy: actor.id,
				expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * DAY)
			})
			.returning({ id: invitations.id });
		await recordAudit(tx, {
			table: 'invitations',
			rowId: row.id,
			action: 'invite',
			actorId: actor.id,
			after: { email, role }
		});
		return { token };
	});
}

export async function revokeInvite(id: number, actor: Viewer): Promise<void> {
	await db.transaction(async (tx) => {
		const [row] = await tx
			.update(invitations)
			.set({ revokedAt: new Date() })
			.where(and(eq(invitations.id, id), usable()))
			.returning({ id: invitations.id, email: invitations.email });
		if (!row) return;
		await recordAudit(tx, {
			table: 'invitations',
			rowId: row.id,
			action: 'revoke',
			actorId: actor.id,
			before: { email: row.email }
		});
	});
}

/**
 * Locks the actor's and target's rows and applies the seniority rule (`canManageUser`).
 * Every admin action on an account goes through this, inside its transaction, so a rule
 * checked on one row can't be undone by a concurrent change to the other.
 */
async function managed(
	tx: Tx,
	actor: Viewer,
	targetId: string
): Promise<{ target: typeof user.$inferSelect } | { refusal: string }> {
	if (targetId === actor.id)
		return { refusal: 'Use your account page to change your own account.' };
	const rows = await tx
		.select()
		.from(user)
		.where(or(eq(user.id, actor.id), eq(user.id, targetId)))
		.for('update');
	const self = rows.find((r) => r.id === actor.id);
	const target = rows.find((r) => r.id === targetId);
	if (!self || !target) return { refusal: 'No such user.' };
	if (!canManageUser(member(self), member(target))) {
		return { refusal: 'Only an admin who became an admin before them can change this account.' };
	}
	return { target };
}

function member(row: typeof user.$inferSelect): Member {
	return {
		id: row.id,
		role: row.role === 'admin' ? 'admin' : 'reporter',
		adminSince: row.adminSince
	};
}

export async function createResetLink(
	userId: string,
	actor: Viewer
): Promise<{ token: string; email: string } | { error: string }> {
	return db.transaction(async (tx) => {
		const checked = await managed(tx, actor, userId);
		if ('refusal' in checked) return { error: checked.refusal };
		const { target } = checked;
		if (target.deactivatedAt) return { error: 'Reactivate the account first.' };

		await tx
			.update(invitations)
			.set({ revokedAt: new Date() })
			.where(and(eq(invitations.kind, 'reset'), eq(invitations.userId, userId), usable()));

		const { token, hash } = newToken();
		const [row] = await tx
			.insert(invitations)
			.values({
				tokenHash: hash,
				kind: 'reset',
				email: target.email,
				userId,
				createdBy: actor.id,
				expiresAt: new Date(Date.now() + RESET_TTL_DAYS * DAY)
			})
			.returning({ id: invitations.id });
		await recordAudit(tx, {
			table: 'invitations',
			rowId: row.id,
			action: 'reset-link',
			actorId: actor.id,
			after: { userId, email: target.email }
		});
		return { token, email: target.email };
	});
}

/**
 * Locks every active admin row and returns their IDs, so two admins demoting or
 * deactivating each other at the same moment can't leave nobody in charge.
 */
async function lockActiveAdmins(tx: Tx): Promise<string[]> {
	const rows = await tx
		.select({ id: user.id })
		.from(user)
		.where(and(eq(user.role, 'admin'), isNull(user.deactivatedAt)))
		.for('update');
	return rows.map((r) => r.id);
}

/**
 * Promotion starts the seniority clock; demotion stops it, so an admin who is demoted
 * and promoted again ranks from the second promotion.
 */
export async function setRole(userId: string, role: Role, actor: Viewer): Promise<Refusal> {
	return db.transaction(async (tx) => {
		const admins = await lockActiveAdmins(tx);
		const checked = await managed(tx, actor, userId);
		if ('refusal' in checked) return checked.refusal;
		const before = checked.target;
		if (before.role === role) return null;
		if (role !== 'admin' && admins.includes(userId) && admins.length === 1) {
			return 'There must always be at least one active admin.';
		}

		const adminSince = role === 'admin' ? new Date() : null;
		await tx.update(user).set({ role, adminSince }).where(eq(user.id, userId));
		await recordAudit(tx, {
			table: 'user',
			rowId: userId,
			action: 'set-role',
			actorId: actor.id,
			before: { role: before.role, adminSince: before.adminSince },
			after: { role, adminSince }
		});
		return null;
	});
}

/**
 * Sign-in is by email, so a changed address takes effect at their next sign-in: their
 * sessions end now, and any unused reset link (made out to the old address) dies.
 */
export async function setEmail(userId: string, email: string, actor: Viewer): Promise<Refusal> {
	return db.transaction(async (tx) => {
		const checked = await managed(tx, actor, userId);
		if ('refusal' in checked) return checked.refusal;
		const before = checked.target.email;
		if (before === email) return null;

		const [taken] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, email))
			.limit(1);
		if (taken) return `${email} already belongs to another account.`;
		const [invited] = await tx
			.select({ id: invitations.id })
			.from(invitations)
			.where(and(eq(invitations.kind, 'invite'), eq(invitations.email, email), usable()))
			.limit(1);
		if (invited) return `${email} has a pending invitation. Revoke it first.`;

		await tx.update(user).set({ email }).where(eq(user.id, userId));
		await tx.delete(session).where(eq(session.userId, userId));
		await tx
			.update(invitations)
			.set({ revokedAt: new Date() })
			.where(and(eq(invitations.userId, userId), usable()));
		await recordAudit(tx, {
			table: 'user',
			rowId: userId,
			action: 'set-email',
			actorId: actor.id,
			before: { email: before },
			after: { email }
		});
		return null;
	});
}

/**
 * Deactivation, never deletion: a deleted user would take the "Reported by" of every
 * detection they entered with them. Their sessions end now, and any reset link dies.
 */
export async function deactivateUser(userId: string, actor: Viewer): Promise<Refusal> {
	return db.transaction(async (tx) => {
		const admins = await lockActiveAdmins(tx);
		const checked = await managed(tx, actor, userId);
		if ('refusal' in checked) return checked.refusal;
		if (checked.target.deactivatedAt) return null;
		if (admins.includes(userId) && admins.length === 1) {
			return 'There must always be at least one active admin.';
		}

		await tx.update(user).set({ deactivatedAt: new Date() }).where(eq(user.id, userId));
		await tx.delete(session).where(eq(session.userId, userId));
		await tx
			.update(invitations)
			.set({ revokedAt: new Date() })
			.where(and(eq(invitations.userId, userId), usable()));
		await recordAudit(tx, {
			table: 'user',
			rowId: userId,
			action: 'deactivate',
			actorId: actor.id
		});
		return null;
	});
}

/** Also under the seniority rule, so a junior admin can't undo a deactivation above them. */
export async function reactivateUser(userId: string, actor: Viewer): Promise<Refusal> {
	return db.transaction(async (tx) => {
		const checked = await managed(tx, actor, userId);
		if ('refusal' in checked) return checked.refusal;
		if (!checked.target.deactivatedAt) return null;

		await tx.update(user).set({ deactivatedAt: null }).where(eq(user.id, userId));
		await recordAudit(tx, {
			table: 'user',
			rowId: userId,
			action: 'reactivate',
			actorId: actor.id
		});
		return null;
	});
}

// --- the link's recipient -------------------------------------------------------------

async function hashPassword(password: string): Promise<string> {
	return (await auth.$context).password.hash(password);
}

/** Better Auth's IDs are 32 URL-safe characters; any unique text works. */
function newId(): string {
	return randomBytes(24).toString('base64url');
}

/**
 * Creates the account an invitation promised. Returns the email address to sign in with,
 * or null if the link can't be used (including if the address got an account meanwhile).
 */
export async function acceptInvite(
	token: string,
	profile: Profile,
	password: string
): Promise<string | null> {
	const passwordHash = await hashPassword(password);
	return db.transaction(async (tx) => {
		const link = await claimLink(tx, token, 'invite');
		if (!link) return null;

		const [taken] = await tx
			.select({ id: user.id })
			.from(user)
			.where(eq(user.email, link.email))
			.limit(1);
		if (taken) {
			// Leave the link used: it can never succeed now.
			return null;
		}

		const role: Role = link.role === 'admin' ? 'admin' : 'reporter';
		const userId = newId();
		await tx.insert(user).values({
			id: userId,
			email: link.email,
			// Only an admin-sent link reaches this address, and the recipient proved they
			// received it.
			emailVerified: true,
			name: profile.name,
			affiliation: profile.affiliation,
			role,
			adminSince: role === 'admin' ? new Date() : null
		});
		await tx.insert(account).values({
			id: newId(),
			userId,
			accountId: userId,
			providerId: 'credential',
			password: passwordHash
		});
		await tx.update(invitations).set({ userId }).where(eq(invitations.id, link.id));
		await recordAudit(tx, {
			table: 'user',
			rowId: userId,
			action: 'accept-invite',
			actorId: userId,
			after: { email: link.email, role, ...profile, invitation: link.id }
		});
		return link.email;
	});
}

/** Sets a new password from a reset link and signs the account out everywhere. */
export async function resetPassword(token: string, password: string): Promise<string | null> {
	const passwordHash = await hashPassword(password);
	return db.transaction(async (tx) => {
		const link = await claimLink(tx, token, 'reset');
		if (!link?.userId) return null;

		const [target] = await tx
			.select({ email: user.email })
			.from(user)
			.where(and(eq(user.id, link.userId), isNull(user.deactivatedAt)))
			.limit(1);
		if (!target) return null;

		const updated = await tx
			.update(account)
			.set({ password: passwordHash })
			.where(and(eq(account.userId, link.userId), eq(account.providerId, 'credential')))
			.returning({ id: account.id });
		if (updated.length === 0) {
			await tx.insert(account).values({
				id: newId(),
				userId: link.userId,
				accountId: link.userId,
				providerId: 'credential',
				password: passwordHash
			});
		}
		await tx.delete(session).where(eq(session.userId, link.userId));
		await recordAudit(tx, {
			table: 'user',
			rowId: link.userId,
			action: 'reset-password',
			actorId: link.userId,
			after: { invitation: link.id }
		});
		return target.email;
	});
}

// --- self-service ---------------------------------------------------------------------

export async function updateProfile(userId: string, profile: Profile): Promise<void> {
	await db.transaction(async (tx) => {
		const [before] = await tx
			.select({ name: user.name, affiliation: user.affiliation })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		await tx.update(user).set(profile).where(eq(user.id, userId));
		await recordAudit(tx, {
			table: 'user',
			rowId: userId,
			action: 'update-profile',
			actorId: userId,
			before,
			after: profile
		});
	});
}

/** For the password form's audit row; Better Auth itself changes the password. */
export async function recordPasswordChange(userId: string): Promise<void> {
	await db.transaction((tx) =>
		recordAudit(tx, { table: 'user', rowId: userId, action: 'change-password', actorId: userId })
	);
}
