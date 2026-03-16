<script lang="ts">
	import type { ImageWithUrl } from '$lib/types';
	import { formatDate } from '$lib/utils';

	let { images, ondelete = null } = $props<{
		images: ImageWithUrl[];
		ondelete?: ((imageId: string) => Promise<void>) | null;
	}>();

	let lightboxIndex = $state<number | null>(null);
	let confirmingId = $state<string | null>(null);
	let deletingId = $state<string | null>(null);

	function openLightbox(index: number) {
		lightboxIndex = index;
	}

	function closeLightbox() {
		lightboxIndex = null;
	}

	function prevImage() {
		if (lightboxIndex === null) return;
		lightboxIndex = (lightboxIndex - 1 + images.length) % images.length;
	}

	function nextImage() {
		if (lightboxIndex === null) return;
		lightboxIndex = (lightboxIndex + 1) % images.length;
	}

	function handleKeydown(e: KeyboardEvent) {
		if (lightboxIndex === null) return;
		if (e.key === 'Escape') closeLightbox();
		if (e.key === 'ArrowLeft') prevImage();
		if (e.key === 'ArrowRight') nextImage();
	}

	async function confirmDelete(imageId: string) {
		if (!ondelete) return;
		deletingId = imageId;
		try {
			await ondelete(imageId);
		} finally {
			deletingId = null;
			confirmingId = null;
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="gallery">
	{#each images as image, i (image.id)}
		<div class="gallery-item">
			<div class="image-wrapper">
				<button class="image-btn" onclick={() => openLightbox(i)}>
					<img src={image.url} alt="Pottery photo {i + 1}" loading="lazy" />
				</button>
				{#if ondelete}
					<button
						class="delete-btn"
						onclick={() => (confirmingId = image.id)}
						aria-label="Delete photo"
						title="Delete photo"
					>✕</button>
				{/if}
			</div>
			<div class="image-meta">
				{#if confirmingId === image.id}
					<span class="confirm-text">Delete this photo?</span>
					<div class="confirm-actions">
						<button
							class="confirm-yes"
							onclick={() => confirmDelete(image.id)}
							disabled={deletingId === image.id}
						>
							{deletingId === image.id ? 'Deleting…' : 'Yes, delete'}
						</button>
						<button class="confirm-no" onclick={() => (confirmingId = null)}>Cancel</button>
					</div>
				{:else}
					<span class="image-date">{formatDate(image.uploaded_at)}</span>
					{#if image.notes}
						<span class="image-notes">{image.notes}</span>
					{/if}
				{/if}
			</div>
		</div>
	{/each}
</div>

{#if lightboxIndex !== null}
	<div
		class="lightbox-overlay"
		role="dialog"
		aria-modal="true"
		onclick={closeLightbox}
	>
		<button
			class="lightbox-close"
			onclick={closeLightbox}
			aria-label="Close"
		>✕</button>

		<button
			class="lightbox-nav prev"
			onclick={(e) => { e.stopPropagation(); prevImage(); }}
			aria-label="Previous"
			disabled={images.length <= 1}
		>‹</button>

		<div
			class="lightbox-content"
			role="presentation"
			onclick={(e) => e.stopPropagation()}
		>
			<img
				src={images[lightboxIndex].url}
				alt="Pottery photo {lightboxIndex + 1}"
			/>
			<div class="lightbox-info">
				<span>{formatDate(images[lightboxIndex].uploaded_at)}</span>
				<span class="counter">{lightboxIndex + 1} / {images.length}</span>
				{#if images[lightboxIndex].notes}
					<span class="notes">{images[lightboxIndex].notes}</span>
				{/if}
			</div>
		</div>

		<button
			class="lightbox-nav next"
			onclick={(e) => { e.stopPropagation(); nextImage(); }}
			aria-label="Next"
			disabled={images.length <= 1}
		>›</button>
	</div>
{/if}

<style>
	.gallery {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1rem;
	}

	.gallery-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.image-wrapper {
		position: relative;
		border-radius: 8px;
		overflow: hidden;
		aspect-ratio: 1;
	}

	.image-btn {
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		display: block;
		width: 100%;
		height: 100%;
	}

	.image-btn img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.2s;
		display: block;
	}

	.image-btn:hover img {
		transform: scale(1.04);
	}

	.delete-btn {
		position: absolute;
		top: 0.4rem;
		right: 0.4rem;
		width: 26px;
		height: 26px;
		border-radius: 50%;
		border: none;
		background: rgba(0, 0, 0, 0.55);
		color: white;
		font-size: 0.75rem;
		line-height: 1;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s, background 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.image-wrapper:hover .delete-btn {
		opacity: 1;
	}

	.delete-btn:hover {
		background: rgba(180, 30, 30, 0.85);
	}

	.image-meta {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		min-height: 2rem;
	}

	.image-date {
		font-size: 0.75rem;
		color: #7a5c4e;
	}

	.image-notes {
		font-size: 0.75rem;
		color: #a08070;
		font-style: italic;
	}

	.confirm-text {
		font-size: 0.75rem;
		color: #7a1010;
		font-weight: 500;
	}

	.confirm-actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.confirm-yes {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		background: #b91c1c;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.confirm-yes:disabled {
		opacity: 0.6;
		cursor: default;
	}

	.confirm-no {
		font-size: 0.75rem;
		padding: 0.2rem 0.5rem;
		background: none;
		border: 1px solid #d4c4b8;
		border-radius: 4px;
		color: #5a4035;
		cursor: pointer;
	}

	/* Lightbox */
	.lightbox-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.9);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.lightbox-close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: rgba(255, 255, 255, 0.15);
		border: none;
		color: white;
		font-size: 1.25rem;
		width: 40px;
		height: 40px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
		transition: background 0.15s;
	}

	.lightbox-close:hover {
		background: rgba(255, 255, 255, 0.25);
	}

	.lightbox-content {
		max-width: 90vw;
		max-height: 90vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
	}

	.lightbox-content img {
		max-width: 100%;
		max-height: 80vh;
		object-fit: contain;
		border-radius: 4px;
	}

	.lightbox-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
	}

	.counter {
		color: rgba(255, 255, 255, 0.5);
	}

	.notes {
		font-style: italic;
	}

	.lightbox-nav {
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		background: rgba(255, 255, 255, 0.15);
		border: none;
		color: white;
		font-size: 2.5rem;
		width: 50px;
		height: 50px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background 0.15s;
		line-height: 1;
	}

	.lightbox-nav:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.25);
	}

	.lightbox-nav:disabled {
		opacity: 0.2;
		cursor: default;
	}

	.prev {
		left: 1rem;
	}

	.next {
		right: 1rem;
	}
</style>
