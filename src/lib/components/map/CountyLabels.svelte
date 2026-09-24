<script lang="ts" module>
	import type { Point, Rect } from '$lib/map/labels';

	export type LabelItem = { id: string; text: string; lngLat: [number, number] };

	/** One label as drawn, in pixels relative to the map container — what 5F's export redraws. */
	export type LabelLayout = { id: string; text: string; anchor: Point; box: Rect };
</script>

<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import type { Map as MapLibreMap } from 'maplibre-gl';
	import { labelBox, leaderEnd, placeLabels, type Offset } from '$lib/map/labels';

	type Props = {
		map: MapLibreMap;
		items: LabelItem[];
		onSelect: (id: string) => void;
		/** Out: the labels exactly as drawn. */
		layout?: LabelLayout[];
	};

	// `layout` is written below and read by the parent through `bind:layout`, which the
	// lint rule can't see.
	// eslint-disable-next-line no-useless-assignment
	let { map, items, onSelect, layout = $bindable([]) }: Props = $props();

	/** Offsets the admin chose by dragging. They win over automatic placement. */
	let dragged = $state<Record<string, Offset>>({});
	let auto = $state<Record<string, Offset>>({});
	let sizes = $state<Record<string, { w: number; h: number }>>({});
	/** Bumped on every map move, so projected anchors follow pans and zooms. */
	let frame = $state(0);

	const elements: Record<string, HTMLElement> = {};
	let container: HTMLDivElement;

	let anchors = $derived.by(() => {
		void frame;
		const canvas = map.getCanvas();
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		return items.flatMap((item) => {
			const p = map.project(item.lngLat);
			// A county scrolled out of view loses its label rather than trailing a leader
			// line to the edge of the map.
			if (p.x < 0 || p.y < 0 || p.x > width || p.y > height) return [];
			return [{ item, anchor: { x: p.x, y: p.y } }];
		});
	});

	/** `box` is null until the label has been measured and placed; it renders hidden. */
	type Drawn = { item: LabelItem; anchor: Point; box: Rect | null };

	let drawn = $derived(
		anchors.map(({ item, anchor }): Drawn => {
			const size = sizes[item.id];
			const offset = dragged[item.id] ?? auto[item.id];
			return { item, anchor, box: size && offset ? labelBox({ anchor, ...size }, offset) : null };
		})
	);

	$effect(() => {
		layout = drawn.flatMap(({ item, anchor, box }) =>
			box ? [{ id: item.id, text: item.text, anchor, box }] : []
		);
	});

	/** Map controls, legend, and anything else marked as a label obstacle. */
	function obstacles(): Rect[] {
		const origin = container.getBoundingClientRect();
		const scope = container.closest('[data-map-root]') ?? document;
		return [...scope.querySelectorAll('[data-map-obstacle], .maplibregl-ctrl')].map((el) => {
			const r = el.getBoundingClientRect();
			return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
		});
	}

	function relayout() {
		if (!container) return;
		const inputs = anchors.flatMap(({ item, anchor }) => {
			const size = sizes[item.id];
			return size ? [{ id: item.id, anchor, ...size, fixed: dragged[item.id] }] : [];
		});
		const canvas = map.getCanvas();
		const offsets = placeLabels(
			inputs,
			{ width: canvas.clientWidth, height: canvas.clientHeight },
			obstacles()
		);
		auto = Object.fromEntries(offsets);
	}

	// Measure any label that has rendered without a known size — new ones, and ones whose
	// county has just scrolled into view — then place. Labels render hidden until then.
	$effect(() => {
		const unmeasured = drawn.filter((d) => !d.box).map((d) => d.item.id);
		if (unmeasured.length === 0) return;
		tick().then(() => {
			const next = { ...sizes };
			for (const id of unmeasured) {
				const el = elements[id];
				if (el) next[id] = { w: el.offsetWidth, h: el.offsetHeight };
			}
			sizes = next;
			// Placement reads `sizes`; do it after they land.
			tick().then(relayout);
		});
	});

	onMount(() => {
		let pending = 0;
		const onMove = () => {
			if (pending) return;
			pending = requestAnimationFrame(() => {
				pending = 0;
				frame++;
			});
		};
		// Re-place once the view settles: zooming changes how far apart counties are, so
		// a layout that worked at one zoom can overlap at another.
		//
		// MapLibre can fire `moveend` synchronously — when an `easeTo` interrupts another
		// animation, inside whatever effect called it. A bare `frame++` there would read
		// `frame` in that effect, subscribe it, and loop (`effect_update_depth_exceeded`).
		const onSettle = () => {
			untrack(() => frame++);
			tick().then(relayout);
		};
		map.on('move', onMove);
		map.on('moveend', onSettle);
		map.on('resize', onSettle);
		return () => {
			cancelAnimationFrame(pending);
			map.off('move', onMove);
			map.off('moveend', onSettle);
			map.off('resize', onSettle);
		};
	});

	// --- Dragging -----------------------------------------------------------------------

	let drag: { id: string; startX: number; startY: number; from: Offset; moved: boolean } | null =
		null;

	function onPointerDown(ev: PointerEvent, id: string) {
		const from = dragged[id] ?? auto[id];
		if (!from || ev.button !== 0) return;
		(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
		drag = { id, startX: ev.clientX, startY: ev.clientY, from, moved: false };
	}

	function onPointerMove(ev: PointerEvent) {
		if (!drag) return;
		const dx = ev.clientX - drag.startX;
		const dy = ev.clientY - drag.startY;
		// A few pixels of wobble is still a click.
		if (!drag.moved && Math.hypot(dx, dy) < 4) return;
		drag.moved = true;
		dragged = { ...dragged, [drag.id]: { dx: drag.from.dx + dx, dy: drag.from.dy + dy } };
	}

	function onPointerUp() {
		if (!drag) return;
		const { id, moved } = drag;
		drag = null;
		if (moved) relayout();
		else onSelect(id);
	}

	/** Arrow keys nudge a focused label, so placement doesn't need a mouse. */
	function onKeyDown(ev: KeyboardEvent, id: string) {
		const step = ev.shiftKey ? 24 : 6;
		const move: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const delta = move[ev.key];
		const from = dragged[id] ?? auto[id];
		if (!delta || !from) return;
		ev.preventDefault();
		dragged = { ...dragged, [id]: { dx: from.dx + delta[0], dy: from.dy + delta[1] } };
		relayout();
	}
</script>

<div bind:this={container} class="pointer-events-none absolute inset-0 overflow-hidden">
	<svg class="absolute inset-0 h-full w-full" aria-hidden="true">
		{#each drawn as { item, anchor, box } (item.id)}
			{#if box}
				{@const end = leaderEnd(anchor, box)}
				{#if end}
					<line
						x1={anchor.x}
						y1={anchor.y}
						x2={end.x}
						y2={end.y}
						class="stroke-foreground/70"
						stroke-width="1.25"
					/>
				{/if}
				<circle
					cx={anchor.x}
					cy={anchor.y}
					r="3"
					class="fill-foreground stroke-background"
					stroke-width="1.5"
				/>
			{/if}
		{/each}
	</svg>

	{#each drawn as { item, box } (item.id)}
		<button
			type="button"
			bind:this={elements[item.id]}
			class="pointer-events-auto absolute cursor-grab rounded-md border bg-background/95 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-foreground shadow-sm select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
			style:left="{box?.x ?? 0}px"
			style:top="{box?.y ?? 0}px"
			style:visibility={box ? 'visible' : 'hidden'}
			aria-label="{item.text}. Select county; drag or use arrow keys to move the label."
			data-county-label={item.id}
			onpointerdown={(e) => onPointerDown(e, item.id)}
			onpointermove={onPointerMove}
			onpointerup={onPointerUp}
			onpointercancel={() => (drag = null)}
			onkeydown={(e) => onKeyDown(e, item.id)}
			onclick={(e) => {
				// Pointer clicks are handled in onPointerUp; this is Enter/Space.
				if (e.detail === 0) onSelect(item.id);
			}}
		>
			{item.text}
		</button>
	{/each}
</div>
