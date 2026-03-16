<script lang="ts">
	import ImageGallery from '$lib/components/ImageGallery.svelte';
	import type { PageData } from './$types';
	import { formatDate } from '$lib/utils';

	let { data } = $props<{ data: PageData }>();

	let { piece } = $derived(data);
</script>

<svelte:head>
	<title>{piece.name} — Pottery Tracker</title>
</svelte:head>

<div class="piece-page">
	<div class="piece-header">
		<div class="breadcrumb">
			<a href="/">My Pieces</a>
			<span>›</span>
			<span>{piece.name}</span>
		</div>

		<div class="piece-title-row">
			<h1>{piece.name}</h1>
			<a href="/upload" class="upload-btn">+ Add Photo</a>
		</div>

		{#if piece.description}
			<p class="piece-description">{piece.description}</p>
		{/if}

		<div class="piece-meta">
			<span>Started {formatDate(piece.created_at)}</span>
			<span>·</span>
			<span>{piece.images.length} photo{piece.images.length === 1 ? '' : 's'}</span>
		</div>
	</div>

	{#if piece.images.length === 0}
		<div class="empty-images">
			<p>No photos yet.</p>
			<a href="/upload" class="btn-primary">Upload a photo</a>
		</div>
	{:else}
		<section class="timeline-section">
			<h2>Photo Timeline</h2>
			<ImageGallery images={piece.images} />
		</section>
	{/if}
</div>

<style>
	.piece-page {
		max-width: 900px;
	}

	.piece-header {
		margin-bottom: 2.5rem;
	}

	.breadcrumb {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		color: #9a7060;
		margin-bottom: 1rem;
	}

	.breadcrumb a {
		color: #c0622c;
	}

	.breadcrumb a:hover {
		text-decoration: underline;
	}

	.piece-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
	}

	h1 {
		font-size: 2rem;
		font-weight: 700;
		color: #2c1810;
	}

	.upload-btn {
		flex-shrink: 0;
		padding: 0.625rem 1.25rem;
		background: #c0622c;
		color: white;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		white-space: nowrap;
		transition: background 0.15s;
	}

	.upload-btn:hover {
		background: #a8521f;
	}

	.piece-description {
		color: #5a4035;
		font-size: 0.9375rem;
		margin-bottom: 0.75rem;
		line-height: 1.5;
	}

	.piece-meta {
		display: flex;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: #9a7060;
	}

	.timeline-section h2 {
		font-size: 1.125rem;
		font-weight: 600;
		color: #4a3728;
		margin-bottom: 1.25rem;
	}

	.empty-images {
		background: white;
		border-radius: 12px;
		padding: 3rem;
		text-align: center;
		border: 1px solid #ede8e0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		color: #7a5c4e;
	}

	.btn-primary {
		padding: 0.75rem 1.5rem;
		background: #c0622c;
		color: white;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		transition: background 0.15s;
	}

	.btn-primary:hover {
		background: #a8521f;
	}
</style>
