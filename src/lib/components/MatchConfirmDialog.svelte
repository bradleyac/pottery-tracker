<script lang="ts">
	import type { MatchResultWithPiece, PieceSummary } from '$lib/types';
	import { confidenceColor, confidenceLabel } from '$lib/utils';

	let { previewUrl, matchResult, pieces, onconfirm } = $props<{
		previewUrl: string;
		matchResult: MatchResultWithPiece;
		pieces: PieceSummary[];
		onconfirm: (action: 'accepted' | 'overridden' | 'new_piece', data: ConfirmData) => void;
	}>();

	export type ConfirmData = {
		pieceId?: string;
		newPieceName?: string;
		notes?: string;
	};

	type Mode = 'review' | 'choose_piece' | 'new_piece';
	let mode = $state<Mode>('review');

	let selectedPieceId = $state(matchResult.matchedPieceId ?? '');
	let newPieceName = $state(matchResult.suggestedName ?? '');
	let notes = $state('');

	const isMatch = $derived(matchResult.matchedPieceId !== null && matchResult.confidence >= 0.6);

	function acceptMatch() {
		onconfirm('accepted', { pieceId: matchResult.matchedPieceId!, notes });
	}

	function confirmOverride() {
		if (!selectedPieceId) return;
		onconfirm('overridden', { pieceId: selectedPieceId, notes });
	}

	function confirmNew() {
		if (!newPieceName.trim()) return;
		onconfirm('new_piece', { newPieceName: newPieceName.trim(), notes });
	}
</script>

