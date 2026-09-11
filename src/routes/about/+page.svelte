<script lang="ts">
	import { resolve } from '$app/paths';
</script>

<svelte:head>
	<title>About the detection map</title>
</svelte:head>

<div class="mx-auto max-w-2xl px-4 py-10">
	<a href={resolve('/')} class="text-sm text-muted-foreground hover:text-foreground"
		>← Back to map</a
	>

	<h1 class="mt-4 text-2xl font-semibold tracking-tight">About this map</h1>

	<div class="mt-6 space-y-6 text-sm leading-relaxed">
		<section>
			<h2 class="mb-2 text-base font-semibold">What is shown</h2>
			<p>
				This map reports confirmed detections of two diseases of commercial vegetable crops:
				<strong>late blight</strong> (<em>Phytophthora infestans</em>) on potato and tomato, and
				<strong>cucurbit downy mildew</strong> (<em>Pseudoperonospora cubensis</em>) on cucumber,
				melon, squash, and pumpkin.
			</p>
			<p class="mt-2">
				Both pathogens overwinter poorly across most of the country and arrive each season on
				wind-dispersed inoculum from elsewhere. That is what makes a detection map useful: knowing
				the disease has reached your region is the signal to begin or tighten a preventive fungicide
				program, and knowing it has not is a reason to hold off.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-base font-semibold">How to read the colours</h2>
			<p>
				For the <strong>current season</strong>, counties are shaded by how recently a detection was
				confirmed — the darkest shade means a report within the last week.
			</p>
			<p class="mt-2">
				For a <strong>past season</strong>, recency would tell you nothing, since every report is
				equally old. Those years are instead shaded by <em>when the disease first arrived</em> in each
				county, which is the more useful question after the fact.
			</p>
			<p class="mt-2">
				Counties with no shading have no confirmed reports for the selected disease and year. That
				is not the same as an absence of disease — it may simply mean nothing was reported.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-base font-semibold">Resolution and privacy</h2>
			<p>
				Detections are shown at county resolution only. No farm names, addresses, or coordinates are
				recorded or displayed.
			</p>
		</section>

		<section>
			<h2 class="mb-2 text-base font-semibold">Reporting a detection</h2>
			<p>
				Reports are entered by extension specialists after a confirmed diagnosis. If you suspect
				either disease, contact your regional extension office or plant disease diagnostic clinic —
				confirmation usually requires a sample.
			</p>
		</section>
	</div>
</div>
