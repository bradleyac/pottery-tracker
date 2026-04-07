#!/usr/bin/env node
/**
 * Backfill embeddings for all images that don't have one yet.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-image-embeddings.js
 *
 * Uses the thumb_ variant if available, falls back to the original.
 * Processes images in batches of 5 with a 1s delay between batches to
 * avoid hitting Gemini rate limits.
 */

import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import sharp from 'sharp';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';
const BUCKET = 'pottery-images';
const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;

const supabase = createClient(
	process.env.PUBLIC_SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
	{ auth: { autoRefreshToken: false, persistSession: false } }
);

const genai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function resizeAndEncode(buffer) {
	const resized = await sharp(buffer)
		.rotate()
		.resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: true })
		.jpeg({ quality: 82 })
		.toBuffer();
	return resized.toString('base64');
}

async function generateEmbedding(imageBase64) {
	const response = await genai.models.embedContent({
		model: EMBEDDING_MODEL,
		contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] }],
		config: { outputDimensionality: 768 }
	});
	const values = response.embeddings?.[0]?.values;
	if (!values) throw new Error('No embedding values returned');
	return values;
}

async function downloadImage(storagePath) {
	const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
	if (error || !data) throw new Error(`Failed to download ${storagePath}: ${error?.message}`);
	const arrayBuffer = await data.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

async function processImage(image) {
	const thumbPath = image.storage_path.replace(/\/([^/]+\.jpg)$/, '/thumb_$1');

	let buffer;
	try {
		buffer = await downloadImage(thumbPath);
	} catch {
		// No thumbnail — use original
		buffer = await downloadImage(image.storage_path);
	}

	const base64 = await resizeAndEncode(buffer);
	const embedding = await generateEmbedding(base64);

	const { error } = await supabase
		.from('images')
		.update({ embedding: JSON.stringify(embedding) })
		.eq('id', image.id);

	if (error) throw new Error(`Failed to update image ${image.id}: ${error.message}`);
}

async function main() {
	// Fetch all images without an embedding
	const { data: images, error } = await supabase
		.from('images')
		.select('id, storage_path, piece_id')
		.is('embedding', null)
		.order('uploaded_at', { ascending: true });

	if (error) {
		console.error('Failed to fetch images:', error.message);
		process.exit(1);
	}

	console.log(`Found ${images.length} images without embeddings`);

	let succeeded = 0;
	let failed = 0;

	for (let i = 0; i < images.length; i += BATCH_SIZE) {
		const batch = images.slice(i, i + BATCH_SIZE);
		console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} / ${Math.ceil(images.length / BATCH_SIZE)} (images ${i + 1}–${Math.min(i + BATCH_SIZE, images.length)})`);

		await Promise.allSettled(
			batch.map(async (image) => {
				try {
					await processImage(image);
					succeeded++;
				} catch (err) {
					console.error(`  FAILED ${image.id} (${image.storage_path}): ${err.message}`);
					failed++;
				}
			})
		);

		if (i + BATCH_SIZE < images.length) {
			await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
		}
	}

	console.log(`\nDone. ${succeeded} succeeded, ${failed} failed.`);
}

main();
