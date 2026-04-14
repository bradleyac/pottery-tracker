import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

// ── Glaze description cache ───────────────────────────────────────────────────
// Keyed on sha256(imageBuffer) + promptConfigName → stores text string.

export class GlazeDescriptionCache {
	constructor(private cacheDir: string) {}

	private keyPath(imageBuffer: Buffer, promptName: string): string {
		const hash = createHash('sha256').update(imageBuffer).digest('hex');
		return join(this.cacheDir, 'glaze-descriptions', `${hash}-${promptName}.txt`);
	}

	async get(imageBuffer: Buffer, promptName: string): Promise<string | null> {
		try {
			return await readFile(this.keyPath(imageBuffer, promptName), 'utf-8');
		} catch {
			return null;
		}
	}

	async set(imageBuffer: Buffer, promptName: string, description: string): Promise<void> {
		const path = this.keyPath(imageBuffer, promptName);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, description, 'utf-8');
	}
}

// ── Generated image cache ─────────────────────────────────────────────────────
// Keyed on sha256(pieceBuffer) + sha256(glazeDescription) + modelName → JPEG buffer.

export class GlazeImageCache {
	constructor(private cacheDir: string) {}

	private keyPath(pieceBuffer: Buffer, glazeDescription: string, modelName: string): string {
		const pieceHash = createHash('sha256').update(pieceBuffer).digest('hex');
		const descHash = createHash('sha256').update(glazeDescription).digest('hex');
		return join(this.cacheDir, 'glaze-images', `${pieceHash}-${descHash}-${modelName}.jpg`);
	}

	async get(
		pieceBuffer: Buffer,
		glazeDescription: string,
		modelName: string
	): Promise<Buffer | null> {
		try {
			return await readFile(this.keyPath(pieceBuffer, glazeDescription, modelName));
		} catch {
			return null;
		}
	}

	async set(
		pieceBuffer: Buffer,
		glazeDescription: string,
		modelName: string,
		imageBuffer: Buffer
	): Promise<void> {
		const path = this.keyPath(pieceBuffer, glazeDescription, modelName);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, imageBuffer);
	}
}
