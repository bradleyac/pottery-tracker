import ImageGallery from '$lib/components/ImageGallery.svelte';
import type { ImageWithUrl } from '$lib/types';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import { expect, fn, userEvent, within } from 'storybook/test';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';

const mockImages: ImageWithUrl[] = [
	{
		id: 'img-1',
		piece_id: 'piece-1',
		user_id: 'user-1',
		storage_path: 'user-1/piece-1/img-1.jpg',
		uploaded_at: '2025-11-01T10:00:00Z',
		notes: null,
		is_cover: true,
		url: 'https://picsum.photos/seed/pot1/400/400'
	},
	{
		id: 'img-2',
		piece_id: 'piece-1',
		user_id: 'user-1',
		storage_path: 'user-1/piece-1/img-2.jpg',
		uploaded_at: '2025-11-15T14:30:00Z',
		notes: 'After first firing',
		is_cover: false,
		url: 'https://picsum.photos/seed/pot2/400/400'
	},
	{
		id: 'img-3',
		piece_id: 'piece-1',
		user_id: 'user-1',
		storage_path: 'user-1/piece-1/img-3.jpg',
		uploaded_at: '2025-12-01T09:15:00Z',
		notes: 'Glazed and finished',
		is_cover: false,
		url: 'https://picsum.photos/seed/pot3/400/400'
	}
];

const singleImage: ImageWithUrl[] = [mockImages[0]];

const meta = {
	title: 'Components/ImageGallery',
	component: ImageGallery,
	tags: ['autodocs'],
	argTypes: {
		ondelete: { action: 'ondelete' }
	},
	parameters: {
		viewport: {
			options: MINIMAL_VIEWPORTS
		}
	}
} satisfies Meta<typeof ImageGallery>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Visual stories ---

export const Default: Story = {
	args: {
		images: mockImages,
		ondelete: null
	}
};

export const WithDeleteHandler: Story = {
	args: {
		images: mockImages,
		ondelete: fn().mockResolvedValue(undefined)
	}
};

export const SingleImage: Story = {
	args: {
		images: singleImage,
		ondelete: null
	}
};

export const WithNotes: Story = {
	args: {
		images: mockImages.map((img) => ({ ...img, notes: 'Wheel-thrown stoneware' })),
		ondelete: null
	}
};

export const Empty: Story = {
	args: {
		images: [],
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// Gallery renders with no items — no images present
		const images = canvas.queryAllByRole('img');
		expect(images).toHaveLength(0);
	}
};

// --- Interaction tests ---

export const RendersAllImages: Story = {
	name: 'Test: renders all images in grid',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const imgs = canvas.getAllByRole('img');
		expect(imgs).toHaveLength(mockImages.length);
	}
};

export const RendersImageDates: Story = {
	name: 'Test: renders upload dates',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// formatDate('2025-11-01T10:00:00Z') → "November 1, 2025"
		expect(canvas.getByText('November 1, 2025')).toBeInTheDocument();
		expect(canvas.getByText('November 15, 2025')).toBeInTheDocument();
	}
};

export const RendersNotes: Story = {
	name: 'Test: renders notes when present',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('After first firing')).toBeInTheDocument();
		expect(canvas.getByText('Glazed and finished')).toBeInTheDocument();
	}
};

export const NoDeleteButtonsWithoutHandler: Story = {
	name: 'Test: hides delete buttons when ondelete is null',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const deleteBtns = canvas.queryAllByLabelText('Delete photo');
		expect(deleteBtns).toHaveLength(0);
	}
};

export const ShowsDeleteButtonsWithHandler: Story = {
	name: 'Test: shows delete buttons when ondelete is provided',
	args: {
		images: mockImages,
		ondelete: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const deleteBtns = canvas.getAllByLabelText('Delete photo');
		expect(deleteBtns).toHaveLength(mockImages.length);
	}
};

export const DeleteConfirmationFlow: Story = {
	name: 'Test: clicking delete shows confirmation UI',
	args: {
		images: mockImages,
		ondelete: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstDeleteBtn] = canvas.getAllByLabelText('Delete photo');
		await userEvent.click(firstDeleteBtn);

		expect(canvas.getByText('Delete this photo?')).toBeInTheDocument();
		expect(canvas.getByRole('button', { name: 'Yes, delete' })).toBeInTheDocument();
		expect(canvas.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
	}
};

export const DeleteConfirmationCancel: Story = {
	name: 'Test: cancel hides confirmation UI',
	args: {
		images: mockImages,
		ondelete: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstDeleteBtn] = canvas.getAllByLabelText('Delete photo');
		await userEvent.click(firstDeleteBtn);

		expect(canvas.getByText('Delete this photo?')).toBeInTheDocument();

		await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));

		expect(canvas.queryByText('Delete this photo?')).not.toBeInTheDocument();
	}
};

