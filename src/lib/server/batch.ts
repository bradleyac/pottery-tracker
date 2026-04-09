import { randomUUID } from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { env } from '$env/dynamic/private';
import { createServiceRoleClient } from './supabase';
import { downloadImage } from './storage';
import { resizeForApi } from './claude';

const GEMINI_MODEL = 'gemini-2.5-flash';
const SIMILARITY_THRESHOLD = 0.82;

function getClient() {
	return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
}

function parseEmbedding(raw: unknown): number[] {
	if (Array.isArray(raw)) return raw as number[];
	if (typeof raw === 'string') return JSON.parse(raw) as number[];
	throw new Error('Unexpected embedding format');
}

function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0,
		normA = 0,
		normB = 0;
	for (let k = 0; k < a.length; k++) {
		dot += a[k] * b[k];
		normA += a[k] * a[k];
		normB += b[k] * b[k];
	}
	return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function confirmSamePiece(pathA: string, pathB: string): Promise<boolean> {
	const [bufA, bufB] = await Promise.all([downloadImage(pathA), downloadImage(pathB)]);
	const [{ data: b64A }, { data: b64B }] = await Promise.all([
		resizeForApi(bufA),
		resizeForApi(bufB)
	]);

	const response = await getClient().models.generateContent({
		model: GEMINI_MODEL,
		config: { responseMimeType: 'application/json' },
		contents: [
			{
				role: 'user',
				parts: [
					{ inlineData: { mimeType: 'image/jpeg', data: b64A } },
					{ inlineData: { mimeType: 'image/jpeg', data: b64B } },
					{
						text: 'Are these two photos showing the same physical pottery piece, or two different pieces? Return JSON: {"same_piece": true}'
					}
				]
			}
		]
	});

	try {
		const parsed = JSON.parse(response.text ?? '{}');
		return parsed.same_piece === true;
	} catch {
		return false;
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markBatchConsolidated(supabase: any, batchId: string) {
	// Set consolidating/waiting_for_batch uploads to ready (not failed ones).
	// The tick is responsible for stamping consolidated_at on pending_batches.
	await supabase
		.from('pending_uploads')
		.update({ status: 'ready' })
		.eq('batch_id', batchId)
		.in('status', ['consolidating', 'waiting_for_batch']);
}

type BatchUpload = {
	id: string;
	temp_storage_path: string;
	matched_piece_id: string | null;
	embedding: number[];
};

export async function consolidateBatch(batchId: string): Promise<void> {
	const supabase = createServiceRoleClient();

	const { data: rows, error } = await supabase
		.from('pending_uploads')
		.select('id, temp_storage_path, matched_piece_id, embedding')
		.eq('batch_id', batchId)
		.in('status', ['consolidating', 'waiting_for_batch', 'ready'])
		.not('embedding', 'is', null);

	if (error) throw new Error(`Failed to fetch batch uploads: ${error.message}`);
	if (!rows || rows.length < 2) return;

	const uploads: BatchUpload[] = rows.map((r) => ({
		id: r.id,
		temp_storage_path: r.temp_storage_path,
		matched_piece_id: r.matched_piece_id ?? null,
		embedding: parseEmbedding(r.embedding)
	}));

	// Find candidate pairs above embedding similarity threshold
	const candidatePairs: [number, number][] = [];
	for (let i = 0; i < uploads.length; i++) {
		for (let j = i + 1; j < uploads.length; j++) {
			const sim = cosineSimilarity(uploads[i].embedding, uploads[j].embedding);
			if (sim >= SIMILARITY_THRESHOLD) candidatePairs.push([i, j]);
		}
	}

	if (candidatePairs.length === 0) {
		await markBatchConsolidated(supabase, batchId);
		return;
	}

	console.log(`[consolidateBatch] ${candidatePairs.length} candidate pair(s) for batch ${batchId}`);

	// Gemini confirms each candidate pair — processed sequentially to stay within rate limits
	const confirmedEdges: [string, string][] = [];
	for (const [i, j] of candidatePairs) {
		try {
			const same = await confirmSamePiece(
				uploads[i].temp_storage_path,
				uploads[j].temp_storage_path
			);
			if (same) confirmedEdges.push([uploads[i].id, uploads[j].id]);
		} catch (err) {
			console.warn(`[consolidateBatch] edge confirmation failed (non-fatal):`, err);
		}
	}

	if (confirmedEdges.length === 0) {
		await markBatchConsolidated(supabase, batchId);
		return;
	}

	// Union-Find over confirmed edges
	const parent = new Map(uploads.map((u) => [u.id, u.id]));

	function find(id: string): string {
		const p = parent.get(id)!;
		if (p !== id) parent.set(id, find(p));
		return parent.get(id)!;
	}

	for (const [a, b] of confirmedEdges) {
		parent.set(find(a), find(b));
	}

	// Group into clusters, skip singletons
	const clusterMap = new Map<string, BatchUpload[]>();
	for (const upload of uploads) {
		const root = find(upload.id);
		if (!clusterMap.has(root)) clusterMap.set(root, []);
		clusterMap.get(root)!.push(upload);
	}

	for (const members of clusterMap.values()) {
		if (members.length < 2) continue;

		const batchGroupId = randomUUID();
		const memberIds = members.map((m) => m.id);

		// Assign batch_group_id to all members
		await supabase
			.from('pending_uploads')
			.update({ batch_group_id: batchGroupId })
			.in('id', memberIds);

		// Anchor resolution: if exactly one piece is matched in the cluster,
		// propagate it to unmatched members
		const anchors = [...new Set(members.map((m) => m.matched_piece_id).filter(Boolean))];
		if (anchors.length === 1) {
			const unmatchedIds = members.filter((m) => !m.matched_piece_id).map((m) => m.id);
			if (unmatchedIds.length > 0) {
				await supabase
					.from('pending_uploads')
					.update({ matched_piece_id: anchors[0] })
					.in('id', unmatchedIds);
			}
		}
		// If anchors.length > 1: conflicting anchors — leave as-is, user resolves in UI

		console.log(
			`[consolidateBatch] group ${batchGroupId}: ${members.length} members, anchors: ${anchors.length}`
		);
	}

	await markBatchConsolidated(supabase, batchId);
}
