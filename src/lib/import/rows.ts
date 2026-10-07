import { isCountyKey, normalizeCountyKey } from '$lib/counties/key';
import { parseCoordinates, type Point } from '$lib/geo/coordinates';
import {
	checkLocation,
	locationError,
	shapeLabel,
	TOLERANCE_KM,
	type CountyShape
} from '$lib/geo/locate';
import { TEMPLATE_EXAMPLE_COMMENT, type CsvRecord } from '$lib/csv/columns';
import { normalizePublicId } from '$lib/public-id';
import { parseIncident, type FieldErrors, type IncidentInput } from '$lib/validation/incident';

export type CountyRef = { fips: string; name: string; stateUsps: string; stateName: string };
export type DiseaseRef = { id: number; slug: string; name: string };

/** A CSV row that passed validation. */
export type ImportRow = {
	row: number;
	/** The public ID given in the file, when there was one. */
	publicId: string | null;
	values: IncidentInput;
	/** For display on the review page. */
	label: { disease: string; county: string };
};

export type RowError = { row: number; messages: string[] };

const FIELD_LABELS: Record<keyof FieldErrors, string> = {
	diseaseId: 'disease',
	countyFips: 'county',
	observedOn: 'observed_on',
	reportedOn: 'reported_on',
	crop: 'crop',
	operationType: 'operation_type',
	strain: 'strain',
	comments: 'comments',
	source: 'source',
	location: 'latitude/longitude'
};

/**
 * County names as written in reports vary more than the Census spelling: "Dane County",
 * "dane", "Saint Louis", "Montreal" for Montréal. Normalising both sides lets those match
 * without ever guessing between two different counties.
 */
export function normalizeCountyName(name: string): string {
	return foldAccents(name)
		.trim()
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.replace(/ (county|parish)$/, '')
		.replace(/^(saint|st) /, 'st. ')
		.replace(/^(sainte|ste) /, 'ste. ');
}

