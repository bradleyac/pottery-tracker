<script lang="ts">
	import type { PendingUploadWithUrls, PieceSummary } from '$lib/types';
	import { confidenceColor, confidenceLabel } from '$lib/utils';

	export type CardDecision =
		| { mode: 'review' }
		| { mode: 'choose_piece'; selectedId: string }
		| { mode: 'new_piece'; name: string }
		| { mode: 'saving' }
		| { mode: 'saved'; pieceId: string }
		| { mode: 'dismissed' }
		| { mode: 'error'; message: string };

	let { upload, pieces, decision, onDecisionChange, onConfirm, onDismiss, onRetry } = $props<{
		upload: PendingUploadWithUrls;
		pieces: PieceSummary[];
		decision: CardDecision;
		onDecisionChange: (d: CardDecision) => void;
		onConfirm: (
			action: 'accepted' | 'overridden' | 'new_piece',
			notes: string,
			pieceId?: string,
			newPieceName?: string
		) => Promise<void>;
		onDismiss: () => Promise<void>;
		onRetry?: () => Promise<void>;
	}>();

	let notes = $state('');

	const isMatch = $derived(
		upload.status === 'ready' && upload.matched_piece_id !== null && (upload.confidence ?? 0) >= 0.6
	);

	async function handleAccept() {
		onDecisionChange({ mode: 'saving' });
		await onConfirm('accepted', notes);
	}

	async function handleOverride() {
		if (decision.mode !== 'choose_piece') return;
		const selectedId = decision.selectedId;
		onDecisionChange({ mode: 'saving' });
		await onConfirm('overridden', notes, selectedId);
	}

	async function handleCreateNew() {
		if (decision.mode !== 'new_piece') return;
		if (!decision.name.trim()) return;
		const name = decision.name.trim();
		onDecisionChange({ mode: 'saving' });
		await onConfirm('new_piece', notes, undefined, name);
	}

	$inspect(decision);
</script>

<div
	class="card"
	class:queued={upload.status === 'queued'}
	class:failed={upload.status === 'failed'}
