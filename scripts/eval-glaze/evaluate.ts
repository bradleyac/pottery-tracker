#!/usr/bin/env node
/**
 * Glaze preview eval harness — compare prompt variants for flux-2-dev
 * glaze-transfer image generation.
 *
 * Usage:
 *   # Validate dataset and exit
 *   node --env-file=.env.local --import tsx scripts/eval-glaze/evaluate.ts --init
 *
 *   # Run all prompt configs
 *   node --env-file=.env.local --import tsx scripts/eval-glaze/evaluate.ts
 *
 *   # Test specific prompts
 *   node --env-file=.env.local --import tsx scripts/eval-glaze/evaluate.ts \
 *     --prompts v1-simple,v3-stages
 *
 * Options:
 *   --dataset <dir>    Dataset directory containing manifest.json (default: ./scripts/eval-glaze/dataset)
 *   --cache <dir>      Cache directory (default: ./scripts/eval-glaze/.cache)
 *   --output <dir>     Output directory for generated images (default: ./scripts/eval-glaze/results)
 *   --prompts <names>  Comma-separated prompt config names to test (default: all)
 *   --init             Validate manifest paths and print dataset summary, then exit
 *
 * Output per pair:
 *   _piece.jpg               original unglazed piece
 *   _glaze-ref.jpg           original glaze reference
 *   {prompt-name}.jpg        generated preview for each prompt variant
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import sharp from 'sharp';
import type { Manifest } from './types.ts';
import { GlazeImageCache } from './cache.ts';
import { getPrompts } from './prompts.ts';
import { REPLICATE_MODELS, runReplicatePrediction } from './replicate-models.ts';

// ── CLI ───────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
	options: {
		dataset: { type: 'string', default: './scripts/eval-glaze/dataset' },
		cache:   { type: 'string', default: './scripts/eval-glaze/.cache' },
		output:  { type: 'string', default: './scripts/eval-glaze/results' },
		prompts: { type: 'string' },
		init:    { type: 'boolean', default: false }
	},
	strict: true
});

const datasetDir = args.dataset!;
const cacheDir   = args.cache!;
const outputDir  = args.output!;

// ── Check env ─────────────────────────────────────────────────────────────────

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
if (!REPLICATE_API_TOKEN) {
	console.error('REPLICATE_API_TOKEN is required');
	process.exit(1);
}

// ── Load manifest ─────────────────────────────────────────────────────────────

const manifestPath = join(datasetDir, 'manifest.json');
let manifest: Manifest;
try {
	manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
} catch {
	console.error(`Could not read ${manifestPath}`);
	console.error('Create a manifest.json in the dataset directory. See evaluate.ts for the schema.');
	process.exit(1);
}

if (!Array.isArray(manifest.pairs) || manifest.pairs.length === 0) {
	console.error('manifest.json must have a non-empty "pairs" array.');
	process.exit(1);
}

// ── Init mode: validate + print summary ──────────────────────────────────────

if (args.init) {
	console.log(`Dataset: ${manifest.pairs.length} pairs`);
	let ok = 0;
	let missing = 0;
	for (const pair of manifest.pairs) {
		const piecePath = join(datasetDir, pair.piece);
		const glazePath = join(datasetDir, pair.glazeRef);
		let valid = true;
		try { await readFile(piecePath); } catch { console.error(`  MISSING piece: ${piecePath}`); valid = false; }
		try { await readFile(glazePath); } catch { console.error(`  MISSING glazeRef: ${glazePath}`); valid = false; }
		if (valid) { ok++; console.log(`  ✓ ${pair.id}${pair.notes ? ` — ${pair.notes}` : ''}`); }
		else missing++;
	}
	console.log(`\n${ok} valid, ${missing} with missing files.`);
	process.exit(missing > 0 ? 1 : 0);
}

// ── Resolve configs ───────────────────────────────────────────────────────────

const promptConfigs = getPrompts(args.prompts?.split(',').map((s) => s.trim()));
// Only one model (flux-2-dev); the model list is still resolved so adding more later is easy.
const modelConfig = REPLICATE_MODELS[0];

console.log(`\nGlaze preview eval`);
console.log(`  Model:   ${modelConfig.model}`);
console.log(`  Prompts: ${promptConfigs.map((p) => p.name).join(', ')}`);
console.log(`  Pairs:   ${manifest.pairs.length}`);
console.log(`  Total:   ${manifest.pairs.length * promptConfigs.length} runs\n`);

// ── Cache + run timestamp ─────────────────────────────────────────────────────

const imgCache = new GlazeImageCache(cacheDir);
const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── Evaluation loop ───────────────────────────────────────────────────────────

let succeeded = 0;
let failed = 0;
let imgCached = 0;
let imgComputed = 0;

for (const pair of manifest.pairs) {
	const piecePath = join(datasetDir, pair.piece);
	const glazePath = join(datasetDir, pair.glazeRef);

	let pieceBuffer: Buffer;
	let glazeBuffer: Buffer;
	try {
		[pieceBuffer, glazeBuffer] = await Promise.all([readFile(piecePath), readFile(glazePath)]);
	} catch (err) {
		console.error(`  [${pair.id}] SKIP — cannot read images: ${(err as Error).message}`);
		failed += promptConfigs.length;
		continue;
	}

	// Resize both images for Replicate (1024px max, auto-orient)
	const [pieceResized, glazeResized] = await Promise.all([
		sharp(pieceBuffer)
			.rotate()
			.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 82 })
			.toBuffer(),
		sharp(glazeBuffer)
			.rotate()
			.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
			.jpeg({ quality: 82 })
			.toBuffer()
	]);
	const pieceBase64 = pieceResized.toString('base64');
	const glazeBase64 = glazeResized.toString('base64');

	const pairOutputDir = join(outputDir, runId, pair.id);
	await mkdir(pairOutputDir, { recursive: true });

	// Copy originals for side-by-side comparison
	await Promise.all([
		copyFile(piecePath, join(pairOutputDir, '_piece.jpg')).catch(() => {}),
		copyFile(glazePath, join(pairOutputDir, '_glaze-ref.jpg')).catch(() => {})
	]);

	for (const promptConfig of promptConfigs) {
		const t0 = Date.now();

		let generatedBuffer: Buffer | null = await imgCache.get(
			pieceResized,
			glazeResized,
			promptConfig.prompt,
			modelConfig.name
		);

		if (generatedBuffer) {
			imgCached++;
		} else {
			try {
				generatedBuffer = await runReplicatePrediction(
					modelConfig,
					pieceBase64,
					glazeBase64,
					promptConfig.prompt,
					REPLICATE_API_TOKEN!
				);
				await imgCache.set(pieceResized, glazeResized, promptConfig.prompt, modelConfig.name, generatedBuffer);
				imgComputed++;
			} catch (err) {
				const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
				console.log(
					`  [${pair.id}] ${promptConfig.name} | FAILED ${elapsed}s — ${(err as Error).message.slice(0, 100)}`
				);
				failed++;
				continue;
			}
		}

		await writeFile(join(pairOutputDir, `${promptConfig.name}.jpg`), generatedBuffer);
		const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
		const note = generatedBuffer && imgCached > 0 && imgComputed === 0 ? ' (cached)' : '';
		console.log(`  [${pair.id}] ${promptConfig.name} | ✓ ${elapsed}s${note}`);
		succeeded++;
	}
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nDone.`);
console.log(`  Images: ${imgCached} cached, ${imgComputed} computed`);
console.log(`  Results: ${succeeded} succeeded, ${failed} failed`);
if (succeeded > 0) {
	console.log(`\nOutput: ${join(outputDir, runId)}/`);
}
