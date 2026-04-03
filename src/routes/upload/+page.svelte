<script lang="ts">
	import { goto } from '$app/navigation';
	import type { ConfirmData } from '$lib/components/MatchConfirmDialog.svelte';
	import MatchConfirmDialog from '$lib/components/MatchConfirmDialog.svelte';
	import UploadDropzone from '$lib/components/UploadDropzone.svelte';
	import type { MatchResultWithPiece, PieceSummary } from '$lib/types';

	type Step =
		| 'idle'
		| 'uploading'
		| 'ai_thinking'
		| 'confirming'
		| 'saving'
		| 'done'
		| 'bulk_uploading';

	let step = $state<Step>('idle');
	let errorMsg = $state<string | null>(null);

	let previewUrl = $state<string | null>(null);
	let matchResult = $state<MatchResultWithPiece | null>(null);
	let allPieces = $state<PieceSummary[]>([]);
	let savedPieceId = $state<string | null>(null);
	let bulkCount = $state(0);

	async function handleFiles(files: File[]) {
		errorMsg = null;

		if (files.length === 1) {
			await handleSingleFile(files[0]);
		} else {
			await handleBulkFiles(files);
		}
	}

	async function resizeImage(file: File): Promise<File> {
		const img = new Image();
		const url = URL.createObjectURL(file);
		await new Promise<void>((resolve, reject) => {
			img.onload = () => resolve();
			img.onerror = () => reject(new Error(`Failed to load ${file.name}`));
			img.src = url;
		});
		URL.revokeObjectURL(url);

		const MAX = 512;
		const scale = Math.min(1, MAX / Math.max(img.width, img.height));
		const w = Math.round(img.width * scale);
		const h = Math.round(img.height * scale);

		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);

		const blob = await new Promise<Blob>((resolve, reject) =>
			canvas.toBlob(
				(b) => (b ? resolve(b) : reject(new Error('Canvas toBlob failed'))),
				'image/jpeg',
				0.82
			)
		);
		const name = file.name.replace(/\.[^.]+$/, '.jpg');
		return new File([blob], name, { type: 'image/jpeg' });
	}

	async function handleSingleFile(file: File) {
		previewUrl = URL.createObjectURL(file);
		step = 'uploading';

		const resized = await resizeImage(file);
		const formData = new FormData();
		formData.append('image', resized);

		let uploadResp: Response;
		try {
			uploadResp = await fetch('/api/upload', { method: 'POST', body: formData });
		} catch {
			errorMsg = 'Network error during upload. Please try again.';
			step = 'idle';
			return;
		}

		if (!uploadResp.ok) {
			const txt = await uploadResp.text().catch(() => '');
			errorMsg = `Upload failed: ${txt || uploadResp.statusText}`;
			step = 'idle';
			return;
		}

		step = 'ai_thinking';
		const data = await uploadResp.json();

		matchResult = {
			matchedPieceId: data.matchedPieceId,
			matchedPieceName: data.matchedPieceName,
			matchedPieceCoverUrl: data.matchedPieceCoverUrl ?? null,
			confidence: data.confidence,
			reasoning: data.reasoning,
			suggestedName: data.suggestedName,
			updatedDescription: data.updatedDescription,
			storagePath: data.tempPath
		};
		allPieces = (data.pieces ?? []).map(
			(p: { id: string; name: string; cover_url?: string | null }) => ({
				id: p.id,
				name: p.name,
				cover_url: p.cover_url ?? null
			})
		);

		step = 'confirming';
	}

	async function handleBulkFiles(files: File[]) {
		bulkCount = files.length;
		step = 'bulk_uploading';

		const resized = await Promise.all(files.map(resizeImage));
		const formData = new FormData();
		for (const file of resized) {
			formData.append('images[]', file);
		}

		let resp: Response;
		try {
			resp = await fetch('/api/bulk-upload', { method: 'POST', body: formData });
		} catch {
			errorMsg = 'Network error during upload. Please try again.';
			step = 'idle';
			return;
		}

		if (!resp.ok) {
			const txt = await resp.text().catch(() => '');
			errorMsg = `Upload failed: ${txt || resp.statusText}`;
			step = 'idle';
			return;
		}

		await goto('/review');
	}

	async function handleConfirm(action: 'accepted' | 'overridden' | 'new_piece', data: ConfirmData) {
		if (!matchResult) return;
		step = 'saving';
		errorMsg = null;

		try {
			let pieceId: string;

			if (action === 'new_piece') {
				const resp = await fetch('/api/pieces', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						tempPath: matchResult.storagePath,
						name: data.newPieceName,
						notes: data.notes,
						updatedDescription: matchResult.updatedDescription
					})
				});
				if (!resp.ok) throw new Error(await resp.text());
				const result = await resp.json();
				pieceId = result.pieceId;
			} else {
				const targetPieceId = action === 'accepted' ? matchResult.matchedPieceId! : data.pieceId!;
				const resp = await fetch(`/api/pieces/${targetPieceId}/images`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						tempPath: matchResult.storagePath,
						notes: data.notes,
						updatedDescription: matchResult.updatedDescription
					})
				});
				if (!resp.ok) throw new Error(await resp.text());
				pieceId = targetPieceId;
			}

			// Log match to piece_matches
			await fetch('/api/matches', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					candidatePath: matchResult.storagePath,
					suggestedPieceId: matchResult.matchedPieceId,
					confidence: matchResult.confidence,
					claudeReasoning: matchResult.reasoning,
					userAction: action,
					finalPieceId: pieceId
				})
			}).catch(() => {}); // Non-blocking

			savedPieceId = pieceId;
			step = 'done';
		} catch (err) {
			errorMsg = err instanceof Error ? err.message : 'Something went wrong saving the photo.';
			step = 'confirming';
		}
	}

	function reset() {
		step = 'idle';
		previewUrl = null;
		matchResult = null;
		errorMsg = null;
		savedPieceId = null;
		bulkCount = 0;
	}