export const DeleteConfirmed: Story = {
	name: 'Test: confirming delete calls ondelete with image id',
	args: {
		images: mockImages,
		ondelete: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		const [firstDeleteBtn] = canvas.getAllByLabelText('Delete photo');
		await userEvent.click(firstDeleteBtn);
		await userEvent.click(canvas.getByRole('button', { name: 'Yes, delete' }));

		expect(args.ondelete).toHaveBeenCalledWith('img-1');
		expect(args.ondelete).toHaveBeenCalledTimes(1);
	}
};

export const LightboxOpens: Story = {
	name: 'Test: clicking image opens lightbox',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const imageButtons = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.click(imageButtons[0]);

		const dialog = canvas.getByRole('dialog');
		expect(dialog).toBeInTheDocument();
		expect(canvas.getByLabelText('Close')).toBeInTheDocument();
		// Counter shows "1 / 3"
		expect(canvas.getByText('1 / 3')).toBeInTheDocument();
	}
};

export const LightboxCloses: Story = {
	name: 'Test: close button dismisses lightbox',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstBtn] = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.click(firstBtn);

		expect(canvas.getByRole('dialog')).toBeInTheDocument();

		await userEvent.click(canvas.getByLabelText('Close'));

		expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
	}
};

export const LightboxNavigation: Story = {
	name: 'Test: next/prev buttons navigate between images',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstBtn] = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.click(firstBtn);

		expect(canvas.getByText('1 / 3')).toBeInTheDocument();

		await userEvent.click(canvas.getByLabelText('Next'));
		expect(canvas.getByText('2 / 3')).toBeInTheDocument();

		await userEvent.click(canvas.getByLabelText('Next'));
		expect(canvas.getByText('3 / 3')).toBeInTheDocument();

		await userEvent.click(canvas.getByLabelText('Previous'));
		expect(canvas.getByText('2 / 3')).toBeInTheDocument();
	}
};

export const LightboxSingleImageDisablesNav: Story = {
	name: 'Test: single image disables nav buttons',
	args: {
		images: singleImage,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [imgBtn] = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.click(imgBtn);

		expect(canvas.getByLabelText('Previous')).toBeDisabled();
		expect(canvas.getByLabelText('Next')).toBeDisabled();
	}
};

export const LightboxKeyboardClose: Story = {
	name: 'Test: Escape key closes lightbox',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstBtn] = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.click(firstBtn);

		expect(canvas.getByRole('dialog')).toBeInTheDocument();

		await userEvent.keyboard('{Escape}');

		expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
	}
};

export const LightboxKeyboardNavigation: Story = {
	name: 'Test: arrow keys navigate lightbox',
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstBtn] = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.click(firstBtn);

		expect(canvas.getByText('1 / 3')).toBeInTheDocument();

		await userEvent.keyboard('{ArrowRight}');
		expect(canvas.getByText('2 / 3')).toBeInTheDocument();

		await userEvent.keyboard('{ArrowLeft}');
		expect(canvas.getByText('1 / 3')).toBeInTheDocument();
	}
};

// --- Viewport stories ---

export const MobileSmall: Story = {
	name: 'Viewport: small mobile (320px)',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		images: mockImages,
		ondelete: null
	}
};

export const MobileLarge: Story = {
	name: 'Viewport: large mobile (414px)',
	globals: { viewport: { value: 'mobile2' } },
	args: {
		images: mockImages,
		ondelete: null
	}
};

export const Desktop: Story = {
	name: 'Viewport: desktop (1280px)',
	globals: { viewport: { value: 'desktop' } },
	args: {
		images: mockImages,
		ondelete: null
	}
};

// --- Viewport interaction tests ---

export const MobileRendersAllImages: Story = {
	name: 'Test [mobile]: renders all images',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const imgs = canvas.getAllByRole('img');
		expect(imgs).toHaveLength(mockImages.length);
	}
};

export const MobileNarrowGrid: Story = {
	name: 'Test [mobile]: grid uses narrow columns at 320px',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		// At 320px the gallery fills the full width; each item should be at most 320px wide
		const firstItem = canvasElement.querySelector('.gallery-item') as HTMLElement;
		expect(firstItem).not.toBeNull();
		const { width } = firstItem.getBoundingClientRect();
		expect(width).toBeLessThanOrEqual(320);
	}
};

export const DesktopWideGrid: Story = {
	name: 'Test [desktop]: grid shows multiple columns at 1280px',
	globals: { viewport: { value: 'desktop' } },
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		// At 1280px the grid auto-fills columns of ≥200px — at least 4 should fit
		const computed = getComputedStyle(canvasElement.querySelector('.gallery') as HTMLElement);
		const columns = computed.gridTemplateColumns.trim().split(/\s+/);
		expect(columns.length).toBeGreaterThanOrEqual(4);
	}
};

