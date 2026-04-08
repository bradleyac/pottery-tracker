<script lang="ts">
	import type { PendingBatch, PendingUploadStatus } from '$lib/types';

	let { batch } = $props<{ batch: PendingBatch }>();

	const STATUS_LABELS: Record<PendingUploadStatus, string> = {
		consolidating: 'Grouping related photos…',
		waiting_for_batch: 'Waiting for batch to finish…',
		analyzing: 'Matching against your collection…',
		preprocessing: 'Removing backgrounds…',
		queued: 'Waiting to start…',
		ready: 'Ready',
		failed: 'Failed'
	};

	// Color per stage for the segmented progress bar
	const STATUS_COLORS: Partial<Record<PendingUploadStatus, string>> = {
		queued: '#d4c4b8',
		preprocessing: '#fbbf24',
		analyzing: '#f59e0b',
		waiting_for_batch: '#60a5fa',
		consolidating: '#2dd4bf'
	};

	const IN_PROGRESS_STATUSES: PendingUploadStatus[] = [
		'queued',
		'preprocessing',
		'analyzing',
		'waiting_for_batch',
		'consolidating'
	];

	// Bar segments: one per in-progress status present in the batch
	const segments = $derived(
		IN_PROGRESS_STATUSES.filter((s) => batch.statusCounts[s] !== undefined).map((s) => ({
			status: s,
			count: batch.statusCounts[s]!,
			color: STATUS_COLORS[s] ?? '#d4c4b8'
		}))
	);

	const totalSegments = $derived(segments.reduce((sum, s) => sum + s.count, 0));

	const label = $derived(STATUS_LABELS[batch.worstStatus] ?? 'Processing…');
	const photoWord = $derived(batch.uploadCount === 1 ? 'photo' : 'photos');
</script>

<div class="card">
	<div class="card-body">
		<div class="skeleton-img"></div>
		<div class="text-col">
			<p class="count">{batch.uploadCount} {photoWord} processing</p>
			<p class="status-label">{label}</p>
			{#if segments.length > 0}
				<div class="progress-bar" role="progressbar" aria-label="Processing progress">
					{#each segments as seg (seg.status)}
						<div
							class="progress-segment"
							style="flex: {seg.count}; background: {seg.color};"
						></div>
					{/each}
					{#if totalSegments < batch.uploadCount}
						<div
							class="progress-segment"
							style="flex: {batch.uploadCount - totalSegments}; background: #ede8e0;"
						></div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.card {
		background: white;
		border: 1px solid #ede8e0;
		border-radius: 12px;
		overflow: hidden;
	}

	.card-body {
		display: flex;
		gap: 1rem;
		padding: 1rem;
		align-items: flex-start;
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

	.text-col {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding-top: 0.25rem;
	}

	.count {
		font-size: 0.9375rem;
		font-weight: 600;
		color: #2c1810;
	}

	.status-label {
		font-size: 0.8125rem;
		color: #9a7060;
	}

	.progress-bar {
		display: flex;
		height: 6px;
		border-radius: 3px;
		overflow: hidden;
		gap: 2px;
		margin-top: 0.5rem;
		max-width: 200px;
	}

	.progress-segment {
		border-radius: 3px;
		transition: flex 0.3s ease;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	@media (max-width: 540px) {
		.card-body {
			flex-direction: column;
		}
	}
</style>