</script>

<svelte:head>
	<title>Upload Photo — Pottery Tracker</title>
</svelte:head>

<div class="upload-page">
	<div class="page-header">
		<h1>Upload Photos</h1>
		<p>Select one photo for instant review, or multiple to analyze in the background</p>
	</div>

	{#if errorMsg}
		<div class="error-banner">{errorMsg}</div>
	{/if}

	{#if step === 'idle'}
		<UploadDropzone onfiles={handleFiles} />
	{:else if step === 'uploading'}
		<div class="status-card">
			<div class="spinner"></div>
			<p>Uploading your photo…</p>
			{#if previewUrl}
				<img src={previewUrl} alt="Preview" class="upload-preview" />
			{/if}
		</div>
	{:else if step === 'ai_thinking'}
		<div class="status-card">
			<div class="spinner"></div>
			<p>Claude is analyzing your piece…</p>
			{#if previewUrl}
				<img src={previewUrl} alt="Preview" class="upload-preview" />
			{/if}
		</div>
	{:else if step === 'bulk_uploading'}
		<div class="status-card">
			<div class="spinner"></div>
			<p>Uploading {bulkCount} photo{bulkCount !== 1 ? 's' : ''}…</p>
			<p class="status-sub">
				Claude will analyze them in the background. You'll be redirected to review.
			</p>
		</div>
	{:else if step === 'confirming' && matchResult && previewUrl}
		<MatchConfirmDialog {previewUrl} {matchResult} pieces={allPieces} onconfirm={handleConfirm} />
	{:else if step === 'saving'}
		<div class="status-card">
			<div class="spinner"></div>
			<p>Saving your photo…</p>
		</div>
	{:else if step === 'done'}
		<div class="done-card">
			<span class="done-icon">✓</span>
			<h2>Photo saved!</h2>
			<div class="done-actions">
				{#if savedPieceId}
					<a href="/pieces/{savedPieceId}" class="btn-primary">View piece</a>
				{/if}
				<a href="/" class="btn-secondary">Back to dashboard</a>
				<button onclick={reset} class="btn-ghost">Upload another</button>
			</div>
		</div>
	{/if}
</div>

<style>
	.upload-page {
		max-width: 640px;
		margin: 0 auto;
	}

	.page-header {
		margin-bottom: 2rem;
	}

	.page-header h1 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #2c1810;
		margin-bottom: 0.25rem;
	}

	.page-header p {
		color: #7a5c4e;
	}

	.error-banner {
		background: #fef2f2;
		border: 1px solid #fecaca;
		color: #991b1b;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
		font-size: 0.875rem;
	}

	.status-card {
		background: white;
		border-radius: 16px;
		padding: 3rem 2rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		border: 1px solid #ede8e0;
	}

	.status-card p {
		color: #5a4035;
		font-size: 1rem;
	}

	.status-sub {
		font-size: 0.875rem !important;
		color: #9a7060 !important;
		max-width: 360px;
	}

	.upload-preview {
		width: 200px;
		height: 200px;
		object-fit: cover;
		border-radius: 8px;
		opacity: 0.7;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #f0ebe4;
		border-top-color: #c0622c;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.done-card {
		background: white;
		border-radius: 16px;
		padding: 3rem 2rem;
		text-align: center;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		border: 1px solid #ede8e0;
	}

	.done-icon {
		width: 60px;
		height: 60px;
		background: #f0fdf4;
		border: 2px solid #86efac;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 1.5rem;
		color: #166534;
		margin: 0 auto;
	}

	.done-card h2 {
		font-size: 1.5rem;
		color: #2c1810;
	}

	.done-actions {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		width: 100%;
		max-width: 280px;
	}

	.btn-primary {
		display: block;
		width: 100%;
		padding: 0.75rem;
		background: #c0622c;
		color: white;
		border: none;
		border-radius: 8px;
		font-size: 0.9375rem;
		font-weight: 600;
		text-align: center;
		transition: background 0.15s;
	}

	.btn-primary:hover {
		background: #a8521f;
	}

	.btn-secondary {
		display: block;
		width: 100%;
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

	.btn-ghost {
		background: none;
		border: none;
		color: #9a7060;
		font-size: 0.875rem;
	}

	.btn-ghost:hover {
		color: #4a3728;
	}
</style>
