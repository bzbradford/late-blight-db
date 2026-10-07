/**
 * Builds the static map geometry from the US Census and Statistics Canada cartographic
 * boundary files.
 *
 * Inputs, in `data/` (gitignored — 150 MB together; download them on a new dev setup):
 *   cb_2021_us_county_500k.zip  https://www2.census.gov/geo/tiger/GENZ2021/shp/cb_2021_us_county_500k.zip
 *   cb_2021_us_state_500k.zip   https://www2.census.gov/geo/tiger/GENZ2021/shp/cb_2021_us_state_500k.zip
 *   lcd_000b21a_e.zip           2021 census divisions, *cartographic* boundary file, shapefile:
 *                               https://www12.statcan.gc.ca/census-recensement/2021/geo/sip-pis/boundary-limites/files-fichiers/lcd_000b21a_e.zip
 *                               (StatCan refuses scripted downloads; fetch it in a browser.
 *                               Not the *digital* boundary file, lcd_000a21a_e, whose
 *                               boundaries run out over water.)
 *
 * Outputs:
 *   static/geo/counties.topo.json  — US counties and Canadian census divisions, `fips` in properties
 *   static/geo/states.topo.json    — state and province outlines, drawn above the counties
 *   scripts/data/counties.csv      — county reference table loaded into Postgres
 *
 * Canadian census divisions play the part of counties. Their keys are prefixed with `C`
 * so they can never be mistaken for a FIPS code: division 3506 (Ottawa) is `C3506`, and
 * its province, Ontario (PRUID 35, which is also New Mexico's state FIPS), is `C35`.
 *
 * Run with: pnpm build:geo
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SOURCES = 'data';
const WORK = 'tmp/geo';
const OUT = 'static/geo';
const DATA = 'scripts/data';

const US_COUNTY_ZIP = 'cb_2021_us_county_500k.zip';
const US_STATE_ZIP = 'cb_2021_us_state_500k.zip';
const CA_DIVISION_ZIP = 'lcd_000b21a_e.zip';

const US_COUNTY_SHP = join(WORK, 'cb_2021_us_county_500k.shp');
const US_STATE_SHP = join(WORK, 'cb_2021_us_state_500k.shp');
const CA_DIVISION_SHP = join(WORK, 'lcd_000b21a_e.shp');

/**
 * Continental US only — the lower 48 plus DC.
 *
 * Dropped: Alaska (02), Hawaii (15), and the territories (FIPS >= 60: AS, GU, MP, PR,
 * VI). No reports are accepted for any of them, so carrying their geometry would only
 * add clickable counties that can never hold data, and their bounding boxes would
 * wreck the default map view.
 */
const KEEP_STATES = '+STATEFP < 60 && STATEFP != "02" && STATEFP != "15"';

/**
 * The ten provinces, keyed by PRUID. The boundary file carries only the code.
 *
 * Yukon (60), the Northwest Territories (61), and Nunavut (62) are left out for the
 * same reason as Alaska. What lies north of 60°N in Quebec and Labrador is clipped off
 * (`CA_CLIP`), leaving Nord-du-Québec and Division No. 10 ending in a straight edge.
 */
const PROVINCES: Record<string, { usps: string; name: string }> = {
	'10': { usps: 'NL', name: 'Newfoundland and Labrador' },
	'11': { usps: 'PE', name: 'Prince Edward Island' },
	'12': { usps: 'NS', name: 'Nova Scotia' },
	'13': { usps: 'NB', name: 'New Brunswick' },
	'24': { usps: 'QC', name: 'Quebec' },
	'35': { usps: 'ON', name: 'Ontario' },
	'46': { usps: 'MB', name: 'Manitoba' },
	'47': { usps: 'SK', name: 'Saskatchewan' },
	'48': { usps: 'AB', name: 'Alberta' },
	'59': { usps: 'BC', name: 'British Columbia' }
};
const KEEP_PROVINCES = `${JSON.stringify(Object.keys(PROVINCES))}.includes(PRUID)`;
const CA_CLIP = 'bbox=-142,40,-50,60';

