#!/usr/bin/env node
/**
 * Glaze preview eval harness — compare Gemini prompt variants and Replicate models
 * for generating glazed-piece preview images.
 *
 * Usage:
 *   # Validate dataset and exit
 *   node --env-file=.env.local --import tsx scripts/eval-glaze/evaluate.ts \
 *     --dataset eval/glaze-dataset --init
 *
 *   # Run all configs
 *   node --env-file=.env.local --import tsx scripts/eval-glaze/evaluate.ts \
 *     --dataset eval/glaze-dataset
 *
 *   # Test specific configs
 *   node --env-file=.env.local --import tsx scripts/eval-glaze/evaluate.ts \
 *     --dataset eval/glaze-dataset \
 *     --gemini v2-detailed \
 *     --models flux-kontext-pro
 *
 * Options:
 *   --dataset <dir>    Dataset directory containing manifest.json (default: ./scripts/eval-glaze/dataset)
 *   --cache <dir>      Cache directory (default: ./scripts/eval-glaze/.cache)
 *   --output <dir>     Output directory for generated images (default: ./scripts/eval-glaze/results)
 *   --gemini <names>   Comma-separated Gemini prompt config names (default: all)
 *   --models <names>   Comma-separated Replicate model config names (default: all)
 *   --init             Validate manifest paths and print dataset summary, then exit
 */

import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';
import type { Manifest } from './types.ts';
import { GlazeDescriptionCache, GlazeImageCache } from './cache.ts';
import { GEMINI_PROMPTS, getGeminiPrompts, serializeStructuredDescription } from './gemini-prompts.ts';
import { REPLICATE_MODELS, getReplicateModels, runReplicatePrediction } from './replicate-models.ts';

// ── CLI ───────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
	options: {
		dataset: { type: 'string', default: './scripts/eval-glaze/dataset' },
		cache: { type: 'string', default: './scripts/eval-glaze/.cache' },
		output: { type: 'string', default: './scripts/eval-glaze/results' },
		gemini: { type: 'string' },
		models: { type: 'string' },
		init: { type: 'boolean', default: false }
	},
	strict: true
});

const datasetDir = args.dataset!;
const cacheDir = args.cache!;
const outputDir = args.output!;

// ── Check env ─────────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;

if (!GEMINI_API_KEY) {
	console.error('GEMINI_API_KEY is required');
	process.exit(1);
}
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
	console.error(
		'Create eval/glaze-dataset/manifest.json with a "pairs" array. See scripts/eval-glaze/evaluate.ts for the schema.'
	);
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
		try {
			await readFile(piecePath);
		} catch {
			console.error(`  MISSING piece: ${piecePath}`);
			valid = false;
		}
		try {
			await readFile(glazePath);
		} catch {
			console.error(`  MISSING glazeRef: ${glazePath}`);
			valid = false;
		}
		if (valid) {
			ok++;
			console.log(`  ✓ ${pair.id}${pair.notes ? ` — ${pair.notes}` : ''}`);
		} else {
			missing++;
		}
	}
	console.log(`\n${ok} valid, ${missing} with missing files.`);
	process.exit(missing > 0 ? 1 : 0);
}

// ── Resolve configs ───────────────────────────────────────────────────────────

const geminiConfigs = getGeminiPrompts(args.gemini?.split(',').map((s) => s.trim()));
const replicateConfigs = getReplicateModels(args.models?.split(',').map((s) => s.trim()));

const totalConfigs = geminiConfigs.length * replicateConfigs.length;
const totalRuns = manifest.pairs.length * totalConfigs;

console.log(`\nGlaze preview eval`);
console.log(`  Pairs:   ${manifest.pairs.length}`);
console.log(`  Gemini:  ${geminiConfigs.map((c) => c.name).join(', ')}`);
console.log(`  Models:  ${replicateConfigs.map((c) => c.name).join(', ')}`);
console.log(`  Total:   ${totalRuns} runs\n`);

// ── Setup caches ──────────────────────────────────────────────────────────────

const descCache = new GlazeDescriptionCache(cacheDir);
const imgCache = new GlazeImageCache(cacheDir);
const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// ── Run timestamp ─────────────────────────────────────────────────────────────

const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

// ── Evaluation loop ───────────────────────────────────────────────────────────

