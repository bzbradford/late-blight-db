<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Tabs from '$lib/components/ui/tabs';
</script>

<svelte:head><title>Vegetable Disease Detection Map</title></svelte:head>

<main class="mx-auto max-w-2xl space-y-6 p-8">
	<h1 class="text-2xl font-semibold tracking-tight">Vegetable Disease Detection Map</h1>
	<p class="text-sm text-muted-foreground">
		Scaffold placeholder. The app shell, map, and detection feed are built in later phases.
	</p>

	<Tabs.Root value="late-blight">
		<Tabs.List>
			<Tabs.Trigger value="late-blight">Late blight</Tabs.Trigger>
			<Tabs.Trigger value="cucurbit-downy-mildew">Cucurbit downy mildew</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="late-blight">
			<Card.Root>
				<Card.Header>
					<Card.Title>Late blight</Card.Title>
					<Card.Description><em>Phytophthora infestans</em></Card.Description>
				</Card.Header>
				<Card.Content>
					<p class="text-sm">No detections recorded yet.</p>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
		<Tabs.Content value="cucurbit-downy-mildew">
			<Card.Root>
				<Card.Header>
					<Card.Title>Cucurbit downy mildew</Card.Title>
					<Card.Description><em>Pseudoperonospora cubensis</em></Card.Description>
				</Card.Header>
				<Card.Content>
					<p class="text-sm">No detections recorded yet.</p>
				</Card.Content>
			</Card.Root>
		</Tabs.Content>
	</Tabs.Root>

	<Button>Scaffold OK</Button>
</main>
