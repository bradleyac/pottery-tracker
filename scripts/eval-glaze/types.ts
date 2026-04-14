// ── Dataset ──────────────────────────────────────────────────────────────────

export interface ManifestPair {
	id: string;
	piece: string; // path relative to dataset dir
	glazeRef: string; // path relative to dataset dir
	notes?: string;
}

export interface Manifest {
	pairs: ManifestPair[];
}

// ── Pipeline configs ──────────────────────────────────────────────────────────

/** A named prompt variant for the flux-2-dev generation call. */
export interface PromptConfig {
	name: string;
	prompt: string;
}

export interface ReplicateModelConfig {
	name: string;
	/** e.g. 'black-forest-labs/flux-2-dev' */
	model: string;
	/**
	 * Build the Replicate prediction input.
	 * @param pieceBase64    - Base64 JPEG of the unglazed piece
	 * @param glazeRefBase64 - Base64 JPEG of the glaze reference image
	 * @param prompt         - The prompt text to use for this run
	 */
	buildInput(
		pieceBase64: string,
		glazeRefBase64: string,
		prompt: string
	): Record<string, unknown>;
}

// ── Results ──────────────────────────────────────────────────────────────────

export interface EvalResult {
	pairId: string;
	promptConfig: string;
	replicateConfig: string;
	outputImagePath: string;
	durationMs: number;
	error?: string;
}
