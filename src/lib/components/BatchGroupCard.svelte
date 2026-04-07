<script lang="ts">
	import type { PendingUploadWithUrls, PieceSummary } from '$lib/types';

	export type GroupDecision =
		| { mode: 'review' }
		| { mode: 'new_piece'; name: string }
		| { mode: 'choose_piece'; selectedId: string }
		| { mode: 'saving' }
		| { mode: 'saved'; pieceId: string }
		| { mode: 'error'; message: string };

	let {
		uploads,
		pieces,
		decision,
		onDecisionChange,
		onConfirm,
		onSeparate
	} = $props<{
		uploads: PendingUploadWithUrls[];
		pieces: PieceSummary[];
		decision: GroupDecision;
		onDecisionChange: (d: GroupDecision) => void;
		onConfirm: (
			action: 'to_piece' | 'new_piece',
			pieceId?: string,
			newPieceName?: string
		) => Promise<void>;
		onSeparate: (uploadId: string) => Promise<void>;
	}>();

	// If all members share the same matched_piece_id, the group is anchored to that piece
	const anchorPieceId = $derived(
		uploads.length > 0 &&
			uploads[0].matched_piece_id !== null &&
			uploads.every((u: PendingUploadWithUrls) => u.matched_piece_id === uploads[0].matched_piece_id)
			? uploads[0].matched_piece_id
			: null
	);

	const anchorPieceName = $derived(
		anchorPieceId
			? (uploads.find((u: PendingUploadWithUrls) => u.matched_piece_id === anchorPieceId)?.matchedPieceName ?? null)
			: null
	);

	const suggestedName = $derived(
		uploads.find((u: PendingUploadWithUrls) => u.suggested_name)?.suggested_name ?? 'New Piece'
	);

	async function handleAddToAnchor() {
		if (!anchorPieceId) return;
		onDecisionChange({ mode: 'saving' });
		await onConfirm('to_piece', anchorPieceId);
	}

	async function handleCreateNew() {
		if (decision.mode !== 'new_piece') return;
		const name = decision.name.trim();
		if (!name) return;
		onDecisionChange({ mode: 'saving' });
		await onConfirm('new_piece', undefined, name);
	}

	async function handleOverride() {
		if (decision.mode !== 'choose_piece' || !decision.selectedId) return;
		onDecisionChange({ mode: 'saving' });
		await onConfirm('to_piece', decision.selectedId);
	}
</script>

