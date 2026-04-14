<script lang="ts">
	import type { ImageWithUrl, GlazeInspirationWithUrl } from '$lib/types';
	import { on } from 'svelte/events';

	let {
		open = $bindable(),
		pieceId,
		images,
		glazeInspirations,
		onsaved
	}: {
		open: boolean;
		pieceId: string;
		images: ImageWithUrl[];
		glazeInspirations: GlazeInspirationWithUrl[];
		onsaved?: () => void;
	} = $props();

	let selectedImageId = $state<string | null>(null);
	let selectedInspirationId = $state<string | null>(null);
	let generating = $state(false);
	let resultUrl = $state<string | null>(null);
	let generateError = $state<string | null>(null);
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let saved = $state(false);

	function close() {
		if (generating) return;
		open = false;
	}

	function reset() {
		selectedImageId = null;
		selectedInspirationId = null;
		resultUrl = null;
		generateError = null;
		saving = false;
		saveError = null;
		saved = false;
	}

	$effect(() => {
		if (!open) reset();
	});

	$effect(() => {
		if (!open) return;
		return on(document, 'keydown', (e: KeyboardEvent) => {
			if (e.key === 'Escape') close();
		});
	});

	async function generate() {
		if (!selectedImageId || !selectedInspirationId) return;
		generating = true;
		resultUrl = null;
		generateError = null;
		try {
			const resp = await fetch(`/api/pieces/${pieceId}/glaze-preview`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					pieceImageId: selectedImageId,
					glazeInspirationId: selectedInspirationId
				})
			});
			if (!resp.ok) throw new Error((await resp.text()) || 'Preview generation failed');
			const data = await resp.json();
			resultUrl = data.imageUrl;
		} catch (err) {
			generateError = err instanceof Error ? err.message : 'Preview generation failed';
		} finally {
			generating = false;
		}
	}

	async function savePreview() {
		if (!resultUrl || saving || saved) return;
		saving = true;
		saveError = null;
		try {
			const resp = await fetch(`/api/pieces/${pieceId}/glaze-preview/save`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					imageUrl: resultUrl,
					pieceImageId: selectedImageId,
					glazeInspirationId: selectedInspirationId
				})
			});
			if (!resp.ok) throw new Error((await resp.text()) || 'Save failed');
			saved = true;
			onsaved?.();
		} catch (err) {
			saveError = err instanceof Error ? err.message : 'Save failed';
		} finally {
			saving = false;
		}
	}

	const canGenerate = $derived(!!selectedImageId && !!selectedInspirationId && !generating);
