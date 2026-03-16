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
				};
				Insert: {
					id?: string;
					piece_id: string;
					user_id: string;
					storage_path: string;
					uploaded_at?: string;
					notes?: string | null;
					is_cover?: boolean;
				};
				Update: {
					id?: string;
					piece_id?: string;
					user_id?: string;
					storage_path?: string;
					uploaded_at?: string;
					notes?: string | null;
					is_cover?: boolean;
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

export type PieceWithCover = Piece & {
	cover_url: string | null;
};

export type ImageWithUrl = Image & {
	url: string;
};

export type PieceWithImages = Piece & {
	images: ImageWithUrl[];
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
