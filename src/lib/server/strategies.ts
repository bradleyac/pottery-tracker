import { createServiceRoleClient } from './supabase';
import { downloadImage } from './storage';
import { generateDepthMap } from './depth';
import {
	createMatchingStrategy,
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
	},
	generateDepthMap: async (imageBase64) => {
		try {
			const buf = await generateDepthMap(Buffer.from(imageBase64, 'base64'));
			return buf.toString('base64');
		} catch {
			return null;
		}
	}
};

export async function getMatchingStrategy() {
	const supabase = createServiceRoleClient();
	const { data } = await supabase
		.from('app_config')
		.select('value')
		.eq('key', 'matching_strategy')
		.single();
	return createMatchingStrategy(data?.value ?? 'thumbnail', nodeIO);
}
