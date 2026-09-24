<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import XIcon from '@lucide/svelte/icons/x';
	import { ROLE_LABELS, ROLES, type Role } from '$lib/auth/roles';
	import AccountDialog from '$lib/components/admin/AccountDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	/** The link just issued, until the admin dismisses it. It can't be shown again. */
	let dismissed = $state<string | null>(null);
	let issued = $derived(form?.action === 'link' && form.link !== dismissed ? form : null);
	let inviteError = $derived(form?.action === 'invite' ? form : null);
	let rowError = $derived(form?.action === 'row' && form.error ? form : null);

	/** A reset link is requested from the table below; bring the result into view. */
	let issuedPanel: HTMLElement | undefined = $state();
	$effect(() => {
		if (issued) issuedPanel?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	});

	let copied = $state(false);
	async function copy(text: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// No clipboard access (e.g. plain HTTP): the field is selected for a manual copy.
			document.querySelector<HTMLInputElement>('#issued-link')?.select();
		}
	}

	function formatDate(date: Date | null) {
		return date
			? date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
			: '—';
	}

	function confirmDeactivate(event: SubmitEvent, name: string) {
		const ok = confirm(
			`Deactivate ${name}? They are signed out now and can't sign in again until reactivated. Their detections stay, with their name.`
		);
		if (!ok) event.preventDefault();
	}

	type Target = { id: string; name: string; email: string; role: Role; mode: 'role' | 'email' };
	let editing = $state<Target | null>(null);

	/** Keeps the page and scroll position after an action; results show inline. */
	const keep =
		() =>
		async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) =>
			update({ reset: false });

	const selectClass = 'rounded-md border border-input bg-background px-2 py-1 text-sm';
</script>

<svelte:head><title>Users · Administration</title></svelte:head>

