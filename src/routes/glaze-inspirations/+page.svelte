<script lang="ts">
	import type { PageData } from './$types';
	import type { GlazeInspirationWithUrl } from '$lib/types';
	import { invalidateAll } from '$app/navigation';
	import { formatDate, resizeImageToJpeg } from '$lib/utils';

	let { data } = $props<{ data: PageData }>();
	let inspirations = $derived(data.inspirations);

	let fileInput: HTMLInputElement;
	let uploading = $state(false);
	let uploadError = $state<string | null>(null);
	let deletingId = $state<string | null>(null);

	function triggerUpload() {
		uploadError = null;
		fileInput.click();
	}

	async function handleFileSelected() {
		const file = fileInput.files?.[0];
		if (!file) return;

		uploading = true;
		uploadError = null;
		try {
			const resized = await resizeImageToJpeg(file, 1024);
			const formData = new FormData();
			formData.append('image', resized);
			const resp = await fetch('/api/glaze-inspirations', { method: 'POST', body: formData });
			if (!resp.ok) throw new Error((await resp.text()) || 'Upload failed');
			await invalidateAll();
		} catch (err) {
			uploadError = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading = false;
			fileInput.value = '';
		}
	}

	async function handleDelete(inspiration: GlazeInspirationWithUrl) {
		deletingId = inspiration.id;
		try {
			const resp = await fetch(`/api/glaze-inspirations/${inspiration.id}`, { method: 'DELETE' });
			if (!resp.ok) throw new Error(await resp.text());
			await invalidateAll();
		} catch (err) {
			alert(err instanceof Error ? err.message : 'Delete failed');
		} finally {
			deletingId = null;
		}
	}
</script>

<svelte:head>
	<title>Glaze Inspirations — Pottery Tracker</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div class="breadcrumb">
			<a href="/">My Pieces</a>
			<span>›</span>
			<span>Glaze Inspirations</span>
		</div>

		<div class="title-row">
			<h1>Glaze Inspirations</h1>
			<input
				bind:this={fileInput}
				type="file"
				accept="image/*"
				style="display:none"
				onchange={handleFileSelected}
			/>
			<button class="upload-btn" onclick={triggerUpload} disabled={uploading}>
				{uploading ? 'Uploading…' : '+ Add Glaze'}
			</button>
		</div>

		{#if uploadError}
			<p class="upload-error">{uploadError}</p>
		{/if}

		<p class="page-description">
			Upload photos of glazed pottery to use as glaze references when previewing how a glaze will
			look on your pieces.
		</p>
	</div>

	{#if inspirations.length === 0}
		<div class="empty-state">
			<p>No glaze inspirations yet.</p>
			<button class="btn-primary" onclick={triggerUpload} disabled={uploading}>
				{uploading ? 'Uploading…' : 'Upload a reference photo'}
			</button>
		</div>
	{:else}
		<div class="grid">
			{#each inspirations as inspiration (inspiration.id)}
				<div class="card">
					<div class="card-image-wrap">
						<img src={inspiration.url} alt={inspiration.name || 'Glaze reference'} loading="lazy" />
					</div>
					<div class="card-footer">
						<span class="card-date">{formatDate(inspiration.created_at)}</span>
						<button
							class="delete-btn"
							onclick={() => handleDelete(inspiration)}
							disabled={deletingId === inspiration.id}
							aria-label="Delete glaze inspiration"
						>
							{deletingId === inspiration.id ? '…' : '×'}
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.page {
		max-width: 900px;
	}

	.page-header {
		margin-bottom: 2rem;
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

	.title-row {
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
		flex-shrink: 0;
	}

	.upload-btn:hover:not(:disabled) {
		background: #a8521f;
	}

	.upload-btn:disabled {
		opacity: 0.65;
		cursor: not-allowed;
	}

	.upload-error {
		color: #b91c1c;
		font-size: 0.875rem;
		margin-bottom: 0.5rem;
	}

	.page-description {
		font-size: 0.875rem;
		color: #7a5c4e;
		line-height: 1.5;
	}

	.empty-state {
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
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.9375rem;
		cursor: pointer;
		transition: background 0.15s;
	}

	.btn-primary:hover:not(:disabled) {
		background: #a8521f;
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
	}

	.card {
		background: white;
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid #ede8e0;
	}

	.card-image-wrap {
		aspect-ratio: 1;
		overflow: hidden;
		background: #f5efe8;
	}

	.card-image-wrap img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.625rem;
		gap: 0.5rem;
	}

	.card-date {
		font-size: 0.75rem;
		color: #9a7060;
	}

	.delete-btn {
		background: none;
		border: none;
		color: #b91c1c;
		font-size: 1.125rem;
		line-height: 1;
		padding: 0.125rem 0.25rem;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.1s;
		flex-shrink: 0;
	}

	.delete-btn:hover:not(:disabled) {
		background: #fee2e2;
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