<div class="card">
	{#if decision.mode === 'saving'}
		<div class="card-body center-body">
			<div class="spinner"></div>
			<p>Saving…</p>
		</div>
	{:else if decision.mode === 'saved'}
		<div class="card-body center-body">
			<span class="saved-icon">✓</span>
			<p>Saved! <a href="/pieces/{decision.pieceId}" class="view-link">View piece →</a></p>
		</div>
	{:else if decision.mode === 'error'}
		<div class="card-body stack">
			<div class="failed-badge">{decision.message}</div>
			<div class="actions">
				<button class="btn-secondary" onclick={() => onDecisionChange({ mode: 'review' })}>Try again</button>
			</div>
		</div>
	{:else if decision.mode === 'choose_piece'}
		<div class="card-body stack">
			<h3 class="picker-heading">Assign all {uploads.length} photos to a piece</h3>
			<div class="piece-picker">
				{#each pieces as piece (piece.id)}
					<button
						class="piece-option"
						class:selected={decision.selectedId === piece.id}
						onclick={() => onDecisionChange({ mode: 'choose_piece', selectedId: piece.id })}
					>
						{#if piece.cover_url}
							<img src={piece.cover_url} alt={piece.name} class="piece-option-img" />
						{:else}
							<div class="piece-option-placeholder"></div>
						{/if}
						<span class="piece-option-name">{piece.name}</span>
					</button>
				{/each}
			</div>
			<div class="actions">
				<button class="btn-primary" onclick={handleOverride} disabled={!decision.selectedId}>
					Assign to this piece
				</button>
				<button class="btn-ghost" onclick={() => onDecisionChange({ mode: 'review' })}>Back</button>
			</div>
		</div>
	{:else if decision.mode === 'new_piece'}
		<div class="card-body stack">
			<h3 class="picker-heading">Name this new piece</h3>
			<input
				type="text"
				value={decision.name}
				oninput={(e) =>
					onDecisionChange({ mode: 'new_piece', name: (e.target as HTMLInputElement).value })}
				placeholder="e.g. Celadon Bowl #1"
				class="name-input"
			/>
			<div class="actions">
				<button class="btn-primary" onclick={handleCreateNew} disabled={!decision.name.trim()}>
					Create piece from {uploads.length} photos
				</button>
				<button class="btn-ghost" onclick={() => onDecisionChange({ mode: 'review' })}>Back</button>
			</div>
		</div>
	{:else}
		<!-- review mode -->
		<div class="card-body stack">
			<div class="group-header">
				{#if anchorPieceName}
					<span class="match-badge">Matches "{anchorPieceName}"</span>
				{:else}
					<span class="new-badge">New piece — {uploads.length} photos</span>
				{/if}
			</div>

			<div class="photo-strip" role="list">
				{#each uploads as upload (upload.id)}
					<div class="photo-item" role="listitem">
						<div class="photo-wrap">
							<img
								src={upload.tempImageUrl}
								alt={upload.original_filename ?? 'Photo'}
								class="strip-img"
							/>
						</div>
						<span class="photo-filename">{upload.original_filename ?? 'Photo'}</span>
						<button class="btn-separate" onclick={() => onSeparate(upload.id)}>
							Separate
						</button>
					</div>
				{/each}
			</div>

			<div class="actions">
				{#if anchorPieceId}
					<button class="btn-primary" onclick={handleAddToAnchor}>
						Add all {uploads.length} photos to "{anchorPieceName}"
					</button>
					<button
						class="btn-secondary"
						onclick={() => onDecisionChange({ mode: 'new_piece', name: suggestedName })}
					>
						Create as new piece
					</button>
					{#if pieces.length > 0}
						<button
							class="btn-ghost"
							onclick={() => onDecisionChange({ mode: 'choose_piece', selectedId: '' })}
						>
							Assign to different piece
						</button>
					{/if}
				{:else}
					<button
						class="btn-primary"
						onclick={() => onDecisionChange({ mode: 'new_piece', name: suggestedName })}
					>
						Create new piece from {uploads.length} photos
					</button>
					{#if pieces.length > 0}
						<button
							class="btn-secondary"
							onclick={() => onDecisionChange({ mode: 'choose_piece', selectedId: '' })}
						>
							Assign to existing piece
						</button>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	.card {
		background: white;
		border: 1px solid #ede8e0;
		border-radius: 12px;
		overflow: hidden;
	}

	.card-body {
		padding: 1rem;
	}

	.stack {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.center-body {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 80px;
		gap: 0.75rem;
	}

	.group-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.match-badge {
		display: inline-block;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 20px;
		padding: 0.2rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #166534;
	}

	.new-badge {
		display: inline-block;
		background: #fef3c7;
		border: 1px solid #fcd34d;
		border-radius: 20px;
		padding: 0.2rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #92400e;
	}

	/* Photo strip */
	.photo-strip {
		display: flex;
		gap: 0.5rem;
		overflow-x: auto;
		padding-bottom: 0.25rem;
	}

	.photo-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		flex-shrink: 0;
	}

	.photo-wrap {
		width: 96px;
		height: 96px;
		border-radius: 8px;
		overflow: hidden;
		border: 1px solid #ede8e0;
	}

	.strip-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.photo-filename {
		font-size: 0.625rem;
		color: #9a7060;
		max-width: 96px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: center;
	}

	.btn-separate {
		font-size: 0.6875rem;
		color: #9a7060;
		background: none;
		border: 1px solid #e0d5cc;
		border-radius: 4px;
		padding: 0.125rem 0.375rem;
		cursor: pointer;
	}

	.btn-separate:active {
		background: #f0ebe4;
	}

	/* Actions */
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	/* Piece picker */
	.picker-heading {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #2c1810;
	}

	.piece-picker {
		display: grid;
		grid-template-columns: repeat(auto-fill, 90px);
		gap: 0.375rem;
		max-height: 220px;
		overflow-y: auto;
	}

	.piece-option {
		display: flex;
		flex-direction: column;
		background: white;
		border: 1.5px solid #e0d5cc;
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		overflow: hidden;
		text-align: left;
		transition: border-color 0.15s;
	}

	.piece-option.selected {
		border-color: #c0622c;
		box-shadow: 0 0 0 2px rgba(192, 98, 44, 0.2);
	}

	.piece-option-img,
	.piece-option-placeholder {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		display: block;
	}

	.piece-option-placeholder {
		background: #f0ebe4;
	}

	.piece-option-name {
		padding: 0.25rem 0.375rem;
		font-size: 0.6875rem;
		font-weight: 500;
		color: #2c1810;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		border-top: 1px solid #f0ebe4;
	}

	.name-input {
		width: 100%;
		padding: 0.5rem 0.75rem;
		border: 1.5px solid #e0d5cc;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-family: inherit;
		color: #2c1810;
		outline: none;
		box-sizing: border-box;
	}

	.name-input:focus {
		border-color: #c0622c;
	}

	/* Saved / spinner */
	.spinner {
		width: 24px;
		height: 24px;
		border: 2.5px solid #f0ebe4;
		border-top-color: #c0622c;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.saved-icon {
		width: 32px;
		height: 32px;
		background: #f0fdf4;
		border: 1.5px solid #86efac;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1rem;
		color: #166534;
	}

	.view-link {
		color: #c0622c;
		font-weight: 500;
	}

	.failed-badge {
		display: inline-block;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 20px;
		padding: 0.2rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #991b1b;
	}

	/* Buttons */
	.btn-primary {
		padding: 0.5rem 0.875rem;
		background: #c0622c;
		color: white;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 600;
		transition: background 0.15s;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		padding: 0.5rem 0.875rem;
		background: white;
		color: #4a3728;
		border: 1.5px solid #d4c4b8;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.15s;
	}

	.btn-ghost {
		padding: 0.375rem 0.5rem;
		background: none;
		border: none;
		color: #9a7060;
		font-size: 0.8125rem;
	}
</style>
