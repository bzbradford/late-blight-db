<script lang="ts">
	import { enhance } from '$app/forms';
	import { ROLE_LABELS, ROLES, type Role } from '$lib/auth/roles';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';

	/**
	 * Role and email changes on the users page. Both are consequential enough to deserve a
	 * deliberate step rather than an inline control, and the dialog says what will happen.
	 */
	type Props = {
		/** The account being changed, and which change; null when closed. */
		target: { id: string; name: string; email: string; role: Role; mode: 'role' | 'email' } | null;
		onClose: () => void;
	};

	let { target, onClose }: Props = $props();

	let role = $derived<Role>(target?.role ?? 'reporter');
	let email = $derived(target?.email ?? '');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	const ROLE_HELP: Record<Role, string> = {
		reporter: 'Adds detections, and edits or retracts only their own.',
		admin:
			'Also changes anyone’s detections, imports CSVs, and manages accounts. They rank below you: you can change their account, and they can’t change yours.'
	};

	function close() {
		error = null;
		onClose();
	}
</script>

<Dialog.Root
	bind:open={
		() => target !== null,
		(open) => {
			if (!open) close();
		}
	}
>
	{#if target}
		<Dialog.Content class="sm:max-w-md">
			<Dialog.Header>
				<Dialog.Title>
					{target.mode === 'role'
						? `Change role for ${target.name}`
						: `Change email for ${target.name}`}
				</Dialog.Title>
				<Dialog.Description>
					{#if target.mode === 'role'}
						Currently {ROLE_LABELS[target.role].toLowerCase()}.
					{:else}
						They sign in with this address. It is never shown publicly.
					{/if}
				</Dialog.Description>
			</Dialog.Header>

			<form
				method="POST"
				action={target.mode === 'role' ? '?/setRole' : '?/setEmail'}
				class="space-y-4"
				use:enhance={() => {
					submitting = true;
					error = null;
					return async ({ result, update }) => {
						submitting = false;
						if (result.type === 'failure') {
							const message = result.data?.error;
							error = typeof message === 'string' ? message : 'That didn’t work.';
							return;
						}
						if (result.type === 'success') close();
						await update({ reset: false });
					};
				}}
			>
				<input type="hidden" name="userId" value={target.id} />

				{#if target.mode === 'role'}
					<fieldset class="space-y-2">
						<legend class="sr-only">Role</legend>
						{#each ROLES as option (option)}
							<label
								class="flex cursor-pointer gap-3 rounded-md border p-3 has-checked:border-foreground"
							>
								<input type="radio" name="role" value={option} bind:group={role} class="mt-1" />
								<span>
									<span class="font-medium">{ROLE_LABELS[option]}</span>
									<span class="block text-sm text-muted-foreground">{ROLE_HELP[option]}</span>
								</span>
							</label>
						{/each}
					</fieldset>
				{:else}
					<div class="space-y-1.5">
						<label for="account-email" class="text-sm font-medium">Email</label>
						<input
							id="account-email"
							name="email"
							type="email"
							required
							bind:value={email}
							class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						/>
						<p class="text-xs text-muted-foreground">
							They’re signed out now and sign in with the new address next time. Their password
							doesn’t change.
						</p>
					</div>
				{/if}

				{#if error}
					<p class="text-sm text-destructive" role="alert">{error}</p>
				{/if}

				<Dialog.Footer>
					<Button type="button" variant="outline" onclick={close}>Cancel</Button>
					<Button
						type="submit"
						disabled={submitting ||
							(target.mode === 'role'
								? role === target.role
								: email.trim().toLowerCase() === target.email)}
					>
						{target.mode === 'role' ? 'Change role' : 'Save email'}
					</Button>
				</Dialog.Footer>
			</form>
		</Dialog.Content>
	{/if}
</Dialog.Root>
