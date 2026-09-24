import { db } from '$lib/server/db';
import { auditLog } from '$lib/server/db/schema';

/** A transaction handle, so audit rows commit or roll back with the change they record. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Records one change in `audit_log`. Every mutation of incidents, users, and invitations
 * calls this inside the transaction that makes the change.
 */
export async function recordAudit(
	tx: Tx,
	entry: {
		table: 'incidents' | 'user' | 'invitations';
		rowId: string | number;
		action: string;
		actorId: string | null;
		before?: unknown;
		after?: unknown;
	}
) {
	await tx.insert(auditLog).values({
		actorId: entry.actorId,
		tableName: entry.table,
		rowId: String(entry.rowId),
		action: entry.action,
		before: entry.before ?? null,
		after: entry.after ?? null
	});
}
