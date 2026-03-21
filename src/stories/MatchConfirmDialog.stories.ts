import MatchConfirmDialog from '$lib/components/MatchConfirmDialog.svelte';
import type { MatchResultWithPiece, PieceSummary } from '$lib/types';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';

// --- Mock data ---

const matchWithPiece: MatchResultWithPiece = {
	matchedPieceId: 'piece-1',
	confidence: 0.87,
	reasoning: 'The shape and glaze match the celadon bowl.',
	suggestedName: 'Celadon Bowl #1',
	updatedDescription: '',
	matchedPieceName: 'Celadon Bowl #1',
	matchedPieceCoverUrl: 'https://picsum.photos/seed/piece1/400/400',
	storagePath: 'user-1/temp/abc.jpg'
};

const noMatch: MatchResultWithPiece = {
	matchedPieceId: null,
	confidence: 0.2,
	reasoning: 'This does not resemble any piece in the collection.',
	suggestedName: 'Stoneware Mug',
	updatedDescription: '',
	storagePath: 'user-1/temp/def.jpg'
};

const mockPieces: PieceSummary[] = [
	{ id: 'piece-1', name: 'Celadon Bowl #1', cover_url: 'https://picsum.photos/seed/p1/200/200' },
	{ id: 'piece-2', name: 'Terracotta Vase', cover_url: 'https://picsum.photos/seed/p2/200/200' },
	{ id: 'piece-3', name: 'Matte Black Mug', cover_url: null }
];

const previewUrl = 'https://picsum.photos/seed/upload1/400/400';

const meta = {
	title: 'Components/MatchConfirmDialog',
	component: MatchConfirmDialog,
	tags: ['autodocs'],
	argTypes: {
		onconfirm: { action: 'onconfirm' }
	},
	parameters: {
		viewport: {
			options: MINIMAL_VIEWPORTS
		}
	}
} satisfies Meta<typeof MatchConfirmDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Visual stories ---

export const MatchFound: Story = {
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	}
};

export const NoMatchFound: Story = {
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	}
};

export const NoPiecesNoMatch: Story = {
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: [],
		onconfirm: fn()
	}
};

// --- Test stories: review mode ---

export const ShowsMatchBadge: Story = {
	name: 'Test: shows confidence badge and piece name',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText(/87%/)).toBeInTheDocument();
		expect(canvas.getAllByText(/Celadon Bowl #1/).length).toBeGreaterThan(0);
	}
};

export const ShowsNewBadge: Story = {
	name: 'Test: shows "New piece detected" badge when no match',
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('New piece detected')).toBeInTheDocument();
	}
};

export const ShowsReasoning: Story = {
	name: 'Test: shows reasoning text',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText(matchWithPiece.reasoning)).toBeInTheDocument();
	}
};

export const ShowsPreviewImage: Story = {
	name: 'Test: preview image is in the DOM',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByAltText('Uploaded photo')).toBeInTheDocument();
	}
};

export const ShowsCoverImage: Story = {
	name: 'Test: cover image shown when matchedPieceCoverUrl is set',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(
			canvas.getByAltText(`Cover photo of ${matchWithPiece.matchedPieceName}`)
		).toBeInTheDocument();
	}
};

// --- Test stories: mode transitions ---

export const ClickAcceptCallsOnConfirm: Story = {
	name: 'Test: accept button calls onconfirm with accepted',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: /Yes, add to/i }));
		expect(args.onconfirm).toHaveBeenCalledWith('accepted', { pieceId: 'piece-1', notes: '' });
	}
};

export const ClickChooseDifferentEntersPickerMode: Story = {
	name: 'Test: "Choose a different piece" enters choose_piece mode',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Choose a different piece' }));
		expect(canvas.getByText('Choose a piece')).toBeInTheDocument();
	}
};

export const ClickThisIsNewPieceEntersNewMode: Story = {
	name: 'Test: "This is a new piece" enters new_piece mode',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'This is a new piece' }));
		expect(canvas.getByPlaceholderText(/e\.g\. Celadon Bowl/i)).toBeInTheDocument();
	}
};

export const ClickCreateNewPieceFromNoMatch: Story = {
	name: 'Test: "Create new piece" from no-match enters new_piece mode',
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Create new piece' }));
		// name input appears in new_piece mode
		const input = canvas.getByPlaceholderText(/Celadon Bowl/i);
		expect(input).toBeInTheDocument();
	}
};

export const AssignToExistingFromNoMatch: Story = {
	name: 'Test: "Assign to existing piece" from no-match enters choose_piece mode',
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Assign to existing piece' }));
		expect(canvas.getByText('Choose a piece')).toBeInTheDocument();
	}
};

// --- Test stories: choose_piece mode ---

export const PiecePickerShowsAllPieces: Story = {
	name: 'Test: piece picker shows all pieces after entering choose_piece',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Choose a different piece' }));
		expect(canvas.getByText('Celadon Bowl #1')).toBeInTheDocument();
		expect(canvas.getByText('Terracotta Vase')).toBeInTheDocument();
		expect(canvas.getByText('Matte Black Mug')).toBeInTheDocument();
	}
};