<div class="dialog-backdrop">
	<div class="dialog">
		<h2 class="dialog-title">Confirm Photo Assignment</h2>

		<div class="dialog-body">
			<div class="preview-col">
				<img src={previewUrl} alt="Uploaded photo" class="preview-img" />
				<div class="notes-field">
					<label for="photo-notes">Notes (optional)</label>
					<textarea
						id="photo-notes"
						bind:value={notes}
						placeholder="Firing temp, glaze, stage…"
						rows="2"
					></textarea>
				</div>
			</div>

			<div class="info-col">
				{#if mode === 'review'}
					{#if isMatch}
						<div class="match-badge">
							<div
								class="confidence-dot"
								style="background: {confidenceColor(matchResult.confidence)}"
							></div>
							<span
								>{confidenceLabel(matchResult.confidence)} match ({Math.round(
									matchResult.confidence * 100
								)}%)</span
							>
						</div>

						<p class="match-title">
							Looks like <strong>{matchResult.matchedPieceName ?? 'an existing piece'}</strong>
						</p>
						{#if matchResult.matchedPieceCoverUrl}
							<img
								src={matchResult.matchedPieceCoverUrl}
								alt="Cover photo of {matchResult.matchedPieceName}"
								class="cover-preview"
							/>
						{/if}
						<p class="match-reasoning">{matchResult.reasoning}</p>

						<div class="actions">
							<button class="btn-primary" onclick={acceptMatch}>
								Yes, add to "{matchResult.matchedPieceName}"
							</button>
							<button class="btn-secondary" onclick={() => (mode = 'choose_piece')}>
								Choose a different piece
							</button>
							<button class="btn-ghost" onclick={() => (mode = 'new_piece')}>
								This is a new piece
							</button>
						</div>
					{:else}
						<div class="new-badge">New piece detected</div>
						<p class="match-title">No match found</p>
						{#if matchResult.reasoning}
							<p class="match-reasoning">{matchResult.reasoning}</p>
						{/if}

						<div class="actions">
							<button class="btn-primary" onclick={() => (mode = 'new_piece')}>
								Create new piece
							</button>
							{#if pieces.length > 0}
								<button class="btn-secondary" onclick={() => (mode = 'choose_piece')}>
									Assign to existing piece
								</button>
							{/if}
						</div>
					{/if}
				{:else if mode === 'choose_piece'}
					<h3>Choose a piece</h3>
					<div class="piece-picker">
						{#each pieces as piece (piece.id)}
							<button
								class="piece-option"
								class:selected={selectedPieceId === piece.id}
								onclick={() => (selectedPieceId = piece.id)}
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
						<button class="btn-primary" onclick={confirmOverride} disabled={!selectedPieceId}>
							Assign to this piece
						</button>
						<button class="btn-ghost" onclick={() => (mode = 'review')}>Back</button>
					</div>
				{:else}
					<h3>Name this piece</h3>
					<input
						type="text"
						bind:value={newPieceName}
						placeholder="e.g. Celadon Bowl #1"
						class="name-input"
						autofocus
					/>

					<div class="actions">
						<button class="btn-primary" onclick={confirmNew} disabled={!newPieceName.trim()}>
							Create new piece
						</button>
						<button class="btn-ghost" onclick={() => (mode = 'review')}>Back</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	.dialog-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 500;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.dialog {
		background: white;
		border-radius: 16px;
		width: 100%;
		max-width: 680px;
		max-height: 90vh;
		overflow-y: auto;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
	}

	.dialog-title {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid #f0ebe4;
		font-size: 1.125rem;
		font-weight: 700;
		color: #2c1810;
	}

	.dialog-body {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		padding: 1.5rem;
	}

	@media (max-width: 540px) {
		.dialog-body {
			grid-template-columns: 1fr;
			padding: 1rem;
			gap: 1rem;
		}

		.dialog-title {
			padding: 1rem;
		}
	}

	.preview-img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 8px;
		margin-bottom: 0.75rem;
	}

	.notes-field label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: #4a3728;
		margin-bottom: 0.25rem;
	}

	.notes-field textarea {
		width: 100%;
		border: 1.5px solid #e0d5cc;
		border-radius: 8px;
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		font-family: inherit;
		resize: vertical;
		outline: none;
	}

	.notes-field textarea:focus {
		border-color: #c0622c;
	}

	.info-col {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.match-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 20px;
		padding: 0.25rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: #166534;
		width: fit-content;
	}

	.confidence-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.new-badge {
		display: inline-block;
		background: #fef3c7;
		border: 1px solid #fcd34d;
		border-radius: 20px;
		padding: 0.25rem 0.75rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: #92400e;
		width: fit-content;
	}

	.match-title {
		font-size: 1rem;
		color: #2c1810;
		line-height: 1.4;
	}

	.cover-preview {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		border-radius: 8px;
		border: 1.5px solid #e0d5cc;
	}

	.match-reasoning {
		font-size: 0.875rem;
		color: #7a5c4e;
		line-height: 1.5;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: auto;
	}

	.piece-picker {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		grid-auto-rows: 130px;
		gap: 0.5rem;
		max-height: 280px;
		overflow-y: auto;
	}

	.piece-option {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 0;
		background: white;
		border: 1.5px solid #e0d5cc;
		border-radius: 8px;
		padding: 0;
		cursor: pointer;
		overflow: hidden;
		text-align: left;
		transition: border-color 0.15s;
	}

	.piece-option:hover {
		border-color: #c0622c;
	}

	.piece-option.selected {
		border-color: #c0622c;
		box-shadow: 0 0 0 2px rgba(192, 98, 44, 0.25);
	}

	.piece-option-img,
	.piece-option-placeholder {
		width: 100%;
		flex: 1;
		min-height: 0;
		object-fit: cover;
		display: block;
	}

	.piece-option-placeholder {
		background: #f0ebe4;
	}

	.piece-option-name {
		padding: 0.375rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #2c1810;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		border-top: 1px solid #f0ebe4;
	}

	.name-input {
		width: 100%;
		padding: 0.625rem 0.875rem;
		border: 1.5px solid #e0d5cc;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-family: inherit;
		color: #2c1810;
		outline: none;
	}

	.name-input:focus {
		border-color: #c0622c;
	}

	.btn-primary {
		padding: 0.65rem 1rem;
		background: #c0622c;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 600;
		transition: background 0.15s;
	}

	.btn-primary:hover:not(:disabled) {
		background: #a8521f;
	}

	.btn-primary:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-secondary {
		padding: 0.65rem 1rem;
		background: white;
		color: #4a3728;
		border: 1.5px solid #d4c4b8;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 500;
		transition: all 0.15s;
	}

	.btn-secondary:hover {
		border-color: #c0622c;
		color: #c0622c;
	}

	.btn-ghost {
		padding: 0.5rem;
		background: none;
		border: none;
		color: #9a7060;
		font-size: 0.875rem;
		text-align: left;
	}

	.btn-ghost:hover {
		color: #4a3728;
	}
</style>
