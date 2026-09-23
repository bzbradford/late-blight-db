/**
 * "Save map image": composes the map, its county labels, the legend, a title, and credits
 * onto one canvas for a newsletter.
 *
 * Everything is redrawn with the Canvas 2D API from data — the captured WebGL frame for
 * the map, and `LabelLayout` for the labels — rather than rasterising DOM, so the image
 * matches the screen, dragged labels included, without a screenshot library.
 */
import type { LabelLayout } from '$lib/components/map/CountyLabels.svelte';
import { leaderEnd } from '$lib/map/labels';

export type ImageColors = {
	background: string;
	foreground: string;
	muted: string;
	border: string;
	card: string;
	brand: string;
};

export type ImageSpec = {
	/** The map frame, captured at `scale` × its CSS size. */
	map: CanvasImageSource;
	cssWidth: number;
	cssHeight: number;
	scale: number;
	labels: LabelLayout[];
	legend: { caption: string; entries: { color: string; label: string }[] };
	title: string;
	subtitle: string;
	/** Basemap credit. Empty when no basemap tiles were drawn. */
	attribution: string;
	credit: string;
	source: string;
	colors: ImageColors;
	font: string;
};

export const TITLE_HEIGHT = 64;
export const FOOTER_HEIGHT = 30;
const LEGEND_WIDTH = 224;
const LEGEND_MARGIN = 16;

export function composeImage(spec: ImageSpec, canvas = document.createElement('canvas')) {
	const { cssWidth: w, cssHeight: h, scale, colors, font } = spec;
	const height = TITLE_HEIGHT + h + FOOTER_HEIGHT;

	canvas.width = Math.round(w * scale);
	canvas.height = Math.round(height * scale);
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Canvas 2D is unavailable');
	ctx.scale(scale, scale);

	ctx.fillStyle = colors.background;
	ctx.fillRect(0, 0, w, height);

	// Title band.
	ctx.fillStyle = colors.foreground;
	ctx.font = `600 20px ${font}`;
	ctx.textBaseline = 'alphabetic';
	ctx.fillText(spec.title, 16, 30);
	ctx.fillStyle = colors.muted;
	ctx.font = `400 13px ${font}`;
	ctx.fillText(spec.subtitle, 16, 50);

	// Map.
	ctx.drawImage(spec.map, 0, TITLE_HEIGHT, w, h);

	ctx.save();
	ctx.translate(0, TITLE_HEIGHT);
	ctx.beginPath();
	ctx.rect(0, 0, w, h);
	ctx.clip();
	drawLabels(ctx, spec);
	drawLegend(ctx, spec);
	ctx.restore();

	// Footer: institution on the left, sources on the right.
	const footerY = TITLE_HEIGHT + h;
	ctx.fillStyle = colors.brand;
	ctx.fillRect(0, footerY, w, FOOTER_HEIGHT);
	ctx.fillStyle = '#ffffff';
	ctx.font = `600 12px ${font}`;
	ctx.textBaseline = 'middle';
	ctx.fillText(spec.credit, 16, footerY + FOOTER_HEIGHT / 2);
	ctx.font = `400 11px ${font}`;
	ctx.textAlign = 'right';
	const right = [spec.source, spec.attribution].filter(Boolean).join('  ·  ');
	ctx.fillText(right, w - 16, footerY + FOOTER_HEIGHT / 2);
	ctx.textAlign = 'left';

	return canvas;
}

function drawLabels(ctx: CanvasRenderingContext2D, spec: ImageSpec) {
	const { colors, font } = spec;

	for (const { anchor, box } of spec.labels) {
		const end = leaderEnd(anchor, box);
		if (end) {
			ctx.strokeStyle = colors.foreground;
			ctx.globalAlpha = 0.7;
			ctx.lineWidth = 1.25;
			ctx.beginPath();
			ctx.moveTo(anchor.x, anchor.y);
			ctx.lineTo(end.x, end.y);
			ctx.stroke();
			ctx.globalAlpha = 1;
		}
		ctx.beginPath();
		ctx.arc(anchor.x, anchor.y, 3, 0, Math.PI * 2);
		ctx.fillStyle = colors.foreground;
		ctx.fill();
		ctx.lineWidth = 1.5;
		ctx.strokeStyle = colors.background;
		ctx.stroke();
	}

	// Boxes after every line, so no leader crosses over another county's label.
	for (const { text, box } of spec.labels) {
		ctx.beginPath();
		ctx.roundRect(box.x, box.y, box.w, box.h, 6);
		ctx.fillStyle = colors.card;
		ctx.fill();
		ctx.lineWidth = 1;
		ctx.strokeStyle = colors.border;
		ctx.stroke();
		ctx.fillStyle = colors.foreground;
		ctx.font = `500 12px ${font}`;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'center';
		ctx.fillText(text, box.x + box.w / 2, box.y + box.h / 2 + 0.5);
		ctx.textAlign = 'left';
	}
}

function drawLegend(ctx: CanvasRenderingContext2D, spec: ImageSpec) {
	const { colors, font, legend } = spec;
	const rowH = 20;
	const pad = 12;
	const height = pad + 16 + legend.entries.length * rowH + pad - 4;
	// Where the on-screen legend sits, so labels placed to avoid it avoid this too.
	const x = LEGEND_MARGIN;
	const y = spec.cssHeight - LEGEND_MARGIN - height;

	ctx.beginPath();
	ctx.roundRect(x, y, LEGEND_WIDTH, height, 8);
	ctx.fillStyle = colors.card;
	ctx.globalAlpha = 0.94;
	ctx.fill();
	ctx.globalAlpha = 1;
	ctx.strokeStyle = colors.border;
	ctx.lineWidth = 1;
	ctx.stroke();

	ctx.textBaseline = 'middle';
	ctx.fillStyle = colors.muted;
	ctx.font = `500 11px ${font}`;
	ctx.fillText(legend.caption, x + pad, y + pad + 6);

	legend.entries.forEach((entry, i) => {
		const rowY = y + pad + 16 + i * rowH + rowH / 2;
		ctx.fillStyle = entry.color;
		ctx.beginPath();
		ctx.roundRect(x + pad, rowY - 6, 12, 12, 2);
		ctx.fill();
		ctx.strokeStyle = colors.border;
		ctx.stroke();
		ctx.fillStyle = colors.foreground;
		ctx.font = `400 12px ${font}`;
		ctx.fillText(entry.label, x + pad + 20, rowY);
	});
}

/** Basemap credits from the style's sources, as plain text. */
export function attributionText(html: string[]): string {
	const text = html
		.map((h) =>
			h
				.replace(/<[^>]*>/g, '')
				.replace(/&copy;/g, '©')
				.replace(/&amp;/g, '&')
				.trim()
		)
		.filter(Boolean);
	return [...new Set(text)].join(' ');
}

export function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (!blob) return reject(new Error('Could not encode the image'));
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = fileName;
			a.click();
			// Give the download a moment to start before revoking.
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
			resolve();
		}, 'image/png');
	});
}