/**
 * Visvalingam at 8% with keep-shapes holds county outlines recognisable at the zoom
 * levels this map uses (roughly z3–z9) while landing the payload near 1.5 MB.
 * `keep-shapes` prevents small counties from collapsing away entirely.
 */
const SIMPLIFY = ['-simplify', 'visvalingam', '8%', 'keep-shapes'];

/**
 * Canada at the threshold the US counties' 8% works out to (`-simplify … stats` reports
 * 787 m), so the two countries draw at the same detail. A percentage would not carry
 * over: the StatCan coastline has ten million vertices, and 8% of them is far too many.
 */
const SIMPLIFY_CA = ['-simplify', 'visvalingam', 'interval=787m', 'keep-shapes'];

/**
 * The StatCan file is read once and taken down to 100 m — far finer than anything drawn,
 * or than the inner points need — so the rest of the Canadian work runs on a 13 MB
 * intermediate instead of the full 280 MB shapefile.
 */
const CA_PRESIMPLIFY = ['-simplify', 'visvalingam', 'interval=100m', 'keep-shapes'];

const COUNTY_FIELDS = 'fips,name,full_name,state_fips,state_usps,state_name,lon,lat';

/**
 * The heap cap makes a run that outgrows memory fail with a clean out-of-memory error
 * rather than wait for the kernel's OOM killer, which on WSL can take the whole VM
 * down. The largest step (`CA_PRESIMPLIFY`) peaks near 1.5 GB resident under it.
 */
function mapshaper(args: string[]) {
	execFileSync('pnpm', ['exec', 'mapshaper', ...args], {
		stdio: 'inherit',
		env: { ...process.env, NODE_OPTIONS: '--max-old-space-size=2048' }
	});
}

function mb(path: string) {
	return (statSync(path).size / 1024 / 1024).toFixed(2) + ' MB';
}

const missing = [US_COUNTY_ZIP, US_STATE_ZIP, CA_DIVISION_ZIP].filter(
	(zip) => !existsSync(join(SOURCES, zip))
);
if (missing.length > 0) {
	console.error(
		`Missing from ${SOURCES}/: ${missing.join(', ')}\n` +
			'Download them first; the URLs are at the top of scripts/build-geo.ts.'
	);
	process.exit(1);
}

// Unpack sources into a scratch dir that is never committed.
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(DATA, { recursive: true });

for (const zip of [US_COUNTY_ZIP, US_STATE_ZIP, CA_DIVISION_ZIP]) {
	execFileSync('unzip', ['-o', '-q', join(SOURCES, zip), '-d', WORK], { stdio: 'inherit' });
}

// US counties. Only the fields the client actually reads survive into the map, so the
// payload carries no ALAND/AWATER/LSAD ballast. On the map `name` is NAMELSAD — "Riley
// County", "Orleans Parish", "Richmond city" — because the hover tooltip shows it as-is
// and the bare NAME cannot tell a Virginia independent city from the county around it.
//
// The reference table is written from the unsimplified geometry. Its `name` is the bare
// NAME that search and CSV import match on; `full_name` is NAMELSAD, for display ("Dane
// County, Wisconsin"). innerX/innerY give a point guaranteed to fall inside the polygon —
// unlike a true centroid, which lands outside horseshoe-shaped counties and would send
// the map's flyTo into a neighbouring county.
mapshaper([
	US_COUNTY_SHP,
	'-filter',
	KEEP_STATES,
	'-each',
	'fips=GEOID, name=NAME, full_name=NAMELSAD, state_fips=STATEFP, state_usps=STUSPS, ' +
		'state_name=STATE_NAME, lon=+this.innerX.toFixed(5), lat=+this.innerY.toFixed(5)',
	'-filter-fields',
	COUNTY_FIELDS,
	'-o',
	join(WORK, 'us-counties.csv'),
	...SIMPLIFY,
	'-each',
	'name=full_name',
	'-filter-fields',
	'fips,name,state_name',
	'-o',
	join(WORK, 'us-counties.json'),
	'format=geojson'
]);

