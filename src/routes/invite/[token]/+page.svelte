<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import { ROLE_LABELS } from '$lib/auth/roles';
	import { Button } from '$lib/components/ui/button';
	import { MIN_PASSWORD_LENGTH, type ProfileErrors } from '$lib/validation/account';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let submitting = $state(false);
	let link = $derived(form?.expired ? null : data.link);
	let errors: ProfileErrors = $derived(form?.errors ?? {});

	const inputClass =
		'w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive';
</script>

<svelte:head>
	<title>{data.link?.kind === 'reset' ? 'Set a new password' : 'Accept invitation'}</title>
	<!-- The URL is a credential; don't leak it to other sites. -->
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<main class="flex min-h-[calc(100dvh-var(--brand-bar-h))] items-center justify-center px-4 py-8">
	<div class="w-full max-w-sm">
		{#if !link}
			<h1 class="text-xl font-semibold tracking-tight">This link is no longer valid</h1>
			<p class="mt-2 text-sm text-muted-foreground">
				It may have been used already, replaced by a newer one, or expired. Ask the admin who sent
				it for a new link.
			</p>
			<p class="mt-4 text-sm">
				<a href={resolve('/login')} class="underline underline-offset-4">Sign in</a>
				·
				<a href={resolve('/')} class="underline underline-offset-4">View the map</a>
			</p>
		{:else}
			<h1 class="text-xl font-semibold tracking-tight">
				{link.kind === 'reset' ? 'Set a new password' : 'Accept invitation'}
			</h1>
			<p class="mt-1 text-sm text-muted-foreground">
				{#if link.kind === 'reset'}
					For {link.email}. This signs you out everywhere else.
				{:else}
					You're invited to record detections as {link.role === 'admin' ? 'an' : 'a'}
					{ROLE_LABELS[link.role ?? 'reporter'].toLowerCase()}. You'll sign in as {link.email}.
				{/if}
			</p>

			<form
				method="POST"
				class="mt-6 space-y-4"
				use:enhance={() => {
					submitting = true;
					return async ({ update }) => {
						await update({ reset: false });
						submitting = false;
					};
				}}
			>
				<!-- Lets password managers file the new password under the right account. -->
				<input type="hidden" name="username" autocomplete="username" value={link.email} />

				{#if link.kind === 'invite'}
					<div class="space-y-1.5">
						<label for="name" class="text-sm font-medium">Your name</label>
						<input
							id="name"
							name="name"
							required
							maxlength="80"
							autocomplete="name"
							value={form?.values?.name ?? ''}
							aria-invalid={Boolean(errors.name)}
							aria-describedby="name-help"
							class={inputClass}
						/>
						<p
							id="name-help"
							class="text-xs {errors.name ? 'text-destructive' : 'text-muted-foreground'}"
						>
							{errors.name ??
								'Shown publicly as “Reported by” on the detections you enter. Your email address is not.'}
						</p>
					</div>

					<div class="space-y-1.5">
						<label for="affiliation" class="text-sm font-medium">
							Affiliation <span class="font-normal text-muted-foreground"
								>(optional, also public)</span
							>
						</label>
						<input
							id="affiliation"
							name="affiliation"
							maxlength="120"
							autocomplete="organization"
							placeholder="e.g. UW–Madison Plant Pathology"
							value={form?.values?.affiliation ?? ''}
							aria-invalid={Boolean(errors.affiliation)}
							class={inputClass}
						/>
						{#if errors.affiliation}
							<p class="text-xs text-destructive">{errors.affiliation}</p>
						{/if}
					</div>
				{/if}

				<div class="space-y-1.5">
					<label for="password" class="text-sm font-medium">
						{link.kind === 'reset' ? 'New password' : 'Password'}
					</label>
					<input
						id="password"
						name="password"
						type="password"
						required
						minlength={MIN_PASSWORD_LENGTH}
						autocomplete="new-password"
						aria-invalid={Boolean(form?.passwordError)}
						aria-describedby="password-help"
						class={inputClass}
					/>
					<p
						id="password-help"
						class="text-xs {form?.passwordError ? 'text-destructive' : 'text-muted-foreground'}"
					>
						{form?.passwordError ?? `At least ${MIN_PASSWORD_LENGTH} characters.`}
					</p>
				</div>
				<div class="space-y-1.5">
					<label for="confirmPassword" class="text-sm font-medium">Confirm password</label>
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

				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}
						Saving…
					{:else}
						{link.kind === 'reset' ? 'Set password and sign in' : 'Create account and sign in'}
					{/if}
				</Button>
			</form>
		{/if}
	</div>
</main>
