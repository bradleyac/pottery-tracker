#!/usr/bin/env node
/**
 * Embedding evaluation harness — compare preprocessing pipelines and embedding
 * models for pottery image retrieval.
 *
 * Usage:
 *   # Generate manifest from extracted pieces
 *   node --env-file=.env.local --import tsx scripts/eval/evaluate.ts --init --dataset eval/dataset
 *
 *   # Run evaluation
 *   node --env-file=.env.local --import tsx scripts/eval/evaluate.ts --dataset eval/dataset
 *
 *   # Test specific pipelines
 *   node --env-file=.env.local --import tsx scripts/eval/evaluate.ts \
 *     --dataset eval/dataset --pipelines baseline,grayscale,gray-clahe
 *
 * Options:
 *   --dataset <dir>       Dataset directory (default: ./eval/dataset)
 *   --cache <dir>         Cache directory (default: ./scripts/eval/.cache)
 *   --pipelines <names>   Comma-separated pipeline names (default: all)
 *   --embedders <names>   Comma-separated embedder names (default: gemini-768d)
 *   --top-k <values>      Comma-separated k values (default: 1,3,5,8)
 *   --json                Write JSON report to scripts/eval/results/
 *   --init                Generate manifest.json and exit
 *   --verbose             Show per-piece breakdown for each config
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import type { Manifest, EmbeddingResult, PipelineMetrics, PerPieceMetrics } from './types.ts';
import { EmbeddingCache } from './cache.ts';
import { DEFAULT_PIPELINES, buildPipeline, runPipeline } from './preprocessing.ts';
import { createGeminiEmbedder, getDefaultEmbedders } from './embedders.ts';
import { computeMetrics } from './metrics.ts';
import { printComparisonTable, printPerPieceTable, writeJsonReport } from './report.ts';
import { writeManifest } from './init-manifest.ts';

// ── CLI parsing ─────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
	options: {
		dataset: { type: 'string', default: './eval/dataset' },
		cache: { type: 'string', default: './scripts/eval/.cache' },
		pipelines: { type: 'string' },
		embedders: { type: 'string' },
		'top-k': { type: 'string', default: '1,3,5,8' },
		json: { type: 'boolean', default: false },
		init: { type: 'boolean', default: false },
		verbose: { type: 'boolean', default: false }
	},
	strict: true
});

const datasetDir = args.dataset!;

// ── Init mode ───────────────────────────────────────────────────────────────

if (args.init) {
	await writeManifest(datasetDir);
	process.exit(0);
}

// ── Load manifest ───────────────────────────────────────────────────────────

const manifestPath = join(datasetDir, 'manifest.json');
let manifest: Manifest;
try {
	manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
} catch {
	console.error(`Could not read ${manifestPath}`);
	console.error('Run with --init first to generate the manifest.');
	process.exit(1);
}

const totalImages = manifest.pieces.reduce((sum, p) => sum + p.images.length, 0);
const evalPieces = manifest.pieces.filter((p) => p.images.length >= 2);
const evalImages = evalPieces.reduce((sum, p) => sum + p.images.length, 0);

console.log(`Dataset: ${manifest.pieces.length} pieces, ${totalImages} images`);
console.log(`Evaluable: ${evalPieces.length} pieces with 2+ images (${evalImages} images)`);

if (evalPieces.length === 0) {
	console.error('No pieces with 2+ images — nothing to evaluate.');
	process.exit(1);
}

// ── Resolve pipelines ───────────────────────────────────────────────────────

let pipelines = DEFAULT_PIPELINES;
if (args.pipelines) {
	const names = args.pipelines.split(',').map((s) => s.trim());
	const pipelineMap = new Map(DEFAULT_PIPELINES.map((p) => [p.name, p]));
	pipelines = names.map((name) => {
		const p = pipelineMap.get(name);
		if (!p) {
			console.error(`Unknown pipeline: "${name}". Available: ${DEFAULT_PIPELINES.map((p) => p.name).join(', ')}`);
			process.exit(1);
		}
		return p;
	});
}

// ── Resolve embedders ───────────────────────────────────────────────────────

let embedders = getDefaultEmbedders();
if (args.embedders) {
	const names = args.embedders.split(',').map((s) => s.trim());
	embedders = names.map((name) => {
		const match = name.match(/^gemini-(\d+)d$/);
		if (match) return createGeminiEmbedder(parseInt(match[1], 10));
		console.error(`Unknown embedder: "${name}". Format: gemini-<dims>d (e.g. gemini-768d)`);
		process.exit(1);
	});
}

const topKValues = args['top-k']!.split(',').map((s) => parseInt(s.trim(), 10));
const cache = new EmbeddingCache(args.cache!);

// ── Evaluation loop ─────────────────────────────────────────────────────────

const allMetrics: PipelineMetrics[] = [];
const allPerPiece = new Map<string, PerPieceMetrics[]>();
const totalConfigs = pipelines.length * embedders.length;
let configIdx = 0;

for (const pipeline of pipelines) {
	for (const embedder of embedders) {
		configIdx++;
		const configKey = `${pipeline.name}:${embedder.name}`;
		console.log(`\n[${configIdx}/${totalConfigs}] ${pipeline.name} + ${embedder.name}`);

		const embeddings: EmbeddingResult[] = [];
		let cached = 0;
		let computed = 0;
		let failed = 0;

		for (const piece of manifest.pieces) {
			for (const image of piece.images) {
				const imagePath = join(datasetDir, image.path);
				try {
					const rawBuffer = await readFile(imagePath);
					const preprocessed = await runPipeline(pipeline, rawBuffer);

					let embedding = await cache.get(preprocessed, embedder.name);
					if (embedding) {
						cached++;
					} else {
						embedding = await embedder.embed(preprocessed);
						await cache.set(preprocessed, embedder.name, embedding);
						computed++;

						// Rate limit: 200ms between API calls
						if (computed > 0) {
							await new Promise((resolve) => setTimeout(resolve, 200));
						}
					}

					embeddings.push({ pieceId: piece.id, imagePath: image.path, embedding });
				} catch (err) {
					failed++;
					console.error(`  FAILED ${image.path}: ${(err as Error).message}`);
				}
			}
		}

		console.log(
			`  Embedded ${embeddings.length} images (${cached} cached, ${computed} computed${failed > 0 ? `, ${failed} failed` : ''})`
		);

		const { aggregate, perPiece } = computeMetrics(
			embeddings,
			manifest,
			topKValues,
			pipeline.name,
			embedder.name
		);

		allMetrics.push(aggregate);
		allPerPiece.set(configKey, perPiece);

		if (args.verbose) {
			printPerPieceTable(perPiece, topKValues, pipeline.name, embedder.name);
		}
	}
}

// ── Output ──────────────────────────────────────────────────────────────────

printComparisonTable(allMetrics, topKValues, totalImages);

if (args.json) {
	const reportPath = await writeJsonReport(
		allMetrics,
		allPerPiece,
		'./scripts/eval/results'
	);
	console.log(`JSON report written to ${reportPath}`);
}