// US states, drawn as an outline layer above the county fills.
mapshaper([
	US_STATE_SHP,
	'-filter',
	KEEP_STATES,
	'-each',
	'state_fips=STATEFP, state_usps=STUSPS, name=NAME',
	'-filter-fields',
	'state_fips,state_usps,name',
	...SIMPLIFY,
	'-o',
	join(WORK, 'us-states.json'),
	'format=geojson'
]);

// Canadian census divisions, the same way. The DBF is Latin-1 with no .cpg to say so;
// read as UTF-8, "Montréal" comes out mangled. CDNAME is both the search name and the
// display name (StatCan has no NAMELSAD), with the double spaces of "Division No.  1"
// collapsed. Clipping comes before the inner point, so Nord-du-Québec's lands below
// 60°N. Province outlines are dissolved from the simplified divisions, so they follow
// the division edges exactly.
mapshaper([
	CA_DIVISION_SHP,
	'encoding=latin1',
	'-filter',
	KEEP_PROVINCES,
	'-proj',
	'wgs84',
	'-clip',
	CA_CLIP,
	...CA_PRESIMPLIFY,
	'-o',
	join(WORK, 'ca-divisions.json'),
	'format=geojson'
]);

const provinces = JSON.stringify(PROVINCES);
mapshaper([
	join(WORK, 'ca-divisions.json'),
	'-each',
	`fips="C"+CDUID, name=CDNAME.replace(/\\s+/g, " ").trim(), full_name=name, ` +
		`state_fips="C"+PRUID, state_usps=${provinces}[PRUID].usps, ` +
		`state_name=${provinces}[PRUID].name, ` +
		'lon=+this.innerX.toFixed(5), lat=+this.innerY.toFixed(5)',
	'-filter-fields',
	COUNTY_FIELDS,
	'-o',
	join(WORK, 'ca-counties.csv'),
	...SIMPLIFY_CA,
	'-dissolve',
	'state_fips',
	'copy-fields=state_usps,state_name',
	'+',
	'name=provinces',
	'-rename-fields',
	'name=state_name',
	'target=provinces',
	'-o',
	join(WORK, 'ca-states.json'),
	'format=geojson',
	'target=provinces',
	'-filter-fields',
	'fips,name,state_name',
	'target=ca-divisions',
	'-o',
	join(WORK, 'ca-counties.json'),
	'format=geojson',
	'target=ca-divisions'
]);

// Each country is simplified on its own above; merging only rebuilds the topology. The
// two sources don't share a border line, so the 49th parallel can show hairline gaps
// or overlaps at high zoom.
mapshaper([
	'-i',
	join(WORK, 'us-counties.json'),
	join(WORK, 'ca-counties.json'),
	'combine-files',
	'string-fields=fips',
	'-merge-layers',
	'name=counties',
	'-o',
	join(OUT, 'counties.topo.json'),
	'format=topojson'
]);

mapshaper([
	'-i',
	join(WORK, 'us-states.json'),
	join(WORK, 'ca-states.json'),
	'combine-files',
	'string-fields=state_fips',
	'-merge-layers',
	'name=states',
	'-o',
	join(OUT, 'states.topo.json'),
	'format=topojson'
]);

// `string-fields` keeps the leading zero on "01001"; mapshaper quotes CSV fields as
// needed ("Stormont, Dundas and Glengarry").
mapshaper([
	'-i',
	join(WORK, 'us-counties.csv'),
	join(WORK, 'ca-counties.csv'),
	'combine-files',
	'string-fields=fips,state_fips',
	'-merge-layers',
	'name=counties',
	'-sort',
	'fips',
	'-o',
	join(DATA, 'counties.csv'),
	'format=csv'
]);

rmSync(WORK, { recursive: true, force: true });

console.log('\nGenerated:');
console.log(`  ${OUT}/counties.topo.json  ${mb(join(OUT, 'counties.topo.json'))}`);
console.log(`  ${OUT}/states.topo.json    ${mb(join(OUT, 'states.topo.json'))}`);
console.log(`  ${DATA}/counties.csv       ${mb(join(DATA, 'counties.csv'))}`);
