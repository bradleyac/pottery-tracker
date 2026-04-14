<script lang="ts">
	import ImageGallery from '$lib/components/ImageGallery.svelte';
	import GlazePreviewDialog from '$lib/components/GlazePreviewDialog.svelte';
	import type { PageData } from './$types';
	import { formatDate } from '$lib/utils';
	import { invalidateAll, goto } from '$app/navigation';

	let { data } = $props<{ data: PageData }>();

	let { piece, glazeInspirations, glazePreviews } = $derived(data);

	let fileInput: HTMLInputElement;
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let deleting = $state(false);
	let glazePreviewOpen = $state(false);

	async function handleDeleteImage(imageId: string) {
		const resp = await fetch(`/api/images/${imageId}`, { method: 'DELETE' });
		if (!resp.ok) throw new Error(await resp.text());
		await invalidateAll();
	}

	function triggerFileInput() {
		uploadError = null;
		fileInput.click();
	}

	async function handleFileSelected() {
		const file = fileInput.files?.[0];
		if (!file) return;

		uploading = true;
		uploadError = null;
		try {
			const formData = new FormData();
			formData.append('image', file);
			const resp = await fetch(`/api/pieces/${piece.id}/upload`, {
				method: 'POST',
				body: formData
			});
			if (!resp.ok) {
				const text = await resp.text();
				throw new Error(text || 'Upload failed');
			}
			await invalidateAll();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
			fileInput.value = '';
		}
	}

	async function handleDeletePiece() {
		if (!confirm(`Delete "${piece.name}" and all its photos? This cannot be undone.`)) return;
		deleting = true;
		try {
			const resp = await fetch(`/api/pieces/${piece.id}`, { method: 'DELETE' });
			if (!resp.ok) {
				const text = await resp.text();
				throw new Error(text || 'Delete failed');
			}
			await goto('/');
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Failed to delete piece');
			deleting = false;
		}
	}
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
			<div class="title-actions">
				<input
					bind:this={fileInput}
					type="file"
					accept="image/*"
					style="display:none"
					onchange={handleFileSelected}
				/>
				<button class="upload-btn" onclick={triggerFileInput} disabled={uploading || deleting}>
					{uploading ? 'Uploading…' : '+ Add Photo'}
				</button>
				{#if piece.images.length > 0}
					<button class="glaze-preview-btn" onclick={() => { glazePreviewOpen = true; }} disabled={uploading || deleting}>
						Preview Glaze
					</button>
				{/if}
				<button class="delete-piece-btn" onclick={handleDeletePiece} disabled={uploading || deleting}>
					{deleting ? 'Deleting…' : 'Delete'}
				</button>
			</div>
		</div>
		{#if uploadError}
			<p class="upload-error">{uploadError}</p>
		{/if}

		{#if piece.description}
			<p class="piece-description">{piece.description}</p>
		{/if}

		{#if piece.ai_description}
			{@const identity = (() => { try { return JSON.parse(piece.ai_description); } catch { return null; } })()}
			<details class="ai-description">
				<summary>AI identity card</summary>
				{#if identity && typeof identity === 'object' && identity.form}
					<dl class="identity-card">
						<dt>Form</dt><dd>{identity.form}</dd>
						{#if identity.profile}<dt>Profile</dt><dd>{identity.profile}</dd>{/if}
						{#if identity.rimStyle}<dt>Rim</dt><dd>{identity.rimStyle}</dd>{/if}
						{#if identity.footRing}<dt>Foot/Base</dt><dd>{identity.footRing}</dd>{/if}
						{#if identity.handles}
							<dt>Handles</dt>
							<dd>{identity.handles.count === 0 ? 'None' : `${identity.handles.count} — ${identity.handles.style ?? ''}`}</dd>
						{/if}
						{#if identity.distinctiveMarks?.length > 0}
							<dt>Distinctive marks</dt>
							<dd><ul>{#each identity.distinctiveMarks as mark}<li>{mark}</li>{/each}</ul></dd>
						{/if}
						{#if identity.decorativeElements?.length > 0}
							<dt>Decorative elements</dt>
							<dd><ul>{#each identity.decorativeElements as elem}<li>{elem}</li>{/each}</ul></dd>
						{/if}
						{#if identity.approximateProportions}<dt>Proportions</dt><dd>{identity.approximateProportions}</dd>{/if}
						{#if identity.surfaceNotes}<dt>Surface</dt><dd>{identity.surfaceNotes}</dd>{/if}
					</dl>
				{:else}
					<p>{piece.ai_description}</p>
				{/if}
			</details>
		{/if}

		<div class="piece-meta">
			<span>Started {formatDate(piece.created_at)}</span>
			<span>·</span>
			<span>{piece.images.length} photo{piece.images.length === 1 ? '' : 's'}</span>
		</div>
	</div>

	<GlazePreviewDialog
		bind:open={glazePreviewOpen}
		pieceId={piece.id}
		images={piece.images}
		{glazeInspirations}
		onsaved={invalidateAll}
	/>

	{#if piece.images.length === 0}
		<div class="empty-images">
			<p>No photos yet.</p>
			<button class="btn-primary" onclick={triggerFileInput} disabled={uploading}>
				{uploading ? 'Uploading…' : 'Upload a photo'}
			</button>
		</div>
	{:else}
		<section class="timeline-section">
			<h2>Photo Timeline</h2>
			<ImageGallery images={piece.images} ondelete={handleDeleteImage} />
		</section>
	{/if}

	{#if glazePreviews.length > 0}
		<section class="previews-section">
			<h2>Glaze Previews</h2>
			<div class="previews-grid">
				{#each glazePreviews as preview (preview.id)}
					<div class="preview-card">
						<img src={preview.url} alt="Glaze preview" loading="lazy" />
						<p class="preview-date">{formatDate(preview.created_at)}</p>
					</div>
				{/each}
			</div>
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

	.title-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.upload-btn {
		padding: 0.625rem 1.25rem;
		background: #c0622c;
		color: white;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		white-space: nowrap;
		cursor: pointer;
		transition: background 0.15s;
	}

	.upload-btn:hover:not(:disabled) {
		background: #a8521f;
	}

	.upload-btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.glaze-preview-btn {
		padding: 0.625rem 1rem;
		background: transparent;
		color: #c0622c;
		border: 1.5px solid #c0622c;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.glaze-preview-btn:hover:not(:disabled) {
		background: #fdf5f0;
	}

	.glaze-preview-btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.delete-piece-btn {
		padding: 0.625rem 1rem;
		background: transparent;
		color: #b91c1c;
		border: 1.5px solid #b91c1c;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		white-space: nowrap;
		cursor: pointer;
		transition:
			background 0.15s,
			color 0.15s;
	}

	.delete-piece-btn:hover:not(:disabled) {
		background: #b91c1c;
		color: white;
	}

	.delete-piece-btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.upload-error {
		color: #b91c1c;
		font-size: 0.875rem;
		margin-bottom: 0.75rem;
	}

	.piece-description {
		color: #5a4035;
		font-size: 0.9375rem;
		margin-bottom: 0.75rem;
		line-height: 1.5;
	}

	.ai-description {
		margin-bottom: 0.75rem;
		font-size: 0.8125rem;
	}

	.ai-description summary {
		color: #9a7060;
		cursor: pointer;
		user-select: none;
		width: fit-content;
	}

	.ai-description summary:hover {
		color: #5a4035;
	}

	.ai-description p {
		margin-top: 0.5rem;
		color: #7a5c4e;
		line-height: 1.5;
		white-space: pre-wrap;
	}

	.identity-card {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 0.25rem 0.75rem;
		margin-top: 0.5rem;
		font-size: 0.8125rem;
		color: #7a5c4e;
		line-height: 1.5;
	}

	.identity-card dt {
		font-weight: 600;
		color: #5a4035;
	}

	.identity-card dd {
		margin: 0;
	}

	.identity-card ul {
		margin: 0;
		padding-left: 1.25rem;
	}

	.identity-card li {
		margin: 0;
	}

	.piece-meta {
		display: flex;
		gap: 0.5rem;
		font-size: 0.8125rem;
		color: #9a7060;
	}

	.timeline-section h2,
	.previews-section h2 {
		font-size: 1.125rem;
		font-weight: 600;
		color: #4a3728;
		margin-bottom: 1.25rem;
	}

	.previews-section {
		margin-top: 2.5rem;
	}

	.previews-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1rem;
	}

	.preview-card {
		background: white;
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid #ede8e0;
	}

	.preview-card img {
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		display: block;
	}

	.preview-date {
		font-size: 0.75rem;
		color: #9a7060;
		padding: 0.375rem 0.625rem;
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
