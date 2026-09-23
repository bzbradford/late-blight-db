/**
 * County labels for newsletter screenshots: which detections get one, and where each
 * label sits. Pure — the map component projects coordinates and measures boxes, and
 * this decides the rest, so the layout is testable and the image export (Track 5F) can
 * redraw exactly what is on screen from the same data.
 */

/** A deliberate cap: past ~10, labels crowd the map into illegibility. */
export const MAX_LABELS = 10;

/** Default window when labels are first turned on — a weekly newsletter's "this week". */
export const DEFAULT_LABEL_DAYS = 7;

export type LabelSource = {
	countyFips: string;
	observedOn: string;
};

/**
 * One label per county, for its latest detection on or after `since`; the most recent
 * `max` of those. `total` is how many counties qualified, so the panel can say
 * "showing 10 of 14".
 */
export function selectLabels<T extends LabelSource>(
	detections: T[],
	since: string,
	max = MAX_LABELS
): { labels: T[]; total: number } {
	const latest = new Map<string, T>();
	for (const d of detections) {
		if (d.observedOn < since) continue;
		const current = latest.get(d.countyFips);
		if (!current || d.observedOn > current.observedOn) latest.set(d.countyFips, d);
	}
	const ranked = [...latest.values()].sort(
		(a, b) => b.observedOn.localeCompare(a.observedOn) || a.countyFips.localeCompare(b.countyFips)
	);
	return { labels: ranked.slice(0, max), total: ranked.length };
}

// --- Dates ------------------------------------------------------------------------------

function parseIso(iso: string): Date {
	const [y, m, d] = iso.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
	const d = parseIso(iso);
	d.setUTCDate(d.getUTCDate() + days);
	return toIso(d);
}

export function daysBetweenIso(from: string, to: string): number {
	return Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86_400_000);
}

/**
 * The end of the slider's range. For the current season that is today; for a past one it
 * is the season's last detection, so "the last 7 days" means the end of that season
 * rather than a week of December with nothing in it.
 */
export function labelRangeEnd(year: number, todayIso: string, detections: LabelSource[]): string {
	if (Number(todayIso.slice(0, 4)) === year) return todayIso;
	const last = detections.reduce<string | null>(
		(max, d) => (max === null || d.observedOn > max ? d.observedOn : max),
		null
	);
	return last ?? `${year}-12-31`;
}

export function defaultLabelSince(year: number, end: string): string {
	const since = addDays(end, -DEFAULT_LABEL_DAYS);
	const jan1 = `${year}-01-01`;
	return since < jan1 ? jan1 : since;
}

// --- Placement --------------------------------------------------------------------------

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
/** Offset of the label box's centre from its anchor, in screen pixels. */
export type Offset = { dx: number; dy: number };

export type PlacementInput = {
	id: string;
	anchor: Point;
	/** Measured label size. */
	w: number;
	h: number;
	/** Set when the admin dragged this label; it then stays exactly where they put it. */
	fixed?: Offset;
};

const LEADER = 48;
const GAP = 6;
const ITERATIONS = 80;

function overlap(a: Rect, b: Rect, gap: number): { x: number; y: number } | null {
	const ox = Math.min(a.x + a.w + gap, b.x + b.w + gap) - Math.max(a.x, b.x);
	const oy = Math.min(a.y + a.h + gap, b.y + b.h + gap) - Math.max(a.y, b.y);
	return ox > 0 && oy > 0 ? { x: ox, y: oy } : null;
}

/**
 * Places labels so they don't overlap each other or the map's own controls.
 *
 * Labels start on a short leader pointing away from the group's centre, so a cluster
 * fans outward instead of piling onto itself. Overlaps are then pushed apart along
 * whichever axis needs the smaller move, repeatedly, and labels are kept inside the
 * viewport. Dragged (`fixed`) labels never move; the others flow around them.
 *
 * This is a heuristic, not a solver: with ten labels in one small region it can still
 * leave a crowded result — which is why labels can be dragged.
 */
