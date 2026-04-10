import { GoogleGenAI } from '@google/genai';
import type { Embedder } from './types.ts';

const EMBEDDING_MODEL = 'gemini-embedding-2-preview';

export function createGeminiEmbedder(dimensions: number = 768): Embedder {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) throw new Error('GEMINI_API_KEY is required');

	const genai = new GoogleGenAI({ apiKey });

	return {
		name: `gemini-${dimensions}d`,
		dimensions,
		async embed(imageBuffer: Buffer): Promise<number[]> {
			const base64 = imageBuffer.toString('base64');
			const response = await genai.models.embedContent({
				model: EMBEDDING_MODEL,
				contents: [{ parts: [{ inlineData: { mimeType: 'image/jpeg', data: base64 } }] }],
				config: { outputDimensionality: dimensions }
			});
			const values = response.embeddings?.[0]?.values;
			if (!values) throw new Error('No embedding values returned');
			return values;
		}
	};
}

export function getDefaultEmbedders(): Embedder[] {
	return [createGeminiEmbedder(768)];
}
