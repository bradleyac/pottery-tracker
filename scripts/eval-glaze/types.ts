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

export interface GeminiPromptConfig {
	name: string;
	systemInstruction?: string;
	userPrompt: string;
}

export interface ReplicateModelConfig {
	name: string;
	/** e.g. 'black-forest-labs/flux-kontext-pro' */
	model: string;
	buildInput(pieceBase64: string, glazeDescription: string): Record<string, unknown>;
}

// ── Results ──────────────────────────────────────────────────────────────────

export interface EvalResult {
	pairId: string;
	geminiConfig: string;
	replicateConfig: string;
	glazeDescription: string;
	outputImagePath: string;
	durationMs: number;
	error?: string;
}