let succeeded = 0;
let failed = 0;
let descCached = 0;
let descComputed = 0;
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
		failed += totalConfigs;
		continue;
	}

	// Resize piece image for Replicate (1024px max)
	const pieceResized = await sharp(pieceBuffer)
		.rotate()
		.resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();
	const pieceBase64 = pieceResized.toString('base64');

	for (const geminiConfig of geminiConfigs) {
		const t0 = Date.now();

		// Step 1: Get glaze description (cached per glaze image + prompt)
		let glazeDescription: string | null = await descCache.get(glazeBuffer, geminiConfig.name);
		if (glazeDescription) {
			descCached++;
		} else {
			try {
				const glazeBase64 = glazeBuffer.toString('base64');
				const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> =
					[
						{ inlineData: { mimeType: 'image/jpeg', data: glazeBase64 } },
						{ text: geminiConfig.userPrompt }
					];
				const response = await genai.models.generateContent({
					model: 'gemini-2.5-flash',
					...(geminiConfig.systemInstruction
						? { config: { systemInstruction: geminiConfig.systemInstruction } }
						: {}),
					contents: [{ role: 'user', parts }]
				});
				glazeDescription = response.text?.trim() ?? '';
				await descCache.set(glazeBuffer, geminiConfig.name, glazeDescription);
				descComputed++;
				// Rate limit between Gemini calls
				await new Promise((r) => setTimeout(r, 200));
			} catch (err) {
				const msg = (err as Error).message;
				console.log(
					`  [${pair.id}] ${geminiConfig.name} | GEMINI FAILED — ${msg.slice(0, 80)}`
				);
				failed += replicateConfigs.length;
				continue;
			}
		}

		// For structured prompts, serialize to prose for the generation step
		const effectiveDescription =
			geminiConfig.name === 'v3-structured'
				? serializeStructuredDescription(glazeDescription)
				: glazeDescription;

		for (const replicateConfig of replicateConfigs) {
			const t1 = Date.now();

			// Step 2: Generate glazed image (cached per piece + description + model)
			let generatedBuffer: Buffer | null = await imgCache.get(
				pieceResized,
				effectiveDescription,
				replicateConfig.name
			);

			if (generatedBuffer) {
				imgCached++;
			} else {
				try {
					generatedBuffer = await runReplicatePrediction(
						replicateConfig,
						pieceBase64,
						effectiveDescription,
						REPLICATE_API_TOKEN!
					);
					await imgCache.set(pieceResized, effectiveDescription, replicateConfig.name, generatedBuffer);
					imgComputed++;
				} catch (err) {
					const msg = (err as Error).message;
					const elapsed = ((Date.now() - t1) / 1000).toFixed(1);
					console.log(
						`  [${pair.id}] ${geminiConfig.name} | ${replicateConfig.name} | FAILED ${elapsed}s — ${msg.slice(0, 80)}`
					);
					failed++;
					continue;
				}
			}

			// Save output image
			const pairOutputDir = join(outputDir, runId, pair.id);
			await mkdir(pairOutputDir, { recursive: true });
			const outPath = join(pairOutputDir, `${geminiConfig.name}--${replicateConfig.name}.jpg`);
			await writeFile(outPath, generatedBuffer);

			// Also copy originals once per pair (for side-by-side comparison)
			const pieceOutPath = join(pairOutputDir, '_piece.jpg');
			const glazeOutPath = join(pairOutputDir, '_glaze-ref.jpg');
			try {
				await copyFile(piecePath, pieceOutPath);
				await copyFile(glazePath, glazeOutPath);
			} catch {
				// Originals may already be copied from a previous config in this pair
			}

			// Save glaze description alongside images
			const descPath = join(pairOutputDir, `${geminiConfig.name}.txt`);
			await writeFile(
				descPath,
				`[${geminiConfig.name}]\n${glazeDescription}\n\n[effective]\n${effectiveDescription}`,
				'utf-8'
			);

			const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
			const cacheNote = imgCached > imgComputed ? ' (cached)' : '';
			console.log(
				`  [${pair.id}] ${geminiConfig.name} | ${replicateConfig.name} | ✓ ${elapsed}s${cacheNote}`
			);
			succeeded++;
		}
	}
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nDone.`);
console.log(
	`  Descriptions: ${descCached} cached, ${descComputed} computed`
);
console.log(`  Images:       ${imgCached} cached, ${imgComputed} computed`);
console.log(`  Results:      ${succeeded} succeeded, ${failed} failed`);
if (succeeded > 0) {
	console.log(`\nOutput: ${join(outputDir, runId)}/`);
}
