import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

// ── Generated image cache ─────────────────────────────────────────────────────
// Keyed on sha256(pieceBuffer) + sha256(glazeRefBuffer) + sha256(prompt) + modelName.
// The prompt and ref hashes use 16 hex chars each to keep filenames short.

export class GlazeImageCache {
	constructor(private cacheDir: string) {}

	private keyPath(
		pieceBuffer: Buffer,
		glazeRefBuffer: Buffer,
		prompt: string,
		modelName: string
	): string {
		const pieceHash = createHash('sha256').update(pieceBuffer).digest('hex');
		const refHash = createHash('sha256').update(glazeRefBuffer).digest('hex').slice(0, 16);
		const promptHash = createHash('sha256').update(prompt).digest('hex').slice(0, 16);
		return join(this.cacheDir, 'glaze-images', `${pieceHash}-${refHash}-${promptHash}-${modelName}.jpg`);
	}

	async get(
		pieceBuffer: Buffer,
		glazeRefBuffer: Buffer,
		prompt: string,
		modelName: string
	): Promise<Buffer | null> {
		try {
			return await readFile(this.keyPath(pieceBuffer, glazeRefBuffer, prompt, modelName));
		} catch {
			return null;
		}
	}

	async set(
		pieceBuffer: Buffer,
		glazeRefBuffer: Buffer,
		prompt: string,
		modelName: string,
		imageBuffer: Buffer
	): Promise<void> {
		const path = this.keyPath(pieceBuffer, glazeRefBuffer, prompt, modelName);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, imageBuffer);
	}
}
