<script lang="ts">
	let {
		onfiles,
		disabled = false
	} = $props<{
		onfiles: (files: File[]) => void;
		disabled?: boolean;
	}>();

	let dragging = $state(false);
	let fileInput: HTMLInputElement;

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (disabled) return;
		const files = Array.from(e.dataTransfer?.files ?? []).filter((f) =>
			f.type.startsWith('image/')
		);
		if (files.length > 0) onfiles(files);
	}

	function handleFileInput(e: Event) {
		const target = e.target as HTMLInputElement;
		const files = Array.from(target.files ?? []);
		if (files.length > 0) onfiles(files);
		// Reset so same files can be re-selected
		target.value = '';
	}
</script>

<div
	class="dropzone"
	class:dragging
	class:disabled
	role="button"
	tabindex={disabled ? -1 : 0}
	aria-label="Upload pottery photos"
	ondragover={(e) => { e.preventDefault(); if (!disabled) dragging = true; }}
	ondragleave={() => { dragging = false; }}
	ondrop={handleDrop}
	onclick={() => { if (!disabled) fileInput.click(); }}
	onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); }}
>
	<input
		bind:this={fileInput}
		type="file"
		accept="image/*"
		multiple
		class="hidden-input"
		onchange={handleFileInput}
		{disabled}
	/>

	<div class="dropzone-content">
		<span class="dropzone-icon">📷</span>
		<p class="dropzone-title">Drop photos here</p>
		<p class="dropzone-hint">or click to browse — select one or multiple images</p>
	</div>
</div>

<style>
	.dropzone {
		border: 2px dashed #d4c4b8;
		border-radius: 16px;
		padding: 3rem 2rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.15s;
		background: #faf7f4;
		user-select: none;
	}

	.dropzone:hover:not(.disabled),
	.dropzone.dragging {
		border-color: #c0622c;
		background: #fef5ee;
	}

	.dropzone.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.hidden-input {
		display: none;
	}

	.dropzone-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.dropzone-icon {
		font-size: 3rem;
		display: block;
		margin-bottom: 0.5rem;
	}

	.dropzone-title {
		font-size: 1rem;
		font-weight: 600;
		color: #4a3728;
	}

	.dropzone-hint {
		font-size: 0.8125rem;
		color: #9a7060;
	}
</style>
