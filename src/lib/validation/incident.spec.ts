import { describe, expect, it } from 'vitest';
import {
	hasErrors,
	normalizeComments,
	normalizeText,
	parseIncident,
	reportedBeforeObserved
} from './incident';

const TODAY = '2026-09-11';

function form(overrides: Record<string, string> = {}) {
	const data = new FormData();
	const base: Record<string, string> = {
		diseaseId: '1',
		countyFips: '55025',
		observedOn: '2026-09-08',
		reportedOn: '2026-09-09',
		crop: 'Potato',
		operationType: 'Commercial farm',
		strain: 'US-23',
		comments: '',
		source: ''
	};
	for (const [k, v] of Object.entries({ ...base, ...overrides })) data.set(k, v);
	return data;
}

describe('normalizeText', () => {
	it('trims and collapses internal whitespace', () => {
		expect(normalizeText('  sweet   corn  ')).toBe('Sweet corn');
	});

	it('capitalises only the first letter, never title-casing', () => {
		// Title case would mangle this into "Cucurbits (Mixed)" style rewrites.
		expect(normalizeText('cucurbits (mixed)')).toBe('Cucurbits (mixed)');
		expect(normalizeText('US-23')).toBe('US-23');
	});

	it('leaves an already-capitalised value alone', () => {
		expect(normalizeText('Home garden')).toBe('Home garden');
	});

	it('treats blank and whitespace-only as absent', () => {
		expect(normalizeText('')).toBeNull();
		expect(normalizeText('   ')).toBeNull();
		expect(normalizeText(null)).toBeNull();
	});
});

describe('normalizeComments', () => {
	it('keeps internal line breaks and casing', () => {
		const text = 'Lesions on lower leaves.\nSecond planting unaffected.';
		expect(normalizeComments(`  ${text}  `)).toBe(text);
	});
});

describe('parseIncident', () => {
	it('accepts a well-formed detection', () => {
		const { values, errors } = parseIncident(form(), { todayIso: TODAY });
		expect(hasErrors(errors)).toBe(false);
		expect(values.countyFips).toBe('55025');
		expect(values.crop).toBe('Potato');
	});

	it('rejects a malformed FIPS', () => {
		for (const bad of ['', '5502', '550255', 'abcde', '55 25']) {
			const { errors } = parseIncident(form({ countyFips: bad }), { todayIso: TODAY });
			expect(errors.countyFips, `expected ${bad} to be rejected`).toBeTruthy();
		}
	});

	it('rejects an observation date in the future', () => {
		const { errors } = parseIncident(form({ observedOn: '2026-09-12' }), { todayIso: TODAY });
		expect(errors.observedOn).toMatch(/future/);
	});

	it('accepts an observation date of today', () => {
		const { errors } = parseIncident(form({ observedOn: TODAY }), { todayIso: TODAY });
		expect(errors.observedOn).toBeUndefined();
	});

	it('rejects impossible calendar dates', () => {
		const { errors } = parseIncident(form({ observedOn: '2026-02-30' }), { todayIso: TODAY });
		expect(errors.observedOn).toBeTruthy();
	});

	it('rejects a report date earlier than the observation date', () => {
		const { errors } = parseIncident(form({ observedOn: '2026-09-08', reportedOn: '2026-09-01' }), {
			todayIso: TODAY
		});
		expect(errors.reportedOn).toMatch(/before it was observed/);
	});

	it('allows a report date equal to the observation date', () => {
		const { errors } = parseIncident(form({ observedOn: '2026-09-08', reportedOn: '2026-09-08' }), {
			todayIso: TODAY
		});
		expect(errors.reportedOn).toBeUndefined();
	});

	it('requires a report date', () => {
		const { errors } = parseIncident(form({ reportedOn: '' }), { todayIso: TODAY });
		expect(errors.reportedOn).toMatch(/Enter the date/);
	});

	it('rejects a report date in the future', () => {
		const { errors } = parseIncident(form({ reportedOn: '2026-09-12' }), { todayIso: TODAY });
		expect(errors.reportedOn).toMatch(/future/);
	});

	it('rejects an over-long free-text value', () => {
		const { errors } = parseIncident(form({ crop: 'x'.repeat(121) }), { todayIso: TODAY });
		expect(errors.crop).toBeTruthy();
	});

	it('normalises free text on the way through', () => {
		const { values } = parseIncident(
			form({ crop: '  sweet   corn ', operationType: 'home garden' }),
			{
				todayIso: TODAY
			}
		);
		expect(values.crop).toBe('Sweet corn');
		expect(values.operationType).toBe('Home garden');
	});
});

describe('reportedBeforeObserved', () => {
	it('flags only a report dated before the observation', () => {
		expect(reportedBeforeObserved('2026-09-08', '2026-09-07')).toMatch(/before it was observed/);
		expect(reportedBeforeObserved('2026-09-08', '2026-09-08')).toBeNull();
		expect(reportedBeforeObserved('2026-09-08', null)).toBeNull();
		// Nothing to compare against yet — the form is still being filled in.
		expect(reportedBeforeObserved('', '2026-09-01')).toBeNull();
	});
});
