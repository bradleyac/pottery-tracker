import PendingUploadCard from '$lib/components/PendingUploadCard.svelte';
import type { PendingUploadWithUrls, PieceSummary } from '$lib/types';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';

// --- Mock data ---

const baseUpload: PendingUploadWithUrls = {
	id: 'upload-1',
	user_id: 'user-1',
	temp_storage_path: 'user-1/temp/upload-1.jpg',
	original_filename: 'bowl-photo.jpg',
	matched_piece_id: 'piece-1',
	confidence: 0.87,
	claude_reasoning: 'The shape and glaze match the celadon bowl in your collection.',
	suggested_name: 'Celadon Bowl #1',
	updated_description: null,
	status: 'ready',
	created_at: '2025-11-01T10:00:00Z',
	batch_id: null,
	embedding: null,
	batch_group_id: null,
	analyze_attempts: 0,
	analyze_next_attempt_at: null,
	analyze_last_error: null,
	analyze_locked_at: null,
	tempImageUrl: 'https://picsum.photos/seed/upload1/400/400',
	matchedPieceCoverUrl: 'https://picsum.photos/seed/piece1/400/400',
	matchedPieceName: 'Celadon Bowl #1',
	isStuck: false
};

const newPieceUpload: PendingUploadWithUrls = {
	...baseUpload,
	id: 'upload-2',
	matched_piece_id: null,
	confidence: null,
	claude_reasoning: 'This appears to be a new piece not yet in your collection.',
	suggested_name: 'Stoneware Mug',
	matchedPieceCoverUrl: null,
	matchedPieceName: null,
	tempImageUrl: 'https://picsum.photos/seed/upload2/400/400'
};

const queuedUpload: PendingUploadWithUrls = {
	...baseUpload,
	id: 'upload-3',
	status: 'queued',
	matched_piece_id: null,
	confidence: null,
	claude_reasoning: null,
	matchedPieceCoverUrl: null,
	matchedPieceName: null
};

const failedUpload: PendingUploadWithUrls = {
	...baseUpload,
	id: 'upload-4',
	status: 'failed',
	matched_piece_id: null,
	confidence: null,
	claude_reasoning: null,
	matchedPieceCoverUrl: null,
	matchedPieceName: null
};

const mockPieces: PieceSummary[] = [
	{ id: 'piece-1', name: 'Celadon Bowl #1', cover_url: 'https://picsum.photos/seed/p1/200/200' },
	{ id: 'piece-2', name: 'Terracotta Vase', cover_url: 'https://picsum.photos/seed/p2/200/200' },
	{ id: 'piece-3', name: 'Matte Black Mug', cover_url: null }
];

const meta = {
	title: 'Components/PendingUploadCard',
	component: PendingUploadCard,
	tags: ['autodocs'],
	argTypes: {
		onDecisionChange: { action: 'onDecisionChange' },
		onConfirm: { action: 'onConfirm' },
		onDismiss: { action: 'onDismiss' },
		onRetry: { action: 'onRetry' }
	},
	parameters: {
		viewport: {
			options: MINIMAL_VIEWPORTS
		}
	}
} satisfies Meta<typeof PendingUploadCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Visual stories ---

export const MatchFound: Story = {
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const NewPieceDetected: Story = {
	args: {
		upload: newPieceUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const Queued: Story = {
	args: {
		upload: queuedUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const Failed: Story = {
	args: {
		upload: failedUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined),
		onRetry: fn().mockResolvedValue(undefined)
	}
};

export const ChoosePiece: Story = {
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'choose_piece', selectedId: 'piece-2' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const NameNewPiece: Story = {
	args: {
		upload: newPieceUpload,
		pieces: mockPieces,
		decision: { mode: 'new_piece', name: 'Stoneware Mug' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const Saving: Story = {
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'saving' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const Saved: Story = {
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'saved', pieceId: 'piece-1' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const Dismissed: Story = {
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'dismissed' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const ErrorState: Story = {
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'error', message: 'Something went wrong saving the photo.' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

// --- Test stories ---

export const QueuedShowsAnalyzing: Story = {
	name: 'Test: queued state shows analyzing label',
	args: {
		upload: queuedUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('Analyzing with Claude…')).toBeInTheDocument();
	}
};

export const MatchReviewShowsBadge: Story = {
	name: 'Test: match review shows confidence badge and filename',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('bowl-photo.jpg')).toBeInTheDocument();
		expect(canvas.getByText(/87%/)).toBeInTheDocument();
		expect(canvas.getByText(baseUpload.claude_reasoning!)).toBeInTheDocument();
	}
};

export const NewPieceReviewShowsBadge: Story = {
	name: 'Test: new piece review shows new badge',
	args: {
		upload: newPieceUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('New piece detected')).toBeInTheDocument();
	}
};

export const FailedShowsBadge: Story = {
	name: 'Test: failed state shows failed badge and retry button',
	args: {
		upload: failedUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined),
		onRetry: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('Analysis failed')).toBeInTheDocument();
		expect(canvas.getByRole('button', { name: 'Retry analysis' })).toBeInTheDocument();
	}
};

export const SavedShowsViewLink: Story = {
	name: 'Test: saved state shows view piece link',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'saved', pieceId: 'piece-1' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const link = canvas.getByRole('link', { name: /View piece/i });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute('href', '/pieces/piece-1');
	}
};

export const ErrorShowsTryAgain: Story = {
	name: 'Test: error state shows message and try again button',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'error', message: 'Something went wrong saving the photo.' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('Something went wrong saving the photo.')).toBeInTheDocument();
		expect(canvas.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
	}
};

export const AcceptCallsOnConfirm: Story = {
	name: 'Test: accept button calls onConfirm with accepted',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: /Add to/i }));
		expect(args.onConfirm).toHaveBeenCalledWith('accepted', '');
	}
};

