<script lang="ts">
	import type { PageData } from './$types';
	import { invalidate } from '$app/navigation';
	import PendingUploadCard from '$lib/components/PendingUploadCard.svelte';
	import type { CardDecision } from '$lib/components/PendingUploadCard.svelte';
	import type { PendingUploadWithUrls } from '$lib/types';

	let { data } = $props<{ data: PageData }>();

	// Local decisions per upload id
	let decisions = $state<Map<string, CardDecision>>(new Map());

	// Derive visible uploads (not dismissed/saved)
	const uploads = $derived(data.pendingUploads);
	const hasQueued = $derived(uploads.some((u: PendingUploadWithUrls) => u.status === 'queued'));

	// Auto-poll every 5s while items are queued
	$effect(() => {
		if (!hasQueued) return;
		const timer = setInterval(() => invalidate('app:review'), 5000);
		return () => clearInterval(timer);
	});

	function getDecision(id: string): CardDecision {
		return decisions.get(id) ?? { mode: 'review' };
	}

	function setDecision(id: string, d: CardDecision) {
		const next = new Map(decisions);
		next.set(id, d);
		decisions = next;
	}

	async function handleConfirm(
		upload: PendingUploadWithUrls,
		action: 'accepted' | 'overridden' | 'new_piece',
		notes: string,
		pieceId?: string,
		newPieceName?: string
	) {
		try {
			const resp = await fetch(`/api/pending-uploads/${upload.id}/confirm`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action, pieceId, newPieceName, notes })
			});
			if (!resp.ok) {
				const txt = await resp.text().catch(() => '');
				setDecision(upload.id, { mode: 'error', message: txt || 'Failed to save' });
				return;
			}
			const { pieceId: savedPieceId } = await resp.json();
			setDecision(upload.id, { mode: 'saved', pieceId: savedPieceId });
			// Refresh layout badge count
			await invalidate('app:review');
		} catch {
			setDecision(upload.id, { mode: 'error', message: 'Network error. Please try again.' });
		}
	}

	async function handleDismiss(upload: PendingUploadWithUrls) {
		try {
			await fetch(`/api/pending-uploads/${upload.id}`, { method: 'DELETE' });
			setDecision(upload.id, { mode: 'dismissed' });
			await invalidate('app:review');
		} catch {
			// Ignore dismiss errors
		}
	}

	const visibleUploads = $derived(
		uploads.filter((u: PendingUploadWithUrls) => {
			const d = getDecision(u.id);
			return d.mode !== 'dismissed';
		})
	);

	const pendingCount = $derived(
		visibleUploads.filter((u: PendingUploadWithUrls) => {
			const d = getDecision(u.id);
			return d.mode === 'review' && u.status === 'ready';
		}).length
	);
</script>

<svelte:head>
	<title>Review Photos — Pottery Tracker</title>
</svelte:head>

<div class="review-page">
	<div class="page-header">
		<div class="header-left">
			<h1>Review Photos</h1>
			{#if pendingCount > 0}
				<span class="count-badge">{pendingCount} awaiting review</span>
			{/if}
		</div>
		<a href="/upload" class="btn-upload">+ Upload more</a>
	</div>

	{#if visibleUploads.length === 0}
		<div class="empty-state">
			<span class="empty-icon">✓</span>
			<h2>All caught up!</h2>
			<p>No photos waiting for review.</p>
			<div class="empty-actions">
				<a href="/upload" class="btn-primary">Upload a photo</a>
				<a href="/" class="btn-secondary">Back to dashboard</a>
			</div>
		</div>
	{:else}
		<div class="cards-list">
			{#each visibleUploads as upload (upload.id)}
				<PendingUploadCard
					{upload}
					pieces={data.pieces}
					decision={getDecision(upload.id)}
					onDecisionChange={(d) => setDecision(upload.id, d)}
					onConfirm={(action, notes, pid, name) => handleConfirm(upload, action, notes, pid, name)}
					onDismiss={() => handleDismiss(upload)}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.review-page {
		max-width: 760px;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
		gap: 1rem;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.page-header h1 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #2c1810;
	}

	.count-badge {
		background: #fef3c7;
		border: 1px solid #fcd34d;
		color: #92400e;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 20px;
		padding: 0.2rem 0.625rem;
	}

	.btn-upload {
		padding: 0.5rem 1rem;
		background: #c0622c;
		color: white;
		border-radius: 8px;
		font-size: 0.875rem;
		font-weight: 600;
		white-space: nowrap;
		transition: background 0.15s;
	}

	.btn-upload:hover { background: #a8521f; }

	.cards-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty-state {
		background: white;
		border-radius: 16px;
		padding: 3rem 2rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		border: 1px solid #ede8e0;
	}

	.empty-icon {
		width: 56px;
		height: 56px;
		background: #f0fdf4;
		border: 2px solid #86efac;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		color: #166534;
	}

	.empty-state h2 {
		font-size: 1.375rem;
		color: #2c1810;
	}

	.empty-state p {
		color: #7a5c4e;
	}

	.empty-actions {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
		width: 100%;
		max-width: 240px;
	}

	.btn-primary {
		display: block;
		padding: 0.75rem;
		background: #c0622c;
		color: white;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 600;
		text-align: center;
		transition: background 0.15s;
	}

	.btn-primary:hover { background: #a8521f; }

	.btn-secondary {
		display: block;
		padding: 0.75rem;
		background: white;
		color: #4a3728;
		border: 1.5px solid #d4c4b8;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 500;
		text-align: center;
		transition: all 0.15s;
	}

	.btn-secondary:hover {
		border-color: #c0622c;
		color: #c0622c;
	}
</style>
