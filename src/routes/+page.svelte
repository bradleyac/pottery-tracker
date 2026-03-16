<script lang="ts">
	import PieceCard from '$lib/components/PieceCard.svelte';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
</script>

<svelte:head>
	<title>My Pieces — Pottery Tracker</title>
</svelte:head>

<div class="dashboard">
	<div class="dashboard-header">
		<div>
			<h1>My Pieces</h1>
			<p class="subtitle">
				{data.pieces.length === 0
					? 'No pieces yet'
					: `${data.pieces.length} piece${data.pieces.length === 1 ? '' : 's'}`}
			</p>
		</div>
		<a href="/upload" class="upload-btn">+ Upload Photo</a>
	</div>

	{#if data.pieces.length === 0}
		<div class="empty-state">
			<span class="empty-icon">🏺</span>
			<h2>No pieces yet</h2>
			<p>Upload your first photo to start tracking your pottery journey.</p>
			<a href="/upload" class="btn-primary">Upload a photo</a>
		</div>
	{:else}
		<div class="pieces-grid">
			{#each data.pieces as piece (piece.id)}
				<PieceCard {piece} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.dashboard-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 2rem;
		gap: 1rem;
	}

	h1 {
		font-size: 2rem;
		font-weight: 700;
		color: #2c1810;
		margin-bottom: 0.25rem;
	}

	.subtitle {
		color: #7a5c4e;
		font-size: 0.9375rem;
	}

	.upload-btn {
		flex-shrink: 0;
		padding: 0.625rem 1.25rem;
		background: #c0622c;
		color: white;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		transition: background 0.15s;
		white-space: nowrap;
	}

	.upload-btn:hover {
		background: #a8521f;
	}

	.pieces-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1.25rem;
	}

	.empty-state {
		background: white;
		border-radius: 16px;
		padding: 4rem 2rem;
		text-align: center;
		border: 1px solid #ede8e0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.empty-icon {
		font-size: 4rem;
		opacity: 0.4;
	}

	.empty-state h2 {
		font-size: 1.25rem;
		color: #2c1810;
	}

	.empty-state p {
		color: #7a5c4e;
		max-width: 320px;
	}

	.btn-primary {
		padding: 0.75rem 1.5rem;
		background: #c0622c;
		color: white;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		margin-top: 0.5rem;
		transition: background 0.15s;
	}

	.btn-primary:hover {
		background: #a8521f;
	}
</style>
