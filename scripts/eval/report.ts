import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { PipelineMetrics, PerPieceMetrics } from './types.ts';

function pad(str: string, width: number): string {
	return str.padEnd(width);
}

function fmtNum(n: number): string {
	return n.toFixed(2);
}

export function printComparisonTable(
	allMetrics: PipelineMetrics[],
	topKValues: number[],
	totalImages: number
): void {
	if (allMetrics.length === 0) {
		console.log('No results to display.');
		return;
	}

	const totalPieces = allMetrics[0].totalPieces;
	console.log(
		`\nEmbedding Retrieval Evaluation (${totalImages} images across ${totalPieces} pieces)`
	);
	console.log('─'.repeat(70));

	// Header
	const pipelineWidth = Math.max(12, ...allMetrics.map((m) => m.pipelineName.length)) + 2;
	const embedderWidth = Math.max(10, ...allMetrics.map((m) => m.embedderName.length)) + 2;
	const colWidth = 8;

	let header = pad('Pipeline', pipelineWidth) + pad('Embedder', embedderWidth);
	for (const k of topKValues) {
		header += pad(`R@${k}`, colWidth);
	}
	header += pad('MRR', colWidth);
	console.log(header);
	console.log('─'.repeat(header.length));

	// Rows sorted by Recall at largest k (descending)
	const maxK = Math.max(...topKValues);
	const sorted = [...allMetrics].sort(
		(a, b) => (b.recallAtK[maxK] ?? 0) - (a.recallAtK[maxK] ?? 0)
	);

	for (const m of sorted) {
		let row = pad(m.pipelineName, pipelineWidth) + pad(m.embedderName, embedderWidth);
		for (const k of topKValues) {
			row += pad(fmtNum(m.recallAtK[k] ?? 0), colWidth);
		}
		row += pad(fmtNum(m.mrrAtK[maxK] ?? 0), colWidth);
		console.log(row);
	}

	console.log();
}

export function printPerPieceTable(
	perPiece: PerPieceMetrics[],
	topKValues: number[],
	pipelineName: string,
	embedderName: string
): void {
	console.log(`\nPer-piece breakdown: ${pipelineName} + ${embedderName}`);
	console.log('─'.repeat(70));

	const nameWidth = Math.max(20, ...perPiece.map((p) => p.pieceName.length)) + 2;
	const colWidth = 8;

	let header = pad('Piece', nameWidth) + pad('Imgs', 6);
	for (const k of topKValues) {
		header += pad(`R@${k}`, colWidth);
	}
	console.log(header);
	console.log('─'.repeat(header.length));

	for (const p of perPiece) {
		let row = pad(p.pieceName, nameWidth) + pad(String(p.imageCount), 6);
		for (const k of topKValues) {
			row += pad(fmtNum(p.recallAtK[k] ?? 0), colWidth);
		}
		console.log(row);
	}

	console.log();
}

export async function writeJsonReport(
	allMetrics: PipelineMetrics[],
	allPerPiece: Map<string, PerPieceMetrics[]>,
	outputDir: string
): Promise<string> {
	await mkdir(outputDir, { recursive: true });
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
	const filePath = join(outputDir, `eval-${timestamp}.json`);

	const report = {
		timestamp: new Date().toISOString(),
		results: allMetrics.map((m) => ({
			...m,
			perPiece: allPerPiece.get(`${m.pipelineName}:${m.embedderName}`) ?? []
		}))
	};

	await writeFile(filePath, JSON.stringify(report, null, 2));
	return filePath;
}
