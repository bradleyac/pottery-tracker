import { downloadImage } from './storage';
import {
	ThumbnailStrategy,
	type StrategyIO
} from '../../../supabase/functions/_shared/strategies.js';

export type { RawCandidate, MatchingStrategy } from '../../../supabase/functions/_shared/strategies.js';

const nodeIO: StrategyIO = {
	downloadImage: async (path) => {
		try {
			return (await downloadImage(path)).toString('base64');
		} catch {
			return null;
		}
	}
};

export function getMatchingStrategy() {
	return new ThumbnailStrategy(nodeIO);
}
