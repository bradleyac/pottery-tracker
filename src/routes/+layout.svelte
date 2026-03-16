<script lang="ts">
	import NavBar from '$lib/components/NavBar.svelte';
	import type { LayoutData } from './$types';

	let { data, children } = $props<{ data: LayoutData; children: import('svelte').Snippet }>();
</script>

<div class="app">
	{#if data.session}
		<NavBar user={data.user} pendingCount={data.pendingCount} />
	{/if}

	<main class="main-content">
		{@render children()}
	</main>
</div>

<style>
	:global(*, *::before, *::after) {
		box-sizing: border-box;
		margin: 0;
		padding: 0;
	}

	:global(body) {
		font-family:
			-apple-system,
			BlinkMacSystemFont,
			'Segoe UI',
			Roboto,
			Oxygen,
			Ubuntu,
			sans-serif;
		background: #f8f5f0;
		color: #2c1810;
		min-height: 100vh;
	}

	:global(a) {
		color: inherit;
		text-decoration: none;
	}

	:global(button) {
		cursor: pointer;
		font-family: inherit;
	}

	.app {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}

	.main-content {
		flex: 1;
		padding: 2rem 1rem;
		max-width: 1200px;
		margin: 0 auto;
		width: 100%;
	}
</style>
