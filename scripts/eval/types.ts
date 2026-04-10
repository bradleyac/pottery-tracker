// ── Manifest ────────────────────────────────────────────────────────────────

export interface ManifestImage {
	path: string; // relative to dataset dir
	stage?: string | null; // e.g. "greenware", "bisque", "glazed", "fired"
}

export interface ManifestPiece {
	id: string; // slug (folder name)
	name: string; // human-readable
	images: ManifestImage[];
}

export interface Manifest {
	pieces: ManifestPiece[];
}

// ── Preprocessing ───────────────────────────────────────────────────────────

export interface PreprocessingStage {
	name: string;
	process(buffer: Buffer): Promise<Buffer>;
}

export interface PreprocessingPipeline {
	name: string;
	stages: PreprocessingStage[];
}

// ── Embedding ───────────────────────────────────────────────────────────────

export interface Embedder {
	name: string;
	dimensions: number;
	embed(imageBuffer: Buffer): Promise<number[]>;
}

// ── Evaluation results ──────────────────────────────────────────────────────

export interface EmbeddingResult {
	pieceId: string;
	imagePath: string;
	embedding: number[];
}

export interface PipelineMetrics {
	pipelineName: string;
	embedderName: string;
	recallAtK: Record<number, number>;
	mrrAtK: Record<number, number>;
	precisionAtK: Record<number, number>;
	totalQueries: number;
	totalPieces: number;
}

export interface PerPieceMetrics {
	pieceId: string;
	pieceName: string;
	imageCount: number;
	recallAtK: Record<number, number>;
	mrrAtK: Record<number, number>;
}