export function placeLabels(
	inputs: PlacementInput[],
	viewport: { width: number; height: number },
	obstacles: Rect[] = []
): Map<string, Offset> {
	const offsets = new Map<string, Offset>();
	if (inputs.length === 0) return offsets;

	const centre =
		inputs.length === 1
			? { x: viewport.width / 2, y: viewport.height / 2 }
			: {
					x: inputs.reduce((s, p) => s + p.anchor.x, 0) / inputs.length,
					y: inputs.reduce((s, p) => s + p.anchor.y, 0) / inputs.length
				};

	const margin = 8;
	const fits = (p: PlacementInput, o: Offset) => {
		const r = labelBox(p, o);
		return (
			r.x >= margin &&
			r.y >= margin &&
			r.x + r.w <= viewport.width - margin &&
			r.y + r.h <= viewport.height - margin &&
			// A label on top of its own county point hides the very thing it labels.
			leaderEnd(p.anchor, r) !== null &&
			!obstacles.some((ob) => overlap(r, ob, GAP))
		);
	};

	for (const p of inputs) {
		if (p.fixed) {
			offsets.set(p.id, p.fixed);
			continue;
		}
		let vx = p.anchor.x - centre.x;
		let vy = p.anchor.y - centre.y;
		const len = Math.hypot(vx, vy);
		// Alone, or dead centre: up and to the right reads naturally.
		if (len < 1) [vx, vy] = [Math.SQRT1_2, -Math.SQRT1_2];
		else [vx, vy] = [vx / len, vy / len];

		// The preferred direction first, then others in order of how far they turn from
		// it. Near a viewport edge the preferred direction points off-screen, and clamping
		// would push the label back over its own county; turning it is better.
		const preferred = Math.atan2(vy, vx);
		const candidates = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => {
			const angle = preferred + (k * Math.PI) / 4;
			const [cx, cy] = [Math.cos(angle), Math.sin(angle)];
			return { dx: cx * (LEADER + p.w / 2), dy: cy * (LEADER + p.h / 2) };
		});
		offsets.set(p.id, candidates.find((o) => fits(p, o)) ?? candidates[0]);
	}

	const clamp = (p: PlacementInput, o: Offset): Offset => {
		const minX = margin + p.w / 2 - p.anchor.x;
		const maxX = viewport.width - margin - p.w / 2 - p.anchor.x;
		const minY = margin + p.h / 2 - p.anchor.y;
		const maxY = viewport.height - margin - p.h / 2 - p.anchor.y;
		return {
			dx: Math.min(Math.max(o.dx, minX), Math.max(minX, maxX)),
			dy: Math.min(Math.max(o.dy, minY), Math.max(minY, maxY))
		};
	};

	const movable = inputs.filter((p) => !p.fixed);

	for (let iter = 0; iter < ITERATIONS; iter++) {
		let moved = false;

		for (let i = 0; i < inputs.length; i++) {
			for (let j = i + 1; j < inputs.length; j++) {
				const a = inputs[i];
				const b = inputs[j];
				if (a.fixed && b.fixed) continue;
				const oa = offsets.get(a.id)!;
				const ob = offsets.get(b.id)!;
				const ra = labelBox(a, oa);
				const rb = labelBox(b, ob);
				const o = overlap(ra, rb, GAP);
				if (!o) continue;

				// Separate along the axis that needs the smaller push.
				const alongX = o.x < o.y;
				const sign = alongX
					? Math.sign(ra.x + ra.w / 2 - (rb.x + rb.w / 2)) || 1
					: Math.sign(ra.y + ra.h / 2 - (rb.y + rb.h / 2)) || 1;
				const push = (alongX ? o.x : o.y) + 0.5;
				const shareA = a.fixed ? 0 : b.fixed ? 1 : 0.5;
				const shareB = 1 - shareA;

				if (alongX) {
					offsets.set(a.id, { dx: oa.dx + sign * push * shareA, dy: oa.dy });
					offsets.set(b.id, { dx: ob.dx - sign * push * shareB, dy: ob.dy });
				} else {
					offsets.set(a.id, { dx: oa.dx, dy: oa.dy + sign * push * shareA });
					offsets.set(b.id, { dx: ob.dx, dy: ob.dy - sign * push * shareB });
				}
				moved = true;
			}
		}

		for (const p of movable) {
			let o = offsets.get(p.id)!;
			for (const obstacle of obstacles) {
				const r = labelBox(p, o);
				const ov = overlap(r, obstacle, GAP);
				if (!ov) continue;
				const alongX = ov.x < ov.y;
				if (alongX) {
					const sign = Math.sign(r.x + r.w / 2 - (obstacle.x + obstacle.w / 2)) || 1;
					o = { dx: o.dx + sign * (ov.x + 0.5), dy: o.dy };
				} else {
					const sign = Math.sign(r.y + r.h / 2 - (obstacle.y + obstacle.h / 2)) || 1;
					o = { dx: o.dx, dy: o.dy + sign * (ov.y + 0.5) };
				}
				moved = true;
			}
			offsets.set(p.id, clamp(p, o));
		}

		if (!moved) break;
	}

	return offsets;
}

/**
 * Where a leader line meets its label: the point on the box's edge nearest the anchor.
 * Null when the anchor is inside the box, where a line would only be noise.
 */
export function leaderEnd(anchor: Point, box: Rect): Point | null {
	const x = Math.min(Math.max(anchor.x, box.x), box.x + box.w);
	const y = Math.min(Math.max(anchor.y, box.y), box.y + box.h);
	return x === anchor.x && y === anchor.y ? null : { x, y };
}

export function labelBox(input: Pick<PlacementInput, 'anchor' | 'w' | 'h'>, o: Offset): Rect {
	return {
		x: input.anchor.x + o.dx - input.w / 2,
		y: input.anchor.y + o.dy - input.h / 2,
		w: input.w,
		h: input.h
	};
}
