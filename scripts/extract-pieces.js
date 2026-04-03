#!/usr/bin/env node
/**
 * Extract all pottery pieces and their original images from Supabase storage.
 *
 * Usage:
 *   node --env-file=.env.local scripts/extract-pieces.js [output-dir]
 *
 * Output structure:
 *   <output-dir>/<piece-name>/<image-id>.jpg
 *
 * Skips thumbnail (thumb_), background-removed (clean_), and depth (depth_) variants.
 * Output dir defaults to ./pieces-export
 */

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BUCKET = 'pottery-images';
const SIGNED_URL_EXPIRY = 300; // 5 minutes — enough to download everything

// ── Config ──────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Run with: node --env-file=.env.local scripts/extract-pieces.js');
  process.exit(1);
}

const outputDir = process.argv[2] ?? 'pieces-export';
const supabase = createClient(supabaseUrl, serviceRoleKey);

// ── Resolve user ID from email ───────────────────────────────────────────────

const USER_EMAIL = 'andrew.charles.bradley@gmail.com';

const { data: { users }, error: userError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (userError) {
  console.error('Failed to list users:', userError.message);
  process.exit(1);
}

const user = users.find((u) => u.email === USER_EMAIL);
if (!user) {
  console.error(`No user found with email: ${USER_EMAIL}`);
  process.exit(1);
}

const userId = user.id;
console.log(`User: ${USER_EMAIL} (${userId})`);

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFolderName(name) {
  return name.replace(/[/\\?%*:|"<>]/g, '-').trim();
}

function isOriginalImage(storagePath) {
  const filename = storagePath.split('/').at(-1) ?? '';
  return (
    !filename.startsWith('thumb_') &&
    !filename.startsWith('clean_') &&
    !filename.startsWith('depth_')
  );
}

async function downloadUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

// ── Main ─────────────────────────────────────────────────────────────────────

const { data: pieces, error: piecesError } = await supabase
  .from('pieces')
  .select('id, name')
  .eq('user_id', userId)
  .order('created_at');

if (piecesError) {
  console.error('Failed to fetch pieces:', piecesError.message);
  process.exit(1);
}

console.log(`Found ${pieces.length} pieces. Output → ${outputDir}/\n`);

let totalImages = 0;
let totalBytes = 0;

for (const piece of pieces) {
  const folderName = sanitizeFolderName(piece.name);
  const pieceDir = join(outputDir, folderName);
  await mkdir(pieceDir, { recursive: true });

  const { data: images, error: imagesError } = await supabase
    .from('images')
    .select('id, storage_path, is_cover, uploaded_at')
    .eq('piece_id', piece.id)
    .order('uploaded_at');

  if (imagesError) {
    console.warn(`  [${piece.name}] Failed to fetch images: ${imagesError.message}`);
    continue;
  }

  const originals = images.filter((img) => isOriginalImage(img.storage_path));

  if (originals.length === 0) {
    console.log(`  [${piece.name}] no original images, skipping`);
    continue;
  }

  // Batch-sign all URLs at once
  const { data: signedData, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(
      originals.map((img) => img.storage_path),
      SIGNED_URL_EXPIRY
    );

  if (signError) {
    console.warn(`  [${piece.name}] Failed to sign URLs: ${signError.message}`);
    continue;
  }

  const urlMap = new Map(signedData.map((item) => [item.path, item.signedUrl]));

  console.log(`  [${piece.name}] ${originals.length} image(s)`);

  for (const img of originals) {
    const signedUrl = urlMap.get(img.storage_path);
    if (!signedUrl) {
      console.warn(`    ✗ no signed URL for ${img.storage_path}`);
      continue;
    }

    const suffix = img.is_cover ? ' (cover)' : '';
    const filename = `${img.id}.jpg`;
    const destPath = join(pieceDir, filename);

    try {
      const buffer = await downloadUrl(signedUrl);
      await writeFile(destPath, buffer);
      totalBytes += buffer.length;
      totalImages++;
      console.log(`    ✓ ${filename}${suffix}  (${(buffer.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.warn(`    ✗ ${filename}: ${err.message}`);
    }
  }
}

const mb = (totalBytes / 1024 / 1024).toFixed(1);
console.log(`\nDone. ${totalImages} images saved (${mb} MB total) → ${outputDir}/`);
