import { describe, expect, it } from 'vitest';
import { attributionText, composeImage, FOOTER_HEIGHT, TITLE_HEIGHT } from './export-image';

// Runs in Chromium (the Vitest client project): these checks read real pixels.

function solid(width: number, height: number, color: string) {
	const c = document.createElement('canvas');
	c.width = width;
	c.height = height;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, width, height);
	return c;
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number) {
	return [...canvas.getContext('2d')!.getImageData(x, y, 1, 1).data.slice(0, 3)];
}

const spec = {
	map: solid(800, 400, 'rgb(0, 128, 0)'),
	cssWidth: 400,
	cssHeight: 200,
	scale: 2,
	labels: [
		{
			id: '55025',
			text: 'Dane County, WI · Sep 20',
			anchor: { x: 300, y: 150 },
			box: { x: 200, y: 40, w: 150, h: 22 }
		}
	],
	legend: { caption: 'Legend', entries: [{ color: 'rgb(255, 0, 0)', label: 'Within 7 days' }] },
	title: 'Late blight detections · 2026',
	subtitle: 'As of Sep 23, 2026',
	attribution: '© OpenStreetMap',
	credit: 'University of Wisconsin–Madison',
	source: 'example.org',
	colors: {
		background: 'rgb(255, 255, 255)',
		foreground: 'rgb(0, 0, 0)',
		muted: 'rgb(100, 100, 100)',
		border: 'rgb(200, 200, 200)',
		card: 'rgb(250, 250, 250)',
		brand: 'rgb(197, 5, 12)'
	},
	font: 'sans-serif'
};

describe('composeImage', () => {
	const canvas = composeImage(spec);

	it('sizes the image to title + map + footer, at the capture scale', () => {
		expect(canvas.width).toBe(800);
		expect(canvas.height).toBe((TITLE_HEIGHT + 200 + FOOTER_HEIGHT) * 2);
	});

	it('draws the captured map below the title band', () => {
		// Top-right of the map area: clear of the label and the legend.
		expect(pixel(canvas, 780, (TITLE_HEIGHT + 10) * 2)).toEqual([0, 128, 0]);
	});

	it('draws labels on top of the map, where the layout put them', () => {
		// Inside the label box but away from its text.
		expect(pixel(canvas, 204 * 2, (TITLE_HEIGHT + 44) * 2)).toEqual([250, 250, 250]);
	});

	it('draws the branded footer', () => {
		expect(pixel(canvas, 2, (TITLE_HEIGHT + 200 + 2) * 2)).toEqual([197, 5, 12]);
	});
});

describe('attributionText', () => {
	it('reduces HTML credits to plain text, once each', () => {
		expect(
			attributionText([
				'<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">&copy; OpenMapTiles</a>',
				'<a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">&copy; OpenMapTiles</a>',
				''
			])
		).toBe('OpenFreeMap © OpenMapTiles');
	});
});
