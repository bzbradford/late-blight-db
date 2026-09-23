import { describe, expect, it } from 'vitest';
import {
	addDays,
	defaultLabelSince,
	labelBox,
	labelRangeEnd,
	leaderEnd,
	placeLabels,
	selectLabels,
	type PlacementInput,
	type Rect
} from './labels';

const d = (countyFips: string, observedOn: string) => ({ countyFips, observedOn });

describe('selectLabels', () => {
	it('takes one label per county, its latest detection on or after the date', () => {
		const { labels, total } = selectLabels(
			[d('55025', '2026-09-19'), d('55025', '2026-08-25'), d('36011', '2026-09-03')],
			'2026-09-01'
		);
		expect(labels).toEqual([d('55025', '2026-09-19'), d('36011', '2026-09-03')]);
		expect(total).toBe(2);
	});

	it('excludes detections before the date', () => {
		expect(selectLabels([d('55025', '2026-08-31')], '2026-09-01').labels).toEqual([]);
	});

	it('keeps the most recent when more counties qualify than the cap, and reports the total', () => {
		const many = Array.from({ length: 14 }, (_, i) =>
			d(String(10000 + i), `2026-09-${String(i + 1).padStart(2, '0')}`)
		);
		const { labels, total } = selectLabels(many, '2026-01-01', 10);
		expect(total).toBe(14);
		expect(labels).toHaveLength(10);
		expect(labels[0].observedOn).toBe('2026-09-14');
		expect(labels[9].observedOn).toBe('2026-09-05');
	});
});

describe('label date range', () => {
	it('ends today for the current season', () => {
		expect(labelRangeEnd(2026, '2026-09-23', [d('1', '2026-09-01')])).toBe('2026-09-23');
	});

	it("ends at a past season's last detection", () => {
		expect(labelRangeEnd(2025, '2026-09-23', [d('1', '2025-07-14'), d('2', '2025-09-11')])).toBe(
			'2025-09-11'
		);
		expect(labelRangeEnd(2024, '2026-09-23', [])).toBe('2024-12-31');
	});

	it('defaults to the last week, but not before January', () => {
		expect(defaultLabelSince(2026, '2026-09-23')).toBe('2026-09-16');
		expect(defaultLabelSince(2026, '2026-01-03')).toBe('2026-01-01');
	});

	it('does calendar arithmetic across month and year ends', () => {
		expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
		expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
	});
});

function overlaps(a: Rect, b: Rect) {
	return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe('placeLabels', () => {
	const viewport = { width: 1000, height: 700 };
	const label = (id: string, x: number, y: number, fixed?: { dx: number; dy: number }) =>
		({ id, anchor: { x, y }, w: 150, h: 24, fixed }) satisfies PlacementInput;

	function boxes(inputs: PlacementInput[], obstacles: Rect[] = []) {
		const offsets = placeLabels(inputs, viewport, obstacles);
		return inputs.map((p) => labelBox(p, offsets.get(p.id)!));
	}

	it('separates a tight cluster so no two labels overlap', () => {
		const cluster = Array.from({ length: 8 }, (_, i) =>
			label(String(i), 500 + (i % 3) * 12, 350 + Math.floor(i / 3) * 12)
		);
		const placed = boxes(cluster);
		for (let i = 0; i < placed.length; i++)
			for (let j = i + 1; j < placed.length; j++)
				expect(overlaps(placed[i], placed[j])).toBe(false);
	});

	it('keeps every label inside the viewport, even for an anchor at the edge', () => {
		for (const box of boxes([label('edge', 995, 5), label('other', 5, 695)])) {
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.y).toBeGreaterThanOrEqual(0);
			expect(box.x + box.w).toBeLessThanOrEqual(viewport.width);
			expect(box.y + box.h).toBeLessThanOrEqual(viewport.height);
		}
	});

	it('never moves a dragged label, and moves the others around it', () => {
		const fixed = { dx: 0, dy: -40 };
		const inputs = [label('dragged', 500, 350, fixed), label('free', 505, 352)];
		const offsets = placeLabels(inputs, viewport);
		expect(offsets.get('dragged')).toEqual(fixed);
		const [a, b] = inputs.map((p) => labelBox(p, offsets.get(p.id)!));
		expect(overlaps(a, b)).toBe(false);
	});

	it('steers clear of the map controls', () => {
		const legend: Rect = { x: 0, y: 500, w: 260, h: 200 };
		const [box] = boxes([label('near-legend', 120, 520)], [legend]);
		expect(overlaps(box, legend)).toBe(false);
	});

	it('turns a label around rather than letting the viewport edge push it onto its county', () => {
		// Two anchors near the left edge, the group centre to their right: "away from the
		// centre" points off-screen.
		const inputs = [label('west', 40, 300), label('east', 700, 320)];
		const offsets = placeLabels(inputs, viewport);
		const west = labelBox(inputs[0], offsets.get('west')!);
		expect(leaderEnd(inputs[0].anchor, west)).not.toBeNull();
		expect(west.x).toBeGreaterThanOrEqual(0);
	});

	it('places nothing for no labels', () => {
		expect(placeLabels([], viewport).size).toBe(0);
	});
});

describe('leaderEnd', () => {
	const box: Rect = { x: 100, y: 100, w: 50, h: 20 };

	it('meets the box at the edge nearest the anchor', () => {
		expect(leaderEnd({ x: 125, y: 200 }, box)).toEqual({ x: 125, y: 120 });
		expect(leaderEnd({ x: 0, y: 0 }, box)).toEqual({ x: 100, y: 100 });
	});

	it('draws no line when the anchor is under the label', () => {
		expect(leaderEnd({ x: 110, y: 110 }, box)).toBeNull();
	});
});
