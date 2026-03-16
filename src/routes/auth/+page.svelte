<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData } from './$types';

	let { form } = $props<{ form: ActionData }>();

	let activeTab = $state<'login' | 'signup'>('login');
	let loading = $state(false);
</script>

<svelte:head>
	<title>Sign in — Pottery Tracker</title>
</svelte:head>

<div class="auth-container">
	<div class="auth-card">
		<div class="logo">
			<span class="logo-icon">🏺</span>
			<h1>Pottery Tracker</h1>
			<p>Track your pieces from clay to kiln</p>
		</div>

		<div class="tabs">
			<button
				class="tab"
				class:active={activeTab === 'login'}
				onclick={() => (activeTab = 'login')}
			>
				Sign in
			</button>
			<button
				class="tab"
				class:active={activeTab === 'signup'}
				onclick={() => (activeTab = 'signup')}
			>
				Sign up
			</button>
		</div>

		{#if form?.message}
			<div class="alert" class:success={form.success} class:error={!form.success}>
				{form.message}
			</div>
		{/if}

		{#if activeTab === 'login'}
			<form
				method="POST"
				action="?/login"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
			>
				<div class="field">
					<label for="login-email">Email</label>
					<input
						id="login-email"
						name="email"
						type="email"
						required
						autocomplete="email"
						value={form?.email ?? ''}
						placeholder="potter@example.com"
					/>
				</div>

				<div class="field">
					<label for="login-password">Password</label>
					<input
						id="login-password"
						name="password"
						type="password"
						required
						autocomplete="current-password"
						placeholder="••••••••"
					/>
				</div>

				<button type="submit" class="btn-primary" disabled={loading}>
					{loading ? 'Signing in…' : 'Sign in'}
				</button>
			</form>
		{:else}
			<form
				method="POST"
				action="?/signup"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						await update();
					};
				}}
			>
				<div class="field">
					<label for="signup-email">Email</label>
					<input
						id="signup-email"
						name="email"
						type="email"
						required
						autocomplete="email"
						value={form?.email ?? ''}
						placeholder="potter@example.com"
					/>
				</div>

				<div class="field">
					<label for="signup-password">Password</label>
					<input
						id="signup-password"
						name="password"
						type="password"
						required
						autocomplete="new-password"
						placeholder="At least 8 characters"
						minlength="8"
					/>
				</div>

				<button type="submit" class="btn-primary" disabled={loading}>
					{loading ? 'Creating account…' : 'Create account'}
				</button>
			</form>
		{/if}
	</div>
</div>

<style>
	.auth-container {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		background: linear-gradient(135deg, #f8f5f0 0%, #ede8e0 100%);
	}

	.auth-card {
		background: white;
		border-radius: 16px;
		padding: 2.5rem;
		width: 100%;
		max-width: 400px;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
	}

	.logo {
		text-align: center;
		margin-bottom: 2rem;
	}

	.logo-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 0.5rem;
	}

	.logo h1 {
		font-size: 1.5rem;
		font-weight: 700;
		color: #2c1810;
		margin-bottom: 0.25rem;
	}

	.logo p {
		font-size: 0.875rem;
		color: #7a5c4e;
	}

	.tabs {
		display: flex;
		border-bottom: 2px solid #f0ebe4;
		margin-bottom: 1.5rem;
	}

	.tab {
		flex: 1;
		padding: 0.75rem;
		background: none;
		border: none;
		font-size: 0.9375rem;
		color: #7a5c4e;
		font-weight: 500;
		transition: color 0.15s;
		position: relative;
	}

	.tab.active {
		color: #c0622c;
	}

	.tab.active::after {
		content: '';
		position: absolute;
		bottom: -2px;
		left: 0;
		right: 0;
		height: 2px;
		background: #c0622c;
	}

	.alert {
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		font-size: 0.875rem;
	}

	.alert.error {
		background: #fef2f2;
		color: #991b1b;
		border: 1px solid #fecaca;
	}

	.alert.success {
		background: #f0fdf4;
		color: #166534;
		border: 1px solid #bbf7d0;
	}

	.field {
		margin-bottom: 1rem;
	}

	label {
		display: block;
		font-size: 0.875rem;
		font-weight: 500;
		color: #4a3728;
		margin-bottom: 0.375rem;
	}

	input {
		width: 100%;
		padding: 0.625rem 0.875rem;
		border: 1.5px solid #e0d5cc;
		border-radius: 8px;
		font-size: 0.9375rem;
		color: #2c1810;
		background: #faf8f6;
		transition: border-color 0.15s;
		outline: none;
	}

	input:focus {
		border-color: #c0622c;
		background: white;
	}

	.btn-primary {
		width: 100%;
		padding: 0.75rem;
		background: #c0622c;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 600;
		margin-top: 0.5rem;
		transition: background 0.15s;
	}

	.btn-primary:hover:not(:disabled) {
		background: #a8521f;
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
