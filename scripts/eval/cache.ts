import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

export class EmbeddingCache {
	constructor(private cacheDir: string) {}

	private keyPath(preprocessedBuffer: Buffer, embedderName: string): string {
		const hash = createHash('sha256').update(preprocessedBuffer).digest('hex');
		return join(this.cacheDir, embedderName, `${hash}.json`);
	}

	async get(preprocessedBuffer: Buffer, embedderName: string): Promise<number[] | null> {
		try {
			const data = await readFile(this.keyPath(preprocessedBuffer, embedderName), 'utf-8');
			return JSON.parse(data).embedding;
		} catch {
			return null;
		}
	}

	async set(
		preprocessedBuffer: Buffer,
		embedderName: string,
		embedding: number[]
	): Promise<void> {
		const path = this.keyPath(preprocessedBuffer, embedderName);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, JSON.stringify({ embedding, cached: new Date().toISOString() }));
	}
}
