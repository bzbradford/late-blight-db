/**
 * Builds the static map geometry from the Census cartographic boundary files.
 *
 * Inputs (committed at the repo root, so this is reproducible from a clean checkout):
 *   cb_2021_us_county_500k.zip
 *   cb_2021_us_state_500k.zip
 *
 * Outputs:
 *   static/geo/counties.topo.json  — county polygons, `fips` in properties
 *   static/geo/states.topo.json    — state outlines, drawn above the counties
 *   scripts/data/counties.csv      — county reference table loaded into Postgres
 *
 * Run with: pnpm build:geo
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORK = 'tmp/geo';
const OUT = 'static/geo';
const DATA = 'scripts/data';

const COUNTY_SHP = join(WORK, 'cb_2021_us_county_500k.shp');
const STATE_SHP = join(WORK, 'cb_2021_us_state_500k.shp');

/**
 * Territories carry FIPS codes at or above 60 (AS, GU, MP, PR, VI). They are dropped:
 * neither disease is tracked there, and their bounding boxes would wreck the default
 * continental-US view. This leaves the 50 states plus DC — 3,143 counties.
 */
const KEEP_STATES = '+STATEFP < 60';

/**
 * Visvalingam at 8% with keep-shapes holds county outlines recognisable at the zoom
 * levels this map uses (roughly z3–z9) while landing the payload near 1.5 MB.
 * `keep-shapes` prevents small counties from collapsing away entirely.
 */
const SIMPLIFY = ['-simplify', 'visvalingam', '8%', 'keep-shapes'];

function mapshaper(args: string[]) {
	execFileSync('pnpm', ['exec', 'mapshaper', ...args], { stdio: 'inherit' });
}

function mb(path: string) {
	return (statSync(path).size / 1024 / 1024).toFixed(2) + ' MB';
}

// Unpack sources into a scratch dir that is never committed.
rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
mkdirSync(OUT, { recursive: true });
mkdirSync(DATA, { recursive: true });

for (const zip of ['cb_2021_us_county_500k.zip', 'cb_2021_us_state_500k.zip']) {
	execFileSync('unzip', ['-o', '-q', zip, '-d', WORK], { stdio: 'inherit' });
}

// Counties → TopoJSON. Only the fields the client actually reads survive, so the
// payload carries no ALAND/AWATER/LSAD ballast.
mapshaper([
	COUNTY_SHP,
	'-filter',
	KEEP_STATES,
	'-each',
	'fips=GEOID, name=NAME, state_usps=STUSPS',
	'-filter-fields',
	'fips,name,state_usps',
	...SIMPLIFY,
	'-rename-layers',
	'counties',
	'-o',
	join(OUT, 'counties.topo.json'),
	'format=topojson'
]);

// States → TopoJSON, drawn as an outline layer above the county fills.
mapshaper([
	STATE_SHP,
	'-filter',
	KEEP_STATES,
	'-each',
	'state_fips=STATEFP, state_usps=STUSPS, name=NAME',
	'-filter-fields',
	'state_fips,state_usps,name',
	...SIMPLIFY,
	'-rename-layers',
	'states',
	'-o',
	join(OUT, 'states.topo.json'),
	'format=topojson'
]);

// County reference table. innerX/innerY give a point guaranteed to fall inside the
// polygon — unlike a true centroid, which lands outside horseshoe-shaped counties and
// would send the map's flyTo into a neighbouring county.
mapshaper([
	COUNTY_SHP,
	'-filter',
	KEEP_STATES,
	'-each',
	'fips=GEOID, name=NAME, state_fips=STATEFP, state_usps=STUSPS, state_name=STATE_NAME, ' +
		'lon=+this.innerX.toFixed(5), lat=+this.innerY.toFixed(5)',
	'-filter-fields',
	'fips,name,state_fips,state_usps,state_name,lon,lat',
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
