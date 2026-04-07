export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
	public: {
		Tables: {
			pieces: {
				Row: {
					id: string;
					user_id: string;
					name: string;
					description: string | null;
					ai_description: string | null;
					created_at: string;
					updated_at: string;
					cover_image_id: string | null;
					cover_embedding: string | null;
				};
				Insert: {
					id?: string;
					user_id: string;
					name: string;
					description?: string | null;
					ai_description?: string | null;
					created_at?: string;
					updated_at?: string;
					cover_image_id?: string | null;
					cover_embedding?: string | null;
				};
				Update: {
					id?: string;
					user_id?: string;
					name?: string;
					description?: string | null;
					ai_description?: string | null;
					created_at?: string;
					updated_at?: string;
					cover_image_id?: string | null;
					cover_embedding?: string | null;
				};
				Relationships: [];
			};
			images: {
				Row: {
					id: string;
					piece_id: string;
					user_id: string;
					storage_path: string;
					uploaded_at: string;
					notes: string | null;
					is_cover: boolean;
					embedding: string | null;
				};
				Insert: {
					id?: string;
					piece_id: string;
					user_id: string;
					storage_path: string;
					uploaded_at?: string;
					notes?: string | null;
					is_cover?: boolean;
					embedding?: string | null;
				};
				Update: {
					id?: string;
					piece_id?: string;
					user_id?: string;
					storage_path?: string;
					uploaded_at?: string;
					notes?: string | null;
					is_cover?: boolean;
					embedding?: string | null;
				};
				Relationships: [];
			};
			piece_matches: {
				Row: {
					id: string;
					user_id: string;
					candidate_path: string;
					suggested_piece_id: string | null;
					confidence: number | null;
					claude_reasoning: string | null;
					user_action: 'accepted' | 'overridden' | 'new_piece';
					final_piece_id: string | null;
					created_at: string;
				};
				Insert: {
					id?: string;
					user_id: string;
					candidate_path: string;
					suggested_piece_id?: string | null;
					confidence?: number | null;
					claude_reasoning?: string | null;
					user_action: 'accepted' | 'overridden' | 'new_piece';
					final_piece_id?: string | null;
					created_at?: string;
				};
				Update: {
					id?: string;
					user_id?: string;
					candidate_path?: string;
					suggested_piece_id?: string | null;
					confidence?: number | null;
					claude_reasoning?: string | null;
					user_action?: 'accepted' | 'overridden' | 'new_piece';
					final_piece_id?: string | null;
					created_at?: string;
				};
				Relationships: [];
			};
			app_config: {
				Row:    { key: string; value: string };
				Insert: { key: string; value: string };
				Update: { key?: string; value?: string };
				Relationships: [];
			};
			pending_uploads: {
				Row: {
					id: string;
					user_id: string;
					temp_storage_path: string;
					original_filename: string | null;
					matched_piece_id: string | null;
					confidence: number | null;
					claude_reasoning: string | null;
					suggested_name: string | null;
					updated_description: string | null;
					status: 'queued' | 'ready' | 'failed';
					created_at: string;
					batch_id: string | null;
					embedding: string | null;
					batch_group_id: string | null;
					batch_consolidated: boolean;
				};
				Insert: {
					id?: string;
					user_id: string;
					temp_storage_path: string;
					original_filename?: string | null;
					matched_piece_id?: string | null;
					confidence?: number | null;
					claude_reasoning?: string | null;
					suggested_name?: string | null;
					updated_description?: string | null;
					status?: 'queued' | 'ready' | 'failed';
					created_at?: string;
					batch_id?: string | null;
					embedding?: string | null;
					batch_group_id?: string | null;
					batch_consolidated?: boolean;
				};
				Update: {
					id?: string;
					user_id?: string;
					temp_storage_path?: string;
					original_filename?: string | null;
					matched_piece_id?: string | null;
					confidence?: number | null;
					claude_reasoning?: string | null;
					suggested_name?: string | null;
					updated_description?: string | null;
					status?: 'queued' | 'ready' | 'failed';
					created_at?: string;
					batch_id?: string | null;
					embedding?: string | null;
					batch_group_id?: string | null;
					batch_consolidated?: boolean;
				};
				Relationships: [];
			};
			signed_url_cache: {
				Row:    { storage_path: string; signed_url: string; expires_at: string; cached_at: string };
				Insert: { storage_path: string; signed_url: string; expires_at: string; cached_at?: string };
				Update: { storage_path?: string; signed_url?: string; expires_at?: string; cached_at?: string };
				Relationships: [];
			};
		};
		Views: Record<string, never>;
		Functions: Record<
			string,
			{
				Args: Record<string, unknown>;
				Returns: unknown;
			}
		>;
		Enums: Record<string, string[]>;
	};
}

// Convenience types
export type Piece = Database['public']['Tables']['pieces']['Row'];
export type Image = Database['public']['Tables']['images']['Row'];
export type PieceMatch = Database['public']['Tables']['piece_matches']['Row'];
export type PendingUpload = Database['public']['Tables']['pending_uploads']['Row'];

export type PieceWithCover = Piece & {
	cover_url: string | null;
};

export type ImageWithUrl = Image & {
	url: string;
};

export type PieceWithImages = Piece & {
	images: ImageWithUrl[];
};

// Minimal piece info used in upload/confirm flows
export type PieceSummary = {
	id: string;
	name: string;
	cover_url: string | null;
};

export type PendingUploadWithUrls = PendingUpload & {
	tempImageUrl: string;
	matchedPieceCoverUrl: string | null;
	matchedPieceName: string | null;
	isStuck: boolean;
};

export type ClaudeMatchResult = {
	matchedPieceId: string | null;
	confidence: number;
	reasoning: string;
	suggestedName: string;
	updatedDescription: string;
};

export type MatchResultWithPiece = ClaudeMatchResult & {
	matchedPieceName?: string;
	matchedPieceCoverUrl?: string | null;
	storagePath: string;
};
