/**
 * Generate a manifest.json from a directory of piece folders.
 *
 * Expected structure:
 *   <dataset-dir>/<Piece-Name>/<image-id>.jpg
 *
 * Usage:
 *   node --import tsx scripts/eval/init-manifest.ts <dataset-dir>
 *
 * Or invoked via: evaluate.ts --init --dataset <dir>
 */

import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Manifest, ManifestPiece } from './types.ts';

function slugify(name: string): string {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
}

export async function generateManifest(datasetDir: string): Promise<Manifest> {
	const entries = await readdir(datasetDir, { withFileTypes: true });
	const pieces: ManifestPiece[] = [];

	for (const entry of entries) {
		if (!entry.isDirectory()) continue;
		if (entry.name.startsWith('.')) continue;

		const pieceDir = join(datasetDir, entry.name);
		const files = await readdir(pieceDir);
		const images = files
			.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
			.sort()
			.map((f) => ({
				path: `${entry.name}/${f}`,
				stage: null as string | null
			}));

		if (images.length === 0) continue;

		pieces.push({
			id: slugify(entry.name),
			name: entry.name,
			images
		});
	}

	pieces.sort((a, b) => a.name.localeCompare(b.name));
	return { pieces };
}

export async function writeManifest(datasetDir: string): Promise<string> {
	const manifest = await generateManifest(datasetDir);
	const outPath = join(datasetDir, 'manifest.json');
	await writeFile(outPath, JSON.stringify(manifest, null, 2) + '\n');

	const totalImages = manifest.pieces.reduce((sum, p) => sum + p.images.length, 0);
	console.log(
		`Wrote ${outPath}: ${manifest.pieces.length} pieces, ${totalImages} images`
	);

	// Flag pieces with only 1 image (can't evaluate retrieval)
	const singles = manifest.pieces.filter((p) => p.images.length < 2);
	if (singles.length > 0) {
		console.log(
			`\nNote: ${singles.length} piece(s) have only 1 image (excluded from retrieval eval):`
		);
		for (const p of singles) {
			console.log(`  - ${p.name}`);
		}
	}

	return outPath;
}

// Run directly
if (process.argv[1]?.endsWith('init-manifest.ts')) {
	const dir = process.argv[2];
	if (!dir) {
		console.error('Usage: node --import tsx scripts/eval/init-manifest.ts <dataset-dir>');
		process.exit(1);
	}
	await writeManifest(dir);
}