<main class="mx-auto max-w-5xl px-4 py-8">
	<h1 class="text-xl font-semibold tracking-tight">Users</h1>
	<p class="mt-1 text-sm text-muted-foreground">
		Reporters add detections and change their own. Admins can change any detection, import CSVs, and
		manage users.
	</p>

	<section class="mt-8" aria-labelledby="invite-heading">
		<h2 id="invite-heading" class="font-medium">Invite someone</h2>
		<form
			method="POST"
			action="?/invite"
			class="mt-3 flex flex-wrap items-end gap-3"
			use:enhance={() =>
				async ({ update, result }) =>
					update({ reset: result.type === 'success' })}
		>
			<div class="space-y-1">
				<label for="invite-email" class="text-xs text-muted-foreground">Email</label>
				<input
					id="invite-email"
					name="email"
					type="email"
					required
					value={inviteError?.email ?? ''}
					class="w-72 max-w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
				/>
			</div>
			<div class="space-y-1">
				<label for="invite-role" class="text-xs text-muted-foreground">Role</label>
				<select id="invite-role" name="role" class="{selectClass} py-1.5">
					{#each ROLES as role (role)}
						<option value={role} selected={role === 'reporter'}>{ROLE_LABELS[role]}</option>
					{/each}
				</select>
			</div>
			<Button type="submit">Create invite link</Button>
		</form>
		{#if inviteError?.error}
			<p class="mt-2 text-sm text-destructive" role="alert">{inviteError.error}</p>
		{/if}

		{#if issued}
			<div
				bind:this={issuedPanel}
				class="relative mt-4 rounded-lg border bg-muted/40 p-4 pr-12"
				role="status"
			>
				<p class="text-sm font-medium">
					{issued.kind === 'invite' ? 'Invite link' : 'Password reset link'} for {issued.email}
				</p>
				<button
					type="button"
					class="absolute top-3 right-3 grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
					aria-label="Dismiss link"
					onclick={() => (dismissed = issued?.link ?? null)}
				>
					<XIcon class="size-4" />
				</button>
				<div class="mt-2 flex gap-2">
					<input
						id="issued-link"
						readonly
						value={issued.link}
						aria-label="Link"
						class="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1.5 font-mono text-xs"
						onfocus={(e) => e.currentTarget.select()}
					/>
					<Button type="button" variant="secondary" onclick={() => copy(issued.link)}>
						{copied ? 'Copied' : 'Copy'}
					</Button>
				</div>
				<p class="mt-2 text-xs text-muted-foreground">
					Send it to them yourself — this site doesn't send email. It works once, for {issued.days}
					days, and won't be shown again; if it's lost, create a new one.
				</p>
			</div>
		{/if}
	</section>

	<section class="mt-10" aria-labelledby="users-heading">
		<h2 id="users-heading" class="font-medium">Accounts</h2>
		<div class="relative mt-3 overflow-x-auto">
			<table class="w-full text-sm">
				<thead class="border-b text-left text-xs text-muted-foreground">
					<tr>
						<th class="py-2 pr-3 font-medium">Name</th>
						<th class="py-2 pr-3 font-medium">Email</th>
						<th class="py-2 pr-3 font-medium">Role</th>
						<th class="py-2 pr-3 font-medium">Added by</th>
						<th class="py-2 pr-3 text-right font-medium">Detections</th>
						<th class="py-2 pr-3 font-medium">Last sign-in</th>
						<th class="py-2 font-medium"><span class="sr-only">Actions</span></th>
					</tr>
				</thead>
				<tbody>
					{#each data.users as user (user.id)}
						{@const self = user.id === data.viewerId}
						<tr class="border-b align-top last:border-b-0">
							<td class="min-w-40 py-2 pr-3" class:text-muted-foreground={user.deactivatedAt}>
								{user.name}{#if self}<span class="text-muted-foreground">&nbsp;(you)</span>{/if}
								{#if user.deactivatedAt}
									<span class="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">Deactivated</span>
								{/if}
								{#if user.affiliation}
									<div class="text-xs text-muted-foreground">{user.affiliation}</div>
								{/if}
							</td>
							<td class="py-2 pr-3">{user.email}</td>
							<td class="py-2 pr-3 whitespace-nowrap">
								{ROLE_LABELS[user.role]}
								{#if user.adminSince}
									<div class="text-xs text-muted-foreground">
										since {formatDate(user.adminSince)}
									</div>
								{/if}
							</td>
							<td class="py-2 pr-3">{user.addedBy ?? '—'}</td>
							<td class="py-2 pr-3 text-right tabular-nums">
								{#if user.detections > 0}
									<a
										href="{resolve('/admin')}?reportedBy={encodeURIComponent(user.id)}"
										class="underline underline-offset-4">{user.detections}</a
									>
								{:else}
									0
								{/if}
							</td>
							<td class="py-2 pr-3 whitespace-nowrap">{formatDate(user.lastSignInAt)}</td>
							<td class="py-2 text-right">
								{#if user.manageable}
									<div class="flex flex-wrap justify-end gap-x-3 gap-y-1 whitespace-nowrap">
										{#if user.deactivatedAt}
											<form method="POST" action="?/reactivate" use:enhance={keep}>
												<input type="hidden" name="userId" value={user.id} />
												<button type="submit" class="underline underline-offset-4"
													>Reactivate</button
												>
											</form>
										{:else}
											<button
												type="button"
												class="underline underline-offset-4"
												onclick={() => (editing = { ...user, mode: 'role' })}>Change role</button
											>
											<button
												type="button"
												class="underline underline-offset-4"
												onclick={() => (editing = { ...user, mode: 'email' })}>Change email</button
											>
											<form method="POST" action="?/resetLink" use:enhance={keep}>
												<input type="hidden" name="userId" value={user.id} />
												<button type="submit" class="underline underline-offset-4">
													Reset password
												</button>
											</form>
											<form
												method="POST"
												action="?/deactivate"
												use:enhance={keep}
												onsubmit={(e) => confirmDeactivate(e, user.name)}
											>
												<input type="hidden" name="userId" value={user.id} />
												<button type="submit" class="text-destructive underline underline-offset-4">
													Deactivate
												</button>
											</form>
										{/if}
									</div>
								{:else if !self && user.role === 'admin'}
									<span class="text-xs text-muted-foreground">Admin before you</span>
								{/if}
								{#if rowError?.userId === user.id}
									<p class="mt-1 text-xs text-destructive" role="alert">{rowError.error}</p>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
		<p class="mt-2 text-xs text-muted-foreground">
			Detections counts what is on the map now; retracted detections aren't included. Accounts are
			deactivated rather than deleted, so their detections keep their name. You can change an
			admin's account only if you became an admin before them. Change your own from your account
			page.
		</p>
	</section>

	{#if data.invites.length}
		<section class="mt-10" aria-labelledby="invites-heading">
			<h2 id="invites-heading" class="font-medium">Pending invitations</h2>
			<div class="relative mt-3 overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="border-b text-left text-xs text-muted-foreground">
						<tr>
							<th class="py-2 pr-3 font-medium">Email</th>
							<th class="py-2 pr-3 font-medium">Role</th>
							<th class="py-2 pr-3 font-medium">Invited by</th>
							<th class="py-2 pr-3 font-medium">Expires</th>
							<th class="py-2 font-medium"><span class="sr-only">Actions</span></th>
						</tr>
					</thead>
					<tbody>
						{#each data.invites as invite (invite.id)}
							<tr class="border-b last:border-b-0">
								<td class="py-2 pr-3">{invite.email}</td>
								<td class="py-2 pr-3">{ROLE_LABELS[invite.role]}</td>
								<td class="py-2 pr-3">{invite.invitedBy ?? '—'}</td>
								<td class="py-2 pr-3 whitespace-nowrap">{formatDate(invite.expiresAt)}</td>
								<td class="py-2 text-right">
									<form method="POST" action="?/revoke" use:enhance={keep}>
										<input type="hidden" name="id" value={invite.id} />
										<button type="submit" class="underline underline-offset-4">Revoke</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}
</main>

<AccountDialog target={editing} onClose={() => (editing = null)} />
