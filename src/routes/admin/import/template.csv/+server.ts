import { CSV_COLUMNS, emptyRecord, TEMPLATE_EXAMPLE_COMMENT } from '$lib/csv/columns';
import { toCsv } from '$lib/csv/io';
import type { RequestHandler } from './$types';

/** The import template: the header row, plus one example row to overwrite. */
export const GET: RequestHandler = () => {
	const example = {
		...emptyRecord(),
		disease: 'late-blight',
		county_fips: '55025',
		state: 'WI',
		county: 'Dane',
		observed_on: '2026-07-15',
		reported_on: '2026-07-17',
		crop: 'Potato',
		operation_type: 'Commercial farm',
		strain: 'US-23',
		source: 'UW-Madison Plant Disease Diagnostic Clinic',
		comments: TEMPLATE_EXAMPLE_COMMENT
	};
	return new Response(toCsv([example], CSV_COLUMNS), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': 'attachment; filename="detections-template.csv"'
		}
	});
};