export const MobileLightboxOpens: Story = {
	name: 'Test [mobile]: tap opens lightbox and shows counter',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstBtn] = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.pointer({ keys: '[TouchA][/TouchA]', target: firstBtn });

		expect(canvas.getByRole('dialog')).toBeInTheDocument();
		expect(canvas.getByText('1 / 3')).toBeInTheDocument();
	}
};

export const MobileLightboxTapClose: Story = {
	name: 'Test [mobile]: tapping close button dismisses lightbox',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstBtn] = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.pointer({ keys: '[TouchA][/TouchA]', target: firstBtn });
		expect(canvas.getByRole('dialog')).toBeInTheDocument();

		await userEvent.pointer({ keys: '[TouchA][/TouchA]', target: canvas.getByLabelText('Close') });
		expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
	}
};

// This test documents a known gap: the delete button is hidden behind CSS :hover, which touch
// devices cannot trigger. It will fail until the component is updated to reveal the button on
// touch (e.g. via :active, a touchstart handler, or an always-visible affordance on small screens).
export const MobileDeleteButtonReachableByTouch: Story = {
	name: 'Test [mobile]: delete button is reachable by touch (requires component fix)',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		images: mockImages,
		ondelete: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const imageWrapper = canvasElement.querySelector('.image-wrapper') as HTMLElement;
		const deleteBtn = canvas.getAllByLabelText('Delete photo')[0];

		// Delete button starts hidden
		expect(deleteBtn).toBeInTheDocument();
		expect(getComputedStyle(deleteBtn).opacity).toBe('0');

		// Touch the image wrapper — on a real mobile browser the first tap triggers :active/:hover
		// and should reveal the button. Without a component-level fix this will fail.
		await userEvent.pointer({ keys: '[TouchA][/TouchA]', target: imageWrapper });
		expect(getComputedStyle(deleteBtn).opacity).toBe('1');
	}
};

export const MobileDeleteFlow: Story = {
	name: 'Test [mobile]: touch delete button, confirm deletion',
	globals: { viewport: { value: 'mobile1' } },
	args: {
		images: mockImages,
		ondelete: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		const imageWrapper = canvasElement.querySelector('.image-wrapper') as HTMLElement;
		const deleteBtn = canvas.getAllByLabelText('Delete photo')[0];

		// Touch the wrapper to reveal the delete button (depends on MobileDeleteButtonReachableByTouch passing)
		await userEvent.pointer({ keys: '[TouchA][/TouchA]', target: imageWrapper });

		// Tap the delete button
		await userEvent.pointer({ keys: '[TouchA][/TouchA]', target: deleteBtn });
		expect(canvas.getByText('Delete this photo?')).toBeInTheDocument();

		// Confirm deletion
		await userEvent.pointer({
			keys: '[TouchA][/TouchA]',
			target: canvas.getByRole('button', { name: 'Yes, delete' })
		});
		expect(args.ondelete).toHaveBeenCalledWith('img-1');
	}
};

export const DesktopDeleteFlow: Story = {
	name: 'Test [desktop]: delete confirmation flow works',
	globals: { viewport: { value: 'desktop' } },
	args: {
		images: mockImages,
		ondelete: fn().mockResolvedValue(undefined)
	},
	play: async ({ canvasElement, args }) => {
		const canvas = within(canvasElement);
		const [firstDeleteBtn] = canvas.getAllByLabelText('Delete photo');
		await userEvent.click(firstDeleteBtn);

		expect(canvas.getByText('Delete this photo?')).toBeInTheDocument();

		await userEvent.click(canvas.getByRole('button', { name: 'Cancel' }));
		expect(canvas.queryByText('Delete this photo?')).not.toBeInTheDocument();
		expect(args.ondelete).not.toHaveBeenCalled();
	}
};

export const DesktopLightboxNavigation: Story = {
	name: 'Test [desktop]: lightbox next/prev navigation',
	globals: { viewport: { value: 'desktop' } },
	args: {
		images: mockImages,
		ondelete: null
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [firstBtn] = canvas.getAllByRole('button', { name: /Pottery photo/i });
		await userEvent.click(firstBtn);

		expect(canvas.getByText('1 / 3')).toBeInTheDocument();

		await userEvent.click(canvas.getByLabelText('Next'));
		expect(canvas.getByText('2 / 3')).toBeInTheDocument();

		await userEvent.click(canvas.getByLabelText('Previous'));
		expect(canvas.getByText('1 / 3')).toBeInTheDocument();
	}
};
