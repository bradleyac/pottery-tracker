/**
 * Resize an image File to fit within maxPx on its longest side, returning a
 * new JPEG File. If the image is already within bounds, returns it unchanged.
 * Browser-only (uses Canvas API).
 */
export async function resizeImageToJpeg(file: File, maxPx = 1024, quality = 0.85): Promise<File> {
	const bitmap = await createImageBitmap(file);
	const { width, height } = bitmap;

	if (width <= maxPx && height <= maxPx) {
		bitmap.close();
		return file;
	}

	const scale = maxPx / Math.max(width, height);
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * scale);
	canvas.height = Math.round(height * scale);
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();

	const blob = await new Promise<Blob>((resolve, reject) => {
		canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))), 'image/jpeg', quality);
	});

	return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
}

export function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric'
	});
}

export function formatRelativeDate(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return 'Today';
	if (diffDays === 1) return 'Yesterday';
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
	return `${Math.floor(diffDays / 365)} years ago`;
}

export function confidenceLabel(confidence: number): string {
	if (confidence >= 0.9) return 'Very high';
	if (confidence >= 0.75) return 'High';
	if (confidence >= 0.6) return 'Medium';
	return 'Low';
}

export function confidenceColor(confidence: number): string {
	if (confidence >= 0.9) return '#22c55e';
	if (confidence >= 0.75) return '#84cc16';
	if (confidence >= 0.6) return '#eab308';
	return '#ef4444';
}
