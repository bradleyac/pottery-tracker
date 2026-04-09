import type { PendingUploadStatus } from '$lib/types';

export const IN_PROGRESS_STATUSES: PendingUploadStatus[] = [
	'queued',
	'preprocessing',
	'analyzing',
	'waiting_for_batch',
	'consolidating'
];

export const MAX_ANALYZE_ATTEMPTS = 6;
export const MAX_BATCH_ATTEMPTS = 5;

// Backoff schedule (seconds): 30, 60, 120, 300, 600, 1200
const BACKOFF_SECONDS = [30, 60, 120, 300, 600, 1200];

export function nextBackoff(attempts: number): number {
	const idx = Math.min(attempts, BACKOFF_SECONDS.length - 1);
	return BACKOFF_SECONDS[idx];
}

const TRANSIENT_HTTP_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const TRANSIENT_PATTERNS = [
	/rate.?limit/i,
	/quota/i,
	/resource.*exhaust/i,
	/ECONNRESET/,
	/ETIMEDOUT/,
	/ENOTFOUND/,
	/fetch.*failed/i,
	/network.*error/i,
	/AbortError/,
	/timeout/i,
	/503/,
	/502/,
	/500/,
	/429/,
	/408/
];

export function isTransientError(err: unknown): boolean {
	const msg = err instanceof Error ? err.message : String(err);

	// Check for HTTP status codes embedded in the error message
	const statusMatch = msg.match(/error (\d{3})/i) ?? msg.match(/^(\d{3}):/);
	if (statusMatch) {
		const code = parseInt(statusMatch[1], 10);
		if (TRANSIENT_HTTP_STATUSES.has(code)) return true;
		// Explicitly permanent codes: 400, 401, 403, 404, 422
		if (code >= 400 && code < 500 && !TRANSIENT_HTTP_STATUSES.has(code)) return false;
	}

	return TRANSIENT_PATTERNS.some((re) => re.test(msg));
}
