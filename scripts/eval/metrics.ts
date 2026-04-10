import type { EmbeddingResult, PipelineMetrics, PerPieceMetrics, Manifest } from './types.ts';

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0;
	let normA = 0;
	let normB = 0;
	for (let i = 0; i < a.length; i++) {
		dot += a[i] * b[i];
		normA += a[i] * a[i];
		normB += b[i] * b[i];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface RankedResult {
	queryPieceId: string;
	queryImagePath: string;
	// Ordered list of (pieceId, similarity) for all other images
	ranked: Array<{ pieceId: string; imagePath: string; similarity: number }>;
	// How many same-piece images exist (excluding the query itself)
	samePieceCount: number;
}

function rankAll(embeddings: EmbeddingResult[]): RankedResult[] {
	const results: RankedResult[] = [];

	for (let i = 0; i < embeddings.length; i++) {
		const query = embeddings[i];
		const samePieceCount = embeddings.filter(
			(e, j) => j !== i && e.pieceId === query.pieceId
		).length;

		// Skip images that are the only one for their piece — nothing to retrieve
		if (samePieceCount === 0) continue;

		const scored: RankedResult['ranked'] = [];
		for (let j = 0; j < embeddings.length; j++) {
			if (i === j) continue;
			scored.push({
				pieceId: embeddings[j].pieceId,
				imagePath: embeddings[j].imagePath,
				similarity: cosineSimilarity(query.embedding, embeddings[j].embedding)
			});
		}
		scored.sort((a, b) => b.similarity - a.similarity);

		results.push({
			queryPieceId: query.pieceId,
			queryImagePath: query.imagePath,
			ranked: scored,
			samePieceCount
		});
	}

	return results;
}

export function computeMetrics(
	embeddings: EmbeddingResult[],
	manifest: Manifest,
	topKValues: number[],
	pipelineName: string,
	embedderName: string
): { aggregate: PipelineMetrics; perPiece: PerPieceMetrics[] } {
	const rankings = rankAll(embeddings);

	if (rankings.length === 0) {
		const empty = Object.fromEntries(topKValues.map((k) => [k, 0]));
		return {
			aggregate: {
				pipelineName,
				embedderName,
				recallAtK: { ...empty },
				mrrAtK: { ...empty },
				precisionAtK: { ...empty },
				totalQueries: 0,
				totalPieces: manifest.pieces.length
			},
			perPiece: []
		};
	}

	// Aggregate metrics
	const recallAtK: Record<number, number> = {};
	const mrrAtK: Record<number, number> = {};
	const precisionAtK: Record<number, number> = {};

	for (const k of topKValues) {
		let totalRecall = 0;
		let totalMrr = 0;
		let totalPrecision = 0;

		for (const r of rankings) {
			const topK = r.ranked.slice(0, k);
			const hits = topK.filter((x) => x.pieceId === r.queryPieceId).length;

			// Recall: fraction of same-piece images found in top-k
			totalRecall += hits / r.samePieceCount;

			// Precision: fraction of top-k that are same-piece
			totalPrecision += hits / k;

			// MRR: reciprocal rank of first correct match (within top-k)
			const firstCorrectIdx = topK.findIndex((x) => x.pieceId === r.queryPieceId);
			totalMrr += firstCorrectIdx >= 0 ? 1 / (firstCorrectIdx + 1) : 0;
		}

		recallAtK[k] = totalRecall / rankings.length;
		mrrAtK[k] = totalMrr / rankings.length;
		precisionAtK[k] = totalPrecision / rankings.length;
	}

	// Per-piece breakdown
	const pieceMap = new Map<string, RankedResult[]>();
	for (const r of rankings) {
		const list = pieceMap.get(r.queryPieceId) ?? [];
		list.push(r);
		pieceMap.set(r.queryPieceId, list);
	}

	const perPiece: PerPieceMetrics[] = [];
	for (const piece of manifest.pieces) {
		const pieceRankings = pieceMap.get(piece.id);
		if (!pieceRankings || pieceRankings.length === 0) continue;

		const pieceRecall: Record<number, number> = {};
		const pieceMrr: Record<number, number> = {};

		for (const k of topKValues) {
			let recall = 0;
			let mrr = 0;
			for (const r of pieceRankings) {
				const topK = r.ranked.slice(0, k);
				const hits = topK.filter((x) => x.pieceId === r.queryPieceId).length;
				recall += hits / r.samePieceCount;
				const firstCorrectIdx = topK.findIndex((x) => x.pieceId === r.queryPieceId);
				mrr += firstCorrectIdx >= 0 ? 1 / (firstCorrectIdx + 1) : 0;
			}
			pieceRecall[k] = recall / pieceRankings.length;
			pieceMrr[k] = mrr / pieceRankings.length;
		}

		perPiece.push({
			pieceId: piece.id,
			pieceName: piece.name,
			imageCount: piece.images.length,
			recallAtK: pieceRecall,
			mrrAtK: pieceMrr
		});
	}

	// Sort per-piece by worst recall at the largest k (hardest pieces first)
	const maxK = Math.max(...topKValues);
	perPiece.sort((a, b) => (a.recallAtK[maxK] ?? 0) - (b.recallAtK[maxK] ?? 0));

	return {
		aggregate: {
			pipelineName,
			embedderName,
			recallAtK,
			mrrAtK,
			precisionAtK,
			totalQueries: rankings.length,
			totalPieces: manifest.pieces.length
		},
		perPiece
	};
}