export const AssignButtonDisabledWithNoSelection: Story = {
	name: 'Test: assign button disabled when no piece selected (no-match path)',
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Assign to existing piece' }));
		expect(canvas.getByRole('button', { name: 'Assign to this piece' })).toBeDisabled();
	}
};

export const AssignButtonEnabledAfterSelection: Story = {
	name: 'Test: assign button enabled after selecting a piece',
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Assign to existing piece' }));
		await userEvent.click(canvas.getByRole('button', { name: /Terracotta Vase/i }));
		expect(canvas.getByRole('button', { name: 'Assign to this piece' })).not.toBeDisabled();
	}
};

export const ConfirmOverrideCallsOnConfirm: Story = {
	name: 'Test: selecting piece-2 and assigning calls onconfirm with overridden',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Choose a different piece' }));
		await userEvent.click(canvas.getByRole('button', { name: /Terracotta Vase/i }));
		await userEvent.click(canvas.getByRole('button', { name: 'Assign to this piece' }));
		expect(args.onconfirm).toHaveBeenCalledWith('overridden', { pieceId: 'piece-2', notes: '' });
	}
};

export const BackFromChoosePieceReturnsToReview: Story = {
	name: 'Test: Back from choose_piece returns to review',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Choose a different piece' }));
		await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
		expect(canvas.getByText(/Looks like/)).toBeInTheDocument();
	}
};

// --- Test stories: new_piece mode ---

export const CreateButtonDisabledWhenEmpty: Story = {
	name: 'Test: create button disabled when name input is empty',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'This is a new piece' }));
		const input = canvas.getByPlaceholderText(/Celadon Bowl/i);
		await userEvent.clear(input);
		expect(canvas.getByRole('button', { name: 'Create new piece' })).toBeDisabled();
	}
};

export const CreateButtonEnabledWhenFilled: Story = {
	name: 'Test: create button enabled when name is pre-populated from suggestedName',
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Create new piece' }));
		expect(canvas.getByRole('button', { name: 'Create new piece' })).not.toBeDisabled();
	}
};

export const ConfirmNewCallsOnConfirm: Story = {
	name: 'Test: creating new piece calls onconfirm with new_piece',
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Create new piece' }));
		await userEvent.click(canvas.getByRole('button', { name: 'Create new piece' }));
		expect(args.onconfirm).toHaveBeenCalledWith('new_piece', {
			newPieceName: 'Stoneware Mug',
			notes: ''
		});
	}
};

export const BackFromNewPieceReturnsToReview: Story = {
	name: 'Test: Back from new_piece returns to review',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'This is a new piece' }));
		await userEvent.click(canvas.getByRole('button', { name: 'Back' }));
		expect(canvas.getByText(/Looks like/)).toBeInTheDocument();
	}
};

// --- Test stories: notes field ---

export const NotesIncludedInCallback: Story = {
	name: 'Test: notes value is included in onconfirm callback',
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		const textarea = canvas.getByPlaceholderText(/Firing temp/i);
		await userEvent.type(textarea, 'Cone 6 electric');
		await userEvent.click(canvas.getByRole('button', { name: /Yes, add to/i }));
		expect(args.onconfirm).toHaveBeenCalledWith('accepted', {
			pieceId: 'piece-1',
			notes: 'Cone 6 electric'
		});
	}
};

// --- Viewport stories ---

// Review: match found
export const MobileSmallMatchFound: Story = {
	name: 'Viewport: mobile — review, match found',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	}
};

export const DesktopMatchFound: Story = {
	name: 'Viewport: desktop — review, match found',
	globals: { viewport: { value: 'desktop' } },
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	}
};

// Review: no match
export const MobileSmallNoMatch: Story = {
	name: 'Viewport: mobile — review, no match',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	}
};

export const DesktopNoMatch: Story = {
	name: 'Viewport: desktop — review, no match',
	globals: { viewport: { value: 'desktop' } },
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: mockPieces,
		onconfirm: fn()
	}
};

// Review: no pieces, no match
export const MobileSmallNoPieces: Story = {
	name: 'Viewport: mobile — review, no pieces',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: [],
		onconfirm: fn()
	}
};

export const DesktopNoPieces: Story = {
	name: 'Viewport: desktop — review, no pieces',
	globals: { viewport: { value: 'desktop' } },
	args: {
		previewUrl,
		matchResult: noMatch,
		pieces: [],
		onconfirm: fn()
	}
};

// choose_piece mode
export const MobileSmallChoosePiece: Story = {
	name: 'Viewport: mobile — choose_piece mode',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Choose a different piece' }));
	}
};

export const DesktopChoosePiece: Story = {
	name: 'Viewport: desktop — choose_piece mode',
	globals: { viewport: { value: 'desktop' } },
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'Choose a different piece' }));
	}
};

// new_piece mode
export const MobileSmallNewPiece: Story = {
	name: 'Viewport: mobile — new_piece mode',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'This is a new piece' }));
	}
};

export const DesktopNewPiece: Story = {
	name: 'Viewport: desktop — new_piece mode',
	globals: { viewport: { value: 'desktop' } },
	args: {
		previewUrl,
		matchResult: matchWithPiece,
		pieces: mockPieces,
		onconfirm: fn()
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole('button', { name: 'This is a new piece' }));
	}
};
