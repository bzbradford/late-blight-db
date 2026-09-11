import { execSync } from 'node:child_process';

/**
 * Resets the database to the development fixture before the suite runs.
 *
 * Several tests assert exact counts ("5 detections"), and the admin CRUD test creates
 * rows. Without this, a failed run leaves records behind that silently break unrelated
 * tests on the next run — which is exactly what happened before it existed.
 */
export default function globalSetup() {
	execSync('pnpm seed:dev', { stdio: 'inherit' });
}
