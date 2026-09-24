<script lang="ts">
	import { enhance } from '$app/forms';
	import { ROLE_LABELS } from '$lib/auth/roles';
	import { Button } from '$lib/components/ui/button';
	import { formatReporter, MIN_PASSWORD_LENGTH, type ProfileErrors } from '$lib/validation/account';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** Kit merges the two actions' results into one optional-everything shape. */
	let profile = $derived(form?.action === 'profile' ? form : null);
	let password = $derived(form?.action === 'password' ? form : null);
	let profileErrors: ProfileErrors = $derived(profile?.errors ?? {});

	let name = $derived(profile?.values?.name ?? data.account.name);
	let affiliation = $derived(
		(profile?.values ? profile.values.affiliation : data.account.affiliation) ?? ''
	);

	let preview = $derived(
		formatReporter({ name: name.trim() || '…', affiliation: affiliation.trim() || null })
	);

	const inputClass =
		'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive';
</script>

<svelte:head><title>Your account · Administration</title></svelte:head>

<main class="mx-auto max-w-xl px-4 py-8">
	<h1 class="text-xl font-semibold tracking-tight">Your account</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		{data.account.email} · {ROLE_LABELS[data.account.role]}
	</p>

	<section class="mt-8" aria-labelledby="profile-heading">
		<h2 id="profile-heading" class="font-medium">Public profile</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			Shown publicly as “Reported by” on every detection you enter. Your email address is not.
		</p>

		<form
			method="POST"
			action="?/profile"
			class="mt-4 space-y-4"
			use:enhance={() =>
				async ({ update }) =>
					update({ reset: false })}
		>
			<div class="space-y-1.5">
				<label for="name" class="text-sm font-medium">Display name</label>
				<input
					id="name"
					name="name"
					required
					maxlength="80"
					autocomplete="name"
					bind:value={name}
					aria-invalid={Boolean(profileErrors.name)}
					aria-describedby="name-error"
					class={inputClass}
				/>
				{#if profileErrors.name}
					<p id="name-error" class="text-sm text-destructive">{profileErrors.name}</p>
				{/if}
			</div>

			<div class="space-y-1.5">
				<label for="affiliation" class="text-sm font-medium">
					Affiliation <span class="font-normal text-muted-foreground">(optional)</span>
				</label>
				<input
					id="affiliation"
					name="affiliation"
					maxlength="120"
					autocomplete="organization"
					placeholder="e.g. UW–Madison Plant Pathology"
					bind:value={affiliation}
					aria-invalid={Boolean(profileErrors.affiliation)}
					aria-describedby="affiliation-error"
					class={inputClass}
				/>
				{#if profileErrors.affiliation}
					<p id="affiliation-error" class="text-sm text-destructive">
						{profileErrors.affiliation}
					</p>
				{/if}
			</div>

			<p class="text-sm text-muted-foreground">
				Reads as: <span class="text-foreground">Reported by {preview}</span>
			</p>

			<div class="flex items-center gap-3">
				<Button type="submit">Save profile</Button>
				{#if profile?.saved}
					<p class="text-sm text-muted-foreground" role="status">Saved.</p>
				{/if}
			</div>
		</form>
	</section>

	<section class="mt-10 border-t pt-8" aria-labelledby="password-heading">
		<h2 id="password-heading" class="font-medium">Change password</h2>
		<p class="mt-1 text-sm text-muted-foreground">
			At least {MIN_PASSWORD_LENGTH} characters. Changing it signs you out on every other device.
		</p>

		<form method="POST" action="?/password" class="mt-4 space-y-4" use:enhance>
			{#if password?.error}
				<p
					class="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
					role="alert"
				>
					{password.error}
				</p>
			{/if}

			<!-- Lets password managers file the new password under the right account. -->
			<input type="hidden" name="username" autocomplete="username" value={data.account.email} />

			<div class="space-y-1.5">
				<label for="currentPassword" class="text-sm font-medium">Current password</label>
				<input
					id="currentPassword"
					name="currentPassword"
					type="password"
					required
					autocomplete="current-password"
					class={inputClass}
				/>
			</div>
			<div class="space-y-1.5">
				<label for="newPassword" class="text-sm font-medium">New password</label>
				<input
					id="newPassword"
					name="newPassword"
					type="password"
					required
					minlength={MIN_PASSWORD_LENGTH}
					autocomplete="new-password"
					class={inputClass}
				/>
			</div>
			<div class="space-y-1.5">
				<label for="confirmPassword" class="text-sm font-medium">Confirm new password</label>
				<input
					id="confirmPassword"
					name="confirmPassword"
					type="password"
					required
					minlength={MIN_PASSWORD_LENGTH}
					autocomplete="new-password"
					class={inputClass}
				/>
			</div>

			<div class="flex items-center gap-3">
				<Button type="submit">Change password</Button>
				{#if password?.saved}
					<p class="text-sm text-muted-foreground" role="status">Password changed.</p>
				{/if}
			</div>
		</form>
	</section>
</main>