export const DismissCallsOnDismiss: Story = {
	name: 'Test: dismiss button calls onDismiss',
	args: {
		upload: newPieceUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }));
		expect(args.onDismiss).toHaveBeenCalledTimes(1);
	}
};

export const PickDifferentPieceTransitions: Story = {
	name: 'Test: pick different piece calls onDecisionChange with choose_piece',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Pick different piece' }));
		expect(args.onDecisionChange).toHaveBeenCalledWith({
			mode: 'choose_piece',
			selectedId: 'piece-1'
		});
	}
};

export const ThisIsNewPieceTransitions: Story = {
	name: 'Test: "This is a new piece" calls onDecisionChange with new_piece',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'This is a new piece' }));
		expect(args.onDecisionChange).toHaveBeenCalledWith({
			mode: 'new_piece',
			name: 'Celadon Bowl #1'
		});
	}
};

export const RetryCallsOnRetry: Story = {
	name: 'Test: retry button calls onRetry',
	args: {
		upload: failedUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined),
		onRetry: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Retry analysis' }));
		expect(args.onRetry).toHaveBeenCalledTimes(1);
	}
};

export const ChoosePieceShowsPieces: Story = {
	name: 'Test: choose_piece mode renders all pieces',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'choose_piece', selectedId: '' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('Celadon Bowl #1')).toBeInTheDocument();
		expect(canvas.getByText('Terracotta Vase')).toBeInTheDocument();
		expect(canvas.getByText('Matte Black Mug')).toBeInTheDocument();
	}
};

export const AssignButtonDisabledWithNoSelection: Story = {
	name: 'Test: assign button disabled when no piece selected',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'choose_piece', selectedId: '' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByRole('button', { name: 'Assign to this piece' })).toBeDisabled();
	}
};

export const AssignButtonEnabledWithSelection: Story = {
	name: 'Test: assign button enabled when piece is selected',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'choose_piece', selectedId: 'piece-2' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByRole('button', { name: 'Assign to this piece' })).not.toBeDisabled();
	}
};

export const CreateNewPieceButtonDisabledWhenEmpty: Story = {
	name: 'Test: create new piece button disabled when name is empty',
	args: {
		upload: newPieceUpload,
		pieces: mockPieces,
		decision: { mode: 'new_piece', name: '' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByRole('button', { name: 'Create new piece' })).toBeDisabled();
	}
};

export const CreateNewPieceButtonEnabledWithName: Story = {
	name: 'Test: create new piece button enabled when name is filled',
	args: {
		upload: newPieceUpload,
		pieces: mockPieces,
		decision: { mode: 'new_piece', name: 'Stoneware Mug' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByRole('button', { name: 'Create new piece' })).not.toBeDisabled();
	}
};

export const AssignPieceCallsOnConfirm: Story = {
	name: 'Test: assign to piece calls onConfirm with overridden',
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'choose_piece', selectedId: 'piece-2' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Assign to this piece' }));
		expect(args.onConfirm).toHaveBeenCalledWith('overridden', '', 'piece-2');
	}
};

export const CreateNewPieceCallsOnConfirm: Story = {
	name: 'Test: create new piece calls onConfirm with new_piece',
	args: {
		upload: newPieceUpload,
		pieces: mockPieces,
		decision: { mode: 'new_piece', name: 'Stoneware Mug' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Create new piece' }));
		expect(args.onConfirm).toHaveBeenCalledWith('new_piece', '', undefined, 'Stoneware Mug');
	}
};

// --- Viewport stories ---

export const MobileSmall: Story = {
	name: 'Viewport: small mobile (320px)',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};

export const Desktop: Story = {
	name: 'Viewport: desktop (1280px)',
	globals: { viewport: { value: 'desktop' } },
	args: {
		upload: baseUpload,
		pieces: mockPieces,
		decision: { mode: 'review' },
		onDecisionChange: fn(),
		onConfirm: fn().mockResolvedValue(undefined),
		onDismiss: fn().mockResolvedValue(undefined)
	}
};
