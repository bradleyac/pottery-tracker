import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createServiceRoleClient } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const { session, user } = await safeGetSession();
	if (!session || !user) error(401, 'Unauthorized');

	const body = await request.json();
	const {
		candidatePath,
		suggestedPieceId,
		confidence,
		claudeReasoning,
		userAction,
		finalPieceId
	} = body;

	const supabase = createServiceRoleClient();

	await supabase.from('piece_matches').insert({
		user_id: user.id,
		candidate_path: candidatePath,
		suggested_piece_id: suggestedPieceId ?? null,
		confidence: confidence ?? null,
		claude_reasoning: claudeReasoning ?? null,
		user_action: userAction,
		final_piece_id: finalPieceId ?? null
	});

	return json({ ok: true });
};
