<script lang="ts">
	import type { PieceWithCover } from '$lib/types';
	import { formatRelativeDate } from '$lib/utils';

	let { piece } = $props<{ piece: PieceWithCover }>();
</script>

<a href="/pieces/{piece.id}" class="piece-card">
	<div class="piece-image">
		{#if piece.cover_url}
			<img src={piece.cover_url} alt={piece.name} loading="lazy" />
		{:else}
			<div class="no-image">
				<span>🏺</span>
				<p>No photo yet</p>
			</div>
		{/if}
	</div>

	<div class="piece-info">
		<h3 class="piece-name">{piece.name}</h3>
		{#if piece.description}
			<p class="piece-description">{piece.description}</p>
		{/if}
		<p class="piece-date">{formatRelativeDate(piece.updated_at)}</p>
	</div>
</a>

<style>
	.piece-card {
		display: flex;
		flex-direction: column;
		background: white;
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
		transition:
			transform 0.15s,
			box-shadow 0.15s;
		border: 1px solid #ede8e0;
	}

	.piece-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.1);
	}

	.piece-image {
		aspect-ratio: 1;
		overflow: hidden;
		background: #f5efe8;
	}

	.piece-image img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s;
	}

	.piece-card:hover .piece-image img {
		transform: scale(1.03);
	}

	.no-image {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #b09080;
		gap: 0.5rem;
	}

	.no-image span {
		font-size: 2.5rem;
		opacity: 0.4;
	}

	.no-image p {
		font-size: 0.8125rem;
	}

	.piece-info {
		padding: 0.875rem 1rem;
	}

	.piece-name {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #2c1810;
		margin-bottom: 0.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.piece-description {
		font-size: 0.8125rem;
		color: #7a5c4e;
		margin-bottom: 0.375rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.piece-date {
		font-size: 0.75rem;
		color: #a08070;
	}
</style>