>
	{#if upload.status === 'queued'}
		<div class="card-body skeleton-body">
			<div class="skeleton-img"></div>
			<div class="skeleton-text">
				<div class="skeleton-line wide"></div>
				<div class="skeleton-line narrow"></div>
				<p class="analyzing-label">Analyzing with Claude…</p>
			</div>
		</div>
	{:else if upload.status === 'failed'}
		<div class="card-body">
			{#if upload.tempImageUrl}
				<img src={upload.tempImageUrl} alt={upload.original_filename ?? 'Photo'} class="thumb" />
			{/if}
			<div class="info-col">
				<p class="filename">{upload.original_filename ?? 'Photo'}</p>
				<div class="failed-badge">Analysis failed</div>
				<div class="actions">
					{#if onRetry}
						<button class="btn-secondary" onclick={onRetry}>Retry analysis</button>
					{/if}
					<button class="btn-ghost dismiss-btn" onclick={onDismiss}>Dismiss</button>
				</div>
			</div>
		</div>
	{:else if decision.mode === 'saving'}
		<div class="card-body saving-body">
			<div class="spinner"></div>
			<p>Saving…</p>
		</div>
	{:else if decision.mode === 'saved'}
		<div class="card-body saved-body">
			<span class="saved-icon">✓</span>
			<p>Saved! <a href="/pieces/{decision.pieceId}" class="view-link">View piece →</a></p>
		</div>
	{:else if decision.mode === 'dismissed'}
		<!-- Hidden/removed, parent handles removal -->
		<div class="card-body saved-body">
			<span class="saved-icon dismiss-icon">✕</span>
			<p>Dismissed</p>
		</div>
	{:else if decision.mode === 'error'}
		<div class="card-body">
			{#if upload.tempImageUrl}
				<img src={upload.tempImageUrl} alt={upload.original_filename ?? 'Photo'} class="thumb" />
			{/if}
			<div class="info-col">
				<p class="filename">{upload.original_filename ?? 'Photo'}</p>
				<div class="failed-badge">{decision.message}</div>
				<div class="actions">
					<button class="btn-secondary" onclick={() => onDecisionChange({ mode: 'review' })}
						>Try again</button
					>
					<button class="btn-ghost" onclick={onDismiss}>Dismiss</button>
				</div>
			</div>
		</div>
	{:else if decision.mode === 'review'}
		<div class="card-body">
			<div class="photos-col">
				{#if upload.tempImageUrl}
					<img src={upload.tempImageUrl} alt={upload.original_filename ?? 'Photo'} class="thumb" />
				{/if}
				{#if upload.matchedPieceCoverUrl}
					<div class="matched-cover-wrap">
						<img
							src={upload.matchedPieceCoverUrl}
							alt={upload.matchedPieceName ?? 'Matched piece'}
							class="cover-thumb"
						/>
						<span class="cover-label">{upload.matchedPieceName}</span>
					</div>
				{/if}
			</div>

			<div class="info-col">
				<p class="filename">{upload.original_filename ?? 'Photo'}</p>

				{#if isMatch}
					<div
						class="confidence-badge"
						style="--dot-color: {confidenceColor(upload.confidence ?? 0)}"
					>
						<span class="conf-dot"></span>
						{confidenceLabel(upload.confidence ?? 0)} match ({Math.round(
							(upload.confidence ?? 0) * 100
						)}%)
					</div>
					<p class="reasoning">{upload.claude_reasoning}</p>

					<div class="notes-field">
						<label for="notes-{upload.id}">Notes (optional)</label>
						<textarea
							id="notes-{upload.id}"
							bind:value={notes}
							placeholder="Firing temp, glaze, stage…"
							rows="2"
						></textarea>
					</div>

					<div class="actions">
						<button class="btn-primary" onclick={handleAccept}>
							Add to "{upload.matchedPieceName}"
						</button>
						<button
							class="btn-secondary"
							onclick={() =>
								onDecisionChange({
									mode: 'choose_piece',
									selectedId: upload.matched_piece_id ?? ''
								})}
						>
							Pick different piece
						</button>
						<button
							class="btn-ghost"
							onclick={() =>
								onDecisionChange({ mode: 'new_piece', name: upload.suggested_name ?? '' })}
						>
							This is a new piece
						</button>
					</div>
				{:else}
					<div class="new-badge">New piece detected</div>
					{#if upload.claude_reasoning}
						<p class="reasoning">{upload.claude_reasoning}</p>
					{/if}

					<div class="notes-field">
						<label for="notes-{upload.id}">Notes (optional)</label>
						<textarea
							id="notes-{upload.id}"
							bind:value={notes}
							placeholder="Firing temp, glaze, stage…"
							rows="2"
						></textarea>
					</div>

					<div class="actions">
						<button
							class="btn-primary"
							onclick={() =>
								onDecisionChange({ mode: 'new_piece', name: upload.suggested_name ?? '' })}
						>
							Create new piece
						</button>
						{#if pieces.length > 0}
							<button
								class="btn-secondary"
								onclick={() => onDecisionChange({ mode: 'choose_piece', selectedId: '' })}
							>
								Assign to existing piece
							</button>
						{/if}
						<button class="btn-ghost" onclick={onDismiss}>Dismiss</button>
					</div>
				{/if}
			</div>
		</div>
	{:else if decision.mode === 'choose_piece'}
		<div class="card-body">
			{#if upload.tempImageUrl}
				<img src={upload.tempImageUrl} alt={upload.original_filename ?? 'Photo'} class="thumb" />
			{/if}
			<div class="info-col">
				<p class="filename">{upload.original_filename ?? 'Photo'}</p>
				<h3 class="picker-heading">Choose a piece</h3>
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
					<button class="btn-ghost" onclick={() => onDecisionChange({ mode: 'review' })}
						>Back</button
					>
				</div>
			</div>
		</div>
	{:else if decision.mode === 'new_piece'}
		<div class="card-body">
			{#if upload.tempImageUrl}
				<img src={upload.tempImageUrl} alt={upload.original_filename ?? 'Photo'} class="thumb" />
			{/if}
			<div class="info-col">
				<p class="filename">{upload.original_filename ?? 'Photo'}</p>
				<h3 class="picker-heading">Name this piece</h3>
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
						Create new piece
					</button>
					<button class="btn-ghost" onclick={() => onDecisionChange({ mode: 'review' })}
						>Back</button
					>
				</div>
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

	.card.queued {
		opacity: 0.7;
	}

	.card.failed {
		border-color: #fecaca;
	}

	.card-body {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		align-items: flex-start;
	}

	/* Skeleton */
	.skeleton-body {
		gap: 1rem;
	}

	.skeleton-img {
		width: 120px;
		height: 120px;
		border-radius: 8px;
		background: linear-gradient(90deg, #f0ebe4 25%, #e8e0d6 50%, #f0ebe4 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		flex-shrink: 0;
	}

	.skeleton-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.25rem;
	}

	.skeleton-line {
		height: 12px;
		border-radius: 6px;
		background: linear-gradient(90deg, #f0ebe4 25%, #e8e0d6 50%, #f0ebe4 75%);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
	}

	.skeleton-line.wide {
		width: 60%;
	}
	.skeleton-line.narrow {
		width: 35%;
	}

	.analyzing-label {
		font-size: 0.8125rem;
		color: #9a7060;
		margin-top: 0.25rem;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	/* Saving state */
	.saving-body {
		justify-content: center;
		align-items: center;
		min-height: 80px;
		gap: 0.75rem;
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 2.5px solid #f0ebe4;
		border-top-color: #c0622c;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Saved state */
	.saved-body {
		justify-content: center;
		align-items: center;
		min-height: 60px;
		gap: 0.75rem;
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

	.dismiss-icon {
		background: #f5f5f5;
		border-color: #d1d5db;
		color: #6b7280;
	}

	.view-link {
		color: #c0622c;
		font-weight: 500;
	}

	/* Main layout */
	.photos-col {
		display: flex;
		gap: 0.5rem;
		align-items: flex-start;
		flex-shrink: 0;
	}

	.thumb {
		width: 120px;
		height: 120px;
		object-fit: cover;
		border-radius: 8px;
		flex-shrink: 0;
		border: 1px solid #ede8e0;
	}

	.matched-cover-wrap {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.cover-thumb {
		width: 80px;
		height: 80px;
		object-fit: cover;
		border-radius: 6px;
		border: 1.5px solid #e0d5cc;
	}

	.cover-label {
		font-size: 0.6875rem;
		color: #7a5c4e;
		text-align: center;
		max-width: 80px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.info-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		min-width: 0;
	}

	.filename {
		font-size: 0.8125rem;
		color: #9a7060;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.confidence-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 20px;
		padding: 0.2rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #166534;
		width: fit-content;
	}

	.conf-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--dot-color, #22c55e);
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
		width: fit-content;
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
		width: fit-content;
	}

	.reasoning {
		font-size: 0.8125rem;
		color: #7a5c4e;
		line-height: 1.5;
	}

	.notes-field label {
		display: block;
		font-size: 0.75rem;
		font-weight: 500;
		color: #4a3728;
		margin-bottom: 0.2rem;
	}

	.notes-field textarea {
		width: 100%;
		border: 1.5px solid #e0d5cc;
		border-radius: 6px;
		padding: 0.375rem 0.625rem;
		font-size: 0.8125rem;
		font-family: inherit;
		resize: vertical;
		outline: none;
	}

	.notes-field textarea:focus {
		border-color: #c0622c;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin-top: 0.25rem;
	}

	.dismiss-btn {
		margin-top: 0.25rem;
	}

	/* Piece picker */
	.picker-heading {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #2c1810;
		margin-bottom: 0.25rem;
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

	.piece-option:hover {
		border-color: #c0622c;
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
	}

	.name-input:focus {
		border-color: #c0622c;
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

	.btn-primary:hover:not(:disabled) {
		background: #a8521f;
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

	.btn-secondary:hover {
		border-color: #c0622c;
		color: #c0622c;
	}

	.btn-ghost {
		padding: 0.375rem 0.5rem;
		background: none;
		border: none;
		color: #9a7060;
		font-size: 0.8125rem;
	}

	.btn-ghost:hover {
		color: #4a3728;
	}

	@media (max-width: 540px) {
		.card-body {
			flex-direction: column;
		}
	}
</style>
