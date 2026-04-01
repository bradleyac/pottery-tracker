import PieceCard from '$lib/components/PieceCard.svelte';
import type { PieceWithCover } from '$lib/types';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import { expect, within } from 'storybook/test';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';

const basePiece: PieceWithCover = {
	id: 'piece-1',
	user_id: 'user-1',
	name: 'Wheel-thrown Bowl',
	description: 'A medium-sized stoneware bowl with a celadon glaze.',
	ai_description: null,
	created_at: '2025-10-01T10:00:00Z',
	updated_at: new Date().toISOString(),
	cover_image_id: 'img-1',
	cover_embedding: null,
	cover_url: 'https://picsum.photos/seed/bowl/400/400'
};

const noCoverPiece: PieceWithCover = { ...basePiece, id: 'piece-2', cover_url: null };
const noDescriptionPiece: PieceWithCover = { ...basePiece, id: 'piece-3', description: null };
const longNamePiece: PieceWithCover = {
	...basePiece,
	id: 'piece-4',
	name: 'Very Long Piece Name That Should Be Truncated With Ellipsis'
};

const meta = {
	title: 'Components/PieceCard',
	component: PieceCard,
	tags: ['autodocs'],
	parameters: {
		viewport: {
			options: MINIMAL_VIEWPORTS
		}
	}
} satisfies Meta<typeof PieceCard>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Visual stories ---

export const Default: Story = {
	args: { piece: basePiece }
};

export const NoCoverImage: Story = {
	args: { piece: noCoverPiece }
};

export const NoDescription: Story = {
	args: { piece: noDescriptionPiece }
};

export const LongName: Story = {
	args: { piece: longNamePiece }
};

// --- Test stories ---

export const RendersPieceName: Story = {
	name: 'Test: renders piece name',
	args: { piece: basePiece },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('Wheel-thrown Bowl')).toBeInTheDocument();
	}
};

export const CardLinksToDetail: Story = {
	name: 'Test: card links to piece detail page',
	args: { piece: basePiece },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const link = canvas.getByRole('link', { name: /Wheel-thrown Bowl/i });
		expect(link).toBeInTheDocument();
		expect(link).toHaveAttribute('href', '/pieces/piece-1');
	}
};

export const ShowsCoverImage: Story = {
	name: 'Test: shows cover image when cover_url is set',
	args: { piece: basePiece },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const img = canvas.getByRole('img', { name: 'Wheel-thrown Bowl' });
		expect(img).toBeInTheDocument();
		expect(img).toHaveAttribute('src', basePiece.cover_url);
	}
};

export const ShowsPlaceholder: Story = {
	name: 'Test: shows placeholder when cover_url is null',
	args: { piece: noCoverPiece },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.queryByRole('img')).not.toBeInTheDocument();
		expect(canvas.getByText('No photo yet')).toBeInTheDocument();
	}
};

export const ShowsDescription: Story = {
	name: 'Test: shows description when present',
	args: { piece: basePiece },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(
			canvas.getByText('A medium-sized stoneware bowl with a celadon glaze.')
		).toBeInTheDocument();
	}
};

export const HidesDescription: Story = {
	name: 'Test: hides description when null',
	args: { piece: noDescriptionPiece },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(
			canvas.queryByText('A medium-sized stoneware bowl with a celadon glaze.')
		).not.toBeInTheDocument();
	}
};

export const ShowsRelativeDate: Story = {
	name: 'Test: shows relative date',
	args: { piece: basePiece },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('Today')).toBeInTheDocument();
	}
};

// --- Viewport stories ---

export const MobileSmall: Story = {
	name: 'Viewport: small mobile (320px)',
	globals: { viewport: { value: 'mobile1' } },
	args: { piece: basePiece }
};

export const Desktop: Story = {
	name: 'Viewport: desktop (1280px)',
	globals: { viewport: { value: 'desktop' } },
	args: { piece: basePiece }
};
