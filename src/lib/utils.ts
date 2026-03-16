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
