<script lang="ts">
	import type { ImageWithUrl } from '$lib/types';
	import { formatDate } from '$lib/utils';

	let { images } = $props<{ images: ImageWithUrl[] }>();

	let lightboxIndex = $state<number | null>(null);

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
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="gallery">
	{#each images as image, i (image.id)}
		<div class="gallery-item">
			<button class="image-btn" onclick={() => openLightbox(i)}>
				<img src={image.url} alt="Pottery photo {i + 1}" loading="lazy" />
			</button>
			<div class="image-meta">
				<span class="image-date">{formatDate(image.uploaded_at)}</span>
				{#if image.notes}
					<span class="image-notes">{image.notes}</span>
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

	.image-btn {
		background: none;
		border: none;
		padding: 0;
		border-radius: 8px;
		overflow: hidden;
		cursor: pointer;
		aspect-ratio: 1;
		display: block;
		width: 100%;
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

	.image-meta {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
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