function foldAccents(text: string): string {
	return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function buildCountyIndex(counties: CountyRef[]) {
	const byFips = new Map(counties.map((c) => [c.fips, c]));
	const byStateName = new Map<string, CountyRef[]>();
	const stateKeys = new Map<string, string>();

	for (const c of counties) {
		stateKeys.set(c.stateUsps.toLowerCase(), c.stateUsps);
		stateKeys.set(foldAccents(c.stateName).toLowerCase(), c.stateUsps);
		const key = `${c.stateUsps}|${normalizeCountyName(c.name)}`;
		byStateName.set(key, [...(byStateName.get(key) ?? []), c]);
	}

	return {
		byFips,
		/** State or province by postal code or full name, ignoring case and accents. */
		state(value: string): string | undefined {
			return stateKeys.get(foldAccents(value).trim().toLowerCase());
		},
		byName(stateUsps: string, county: string): CountyRef[] {
			return byStateName.get(`${stateUsps}|${normalizeCountyName(county)}`) ?? [];
		}
	};
}

export type CountyIndex = ReturnType<typeof buildCountyIndex>;

function label(c: CountyRef) {
	return `${c.name}, ${c.stateUsps}`;
}

export function resolveCounty(
	record: CsvRecord,
	index: CountyIndex
): { county: CountyRef } | { error: string } {
	const fipsRaw = record.county_fips;
	const stateRaw = record.state;
	const countyRaw = record.county;

	if (fipsRaw) {
		// Excel reads FIPS codes as numbers and drops the leading zero: 01001 becomes 1001.
		const fips = normalizeCountyKey(fipsRaw);
		if (!isCountyKey(fips)) {
			return {
				error: `county_fips "${fipsRaw}" is not a 5-digit FIPS code or a Canadian census division (C3506).`
			};
		}
		const county = index.byFips.get(fips);
		if (!county) return { error: `county_fips ${fips} is not a county on this map.` };

		// Both given and they disagree: one of them is wrong, and we can't tell which.
		if (stateRaw && countyRaw) {
			const usps = index.state(stateRaw);
			const named = usps ? index.byName(usps, countyRaw) : [];
			if (!named.some((c) => c.fips === fips)) {
				return {
					error: `county_fips ${fips} is ${label(county)}, but state/county say "${countyRaw}, ${stateRaw}".`
				};
			}
		}
		return { county };
	}

	if (!stateRaw || !countyRaw) {
		return { error: 'Give county_fips, or both state and county.' };
	}

	const usps = index.state(stateRaw);
	if (!usps) return { error: `"${stateRaw}" is not a state or province on this map.` };

	const matches = index.byName(usps, countyRaw);
	if (matches.length === 1) return { county: matches[0] };
	if (matches.length === 0) {
		return { error: `No county named "${countyRaw}" in ${usps}. Use county_fips instead.` };
	}
	// e.g. Richmond, VA is both a county (51159) and an independent city (51760).
	return {
		error: `"${countyRaw}, ${usps}" matches ${matches.length} counties (${matches
			.map((m) => m.fips)
			.sort()
			.join(', ')}). Use county_fips to say which.`
	};
}

export function resolveDisease(value: string, diseases: DiseaseRef[]): DiseaseRef | undefined {
	const v = value.trim().toLowerCase();
	return diseases.find((d) => d.slug === v || d.name.toLowerCase() === v);
}

/**
 * Turns one CSV record into validated incident values, or the reasons it can't be.
 *
 * Everything after disease and county resolution is `parseIncident` — the same function
 * the admin form uses — so an import cannot accept what the form would refuse.
 */
/**
 * A row's coordinates: both columns or neither. Blank is `undefined`, which leaves any
 * stored coordinates alone (a public download has no coordinate columns at all).
 */
function readLocation(record: CsvRecord): { location: Point | undefined } | { error: string } {
	const { latitude, longitude } = record;
	if (!latitude && !longitude) return { location: undefined };
	if (!latitude || !longitude) return { error: 'Give both latitude and longitude, or neither.' };
	const parsed = parseCoordinates(`${latitude}, ${longitude}`);
	return 'error' in parsed
		? { error: `latitude/longitude: ${parsed.error}` }
		: { location: parsed.point };
}

/** What the form would offer to confirm can't be confirmed in a file. */
const CONFIRM_IN_FORM =
	' To keep them, enter this detection through the form, which can confirm them.';

/**
 * The county a row's coordinates fall in, for a row that names no county. Only one the
 * point is inside, or within `TOLERANCE_KM` of: anything further is for a person to judge.
 */
function countyFromLocation(
	location: Point,
	shapes: CountyShape[],
	index: CountyIndex
): { county: CountyRef } | { error: string } {
	const check = checkLocation(shapes, location, null);
	const nearest = check.kind === 'unchosen' ? check.nearest : null;
	const county = nearest && nearest.km <= TOLERANCE_KM && index.byFips.get(nearest.shape.fips);
	if (county) return { county };
	const where = `latitude/longitude ${location.lat}, ${location.lon}`;
	if (!nearest) return { error: `${where} are not in any county on this map.` };
	return {
		error: `${where} are ${nearest.km.toFixed(1)} km outside ${shapeLabel(nearest.shape)}.${CONFIRM_IN_FORM}`
	};
}

export function buildRow(
	row: number,
	record: CsvRecord,
	context: {
		diseases: DiseaseRef[];
		counties: CountyIndex;
		/** County geometry, for checking coordinates (`serverCountyShapes()`). */
		shapes: CountyShape[];
		todayIso?: string;
	}
): ImportRow | RowError {
	const messages: string[] = [];

	if (record.comments === TEMPLATE_EXAMPLE_COMMENT) {
		return { row, messages: ["This is the template's example row. Delete it before importing."] };
	}

	let publicId: string | null = null;
	if (record.id) {
		publicId = normalizePublicId(record.id);
		if (!publicId) messages.push(`id "${record.id}" is not a detection ID.`);
	}

	const disease = record.disease ? resolveDisease(record.disease, context.diseases) : undefined;
	if (!record.disease) messages.push('disease is required.');
	else if (!disease) {
		const known = context.diseases.map((d) => d.slug).join(', ');
		messages.push(`disease "${record.disease}" is not recognised (use one of: ${known}).`);
	}

	const coordinates = readLocation(record);
	if ('error' in coordinates) messages.push(coordinates.error);
	const location = 'location' in coordinates ? coordinates.location : undefined;

	const namesCounty = Boolean(record.county_fips || record.state || record.county);
	const county =
		location && !namesCounty
			? countyFromLocation(location, context.shapes, context.counties)
			: resolveCounty(record, context.counties);
	if ('error' in county) messages.push(county.error);

	// Coordinates beside a named county must agree with it, as on the form.
	if (location && namesCounty && 'county' in county) {
		const check = checkLocation(context.shapes, location, county.county.fips);
		const problem = locationError(check, false);
		if (problem) {
			messages.push(
				`latitude/longitude: ${problem}${check.kind === 'confirm' ? CONFIRM_IN_FORM : ''}`
			);
		}
	}

	const fields: Record<string, string> = {
		diseaseId: disease ? String(disease.id) : '',
		countyFips: 'county' in county ? county.county.fips : '',
		observedOn: record.observed_on,
		// Optional in a CSV, required on a detection: a blank one takes the observation date.
		reportedOn: record.reported_on || record.observed_on,
		crop: record.crop,
		operationType: record.operation_type,
		strain: record.strain,
		comments: record.comments,
		source: record.source
	};
	const { values, errors } = parseIncident(
		{ get: (name) => fields[name] ?? null },
		{ todayIso: context.todayIso }
	);
	// Read above, column by column; blank means "leave alone" here, not "clear" as on the form.
	values.location = location;

	// Disease and county problems were already reported above, in more specific terms, and a
	// report date copied from observed_on can only repeat what is said about observed_on.
	for (const [field, message] of Object.entries(errors) as [keyof FieldErrors, string][]) {
		if (field === 'diseaseId' || field === 'countyFips') continue;
		if (field === 'reportedOn' && !record.reported_on) continue;
		messages.push(`${FIELD_LABELS[field]}: ${message}`);
	}

	if (messages.length || !disease || !('county' in county)) return { row, messages };

	return {
		row,
		publicId,
		values,
		label: { disease: disease.name, county: label(county.county) }
	};
}

export function isRowError(r: ImportRow | RowError): r is RowError {
	return 'messages' in r;
}