</script>

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="overlay" onclick={(e) => e.target === e.currentTarget && close()}>
		<div class="dialog" role="dialog" aria-modal="true" aria-label="Preview Glaze">
			<div class="dialog-header">
				<h2>Preview Glaze</h2>
				<button class="close-btn" onclick={close} disabled={generating} aria-label="Close">×</button>
			</div>

			{#if resultUrl}
				<div class="result">
					<img src={resultUrl} alt="Generated glaze preview" class="result-image" />
					<div class="result-actions">
						{#if saved}
							<p class="save-success">Saved to Glaze Previews</p>
						{:else}
							<button class="btn-primary" onclick={savePreview} disabled={saving}>
								{saving ? 'Saving…' : 'Save Preview'}
							</button>
						{/if}
						<button class="btn-secondary" onclick={() => { resultUrl = null; saved = false; }}>
							Generate Another
						</button>
					</div>
					{#if saveError}
						<p class="save-error">{saveError}</p>
					{/if}
				</div>
			{:else}
				<div class="selections">
					<section class="panel">
						<h3>Select piece photo</h3>
						{#if images.length === 0}
							<p class="panel-empty">No photos for this piece yet.</p>
						{:else}
							<div class="thumb-grid">
								{#each images as image (image.id)}
									<button
										class="thumb-btn"
										class:selected={selectedImageId === image.id}
										onclick={() => { selectedImageId = image.id; }}
										aria-pressed={selectedImageId === image.id}
									>
										<img src={image.url} alt="" loading="lazy" />
									</button>
								{/each}
							</div>
						{/if}
					</section>

					<section class="panel">
						<h3>Select glaze reference</h3>
						{#if glazeInspirations.length === 0}
							<p class="panel-empty">
								No glaze inspirations yet. <a href="/glaze-inspirations" target="_blank">Add some →</a>
							</p>
						{:else}
							<div class="thumb-grid">
								{#each glazeInspirations as insp (insp.id)}
									<button
										class="thumb-btn"
										class:selected={selectedInspirationId === insp.id}
										onclick={() => { selectedInspirationId = insp.id; }}
										aria-pressed={selectedInspirationId === insp.id}
									>
										<img src={insp.url} alt={insp.name || 'Glaze reference'} loading="lazy" />
									</button>
								{/each}
							</div>
							<a href="/glaze-inspirations" target="_blank" class="manage-link">
								Manage inspirations →
							</a>
						{/if}
					</section>
				</div>

				{#if generateError}
					<p class="generate-error">{generateError}</p>
				{/if}

				<div class="dialog-footer">
					<button class="btn-primary" onclick={generate} disabled={!canGenerate}>
						{#if generating}
							<span class="spinner" aria-hidden="true"></span>
							Generating… (up to ~30s)
						{:else}
							Generate Preview
						{/if}
					</button>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 200;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.dialog {
		background: white;
		border-radius: 14px;
		width: 100%;
		max-width: 760px;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.dialog-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem 1rem;
		border-bottom: 1px solid #ede8e0;
		flex-shrink: 0;
	}

	h2 {
		font-size: 1.25rem;
		font-weight: 700;
		color: #2c1810;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		line-height: 1;
		color: #9a7060;
		cursor: pointer;
		padding: 0.125rem 0.375rem;
		border-radius: 4px;
		transition: background 0.1s;
	}

	.close-btn:hover:not(:disabled) {
		background: #f5efe8;
	}

	.close-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.selections {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1px;
		background: #ede8e0;
		flex: 1;
		overflow: hidden;
	}

	.panel {
		background: white;
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		overflow-y: auto;
	}

	h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: #5a4035;
		flex-shrink: 0;
	}

	.panel-empty {
		font-size: 0.875rem;
		color: #9a7060;
		line-height: 1.5;
	}

	.panel-empty a {
		color: #c0622c;
		text-decoration: underline;
	}

	.thumb-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
		gap: 0.5rem;
	}

	.thumb-btn {
		background: none;
		border: 2px solid transparent;
		border-radius: 6px;
		padding: 0;
		cursor: pointer;
		aspect-ratio: 1;
		overflow: hidden;
		transition: border-color 0.1s;
	}

	.thumb-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.thumb-btn.selected {
		border-color: #c0622c;
	}

	.thumb-btn:focus-visible {
		outline: 2px solid #c0622c;
		outline-offset: 2px;
	}

	.manage-link {
		font-size: 0.8125rem;
		color: #c0622c;
		text-decoration: underline;
		align-self: flex-start;
	}

	.generate-error {
		padding: 0.5rem 1.5rem;
		font-size: 0.875rem;
		color: #b91c1c;
		flex-shrink: 0;
	}

	.dialog-footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid #ede8e0;
		flex-shrink: 0;
	}

	.btn-primary {
		width: 100%;
		padding: 0.75rem;
		background: #c0622c;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		cursor: pointer;
		transition: background 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.btn-primary:hover:not(:disabled) {
		background: #a8521f;
	}

	.btn-primary:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}

	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid rgba(255, 255, 255, 0.4);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.7s linear infinite;
		flex-shrink: 0;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.result {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.result-image {
		width: 100%;
		max-height: 480px;
		object-fit: contain;
		border-radius: 8px;
		border: 1px solid #ede8e0;
	}

	.result-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
		max-width: 320px;
	}

	.result-actions .btn-primary {
		width: 100%;
	}

	.save-success {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #15803d;
		text-align: center;
		padding: 0.625rem 1.25rem;
	}

	.save-error {
		font-size: 0.8125rem;
		color: #b91c1c;
		text-align: center;
	}

	.btn-secondary {
		padding: 0.625rem 1.25rem;
		background: transparent;
		border: 1.5px solid #c0622c;
		color: #c0622c;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-secondary:hover {
		background: #fdf5f0;
	}

	@media (max-width: 560px) {
		.selections {
			grid-template-columns: 1fr;
		}
	}
</style>
