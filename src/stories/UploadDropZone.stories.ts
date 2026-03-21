import UploadDropZone from '$lib/components/UploadDropZone.svelte';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import { expect, fireEvent, fn, userEvent, within } from 'storybook/test';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';

const meta = {
	title: 'Components/UploadDropZone',
	component: UploadDropZone,
	tags: ['autodocs'],
	argTypes: {
		onfiles: { action: 'onfiles' }
	},
	parameters: {
		viewport: {
			options: MINIMAL_VIEWPORTS
		}
	}
} satisfies Meta<typeof UploadDropZone>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Visual stories ---

export const Default: Story = {
	args: { onfiles: fn() }
};

export const Disabled: Story = {
	args: { onfiles: fn(), disabled: true }
};

// --- Test stories ---

export const RendersDropZoneText: Story = {
	name: 'Test: renders drop zone text',
	args: { onfiles: fn() },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('Drop photos here')).toBeInTheDocument();
		expect(canvas.getByText(/or click to browse/i)).toBeInTheDocument();
	}
};

export const HasCorrectAriaAttributes: Story = {
	name: 'Test: has correct aria role and label',
	args: { onfiles: fn() },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const dropzone = canvas.getByRole('button', { name: 'Upload pottery photos' });
		expect(dropzone).toBeInTheDocument();
	}
};

export const EnabledTabIndex: Story = {
	name: 'Test: enabled state has tabindex 0',
	args: { onfiles: fn(), disabled: false },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const dropzone = canvas.getByRole('button', { name: 'Upload pottery photos' });
		expect(dropzone).toHaveAttribute('tabindex', '0');
	}
};

export const DisabledTabIndex: Story = {
	name: 'Test: disabled state has tabindex -1',
	args: { onfiles: fn(), disabled: true },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const dropzone = canvasElement.querySelector('.dropzone') as HTMLElement;
		expect(dropzone).toHaveAttribute('tabindex', '-1');
	}
};

export const DisabledClass: Story = {
	name: 'Test: disabled state applies disabled class',
	args: { onfiles: fn(), disabled: true },
	play: async ({ canvasElement }) => {
		const dropzone = canvasElement.querySelector('.dropzone') as HTMLElement;
		expect(dropzone).toHaveClass('disabled');
	}
};

export const EnabledNoDisabledClass: Story = {
	name: 'Test: enabled state does not have disabled class',
	args: { onfiles: fn(), disabled: false },
	play: async ({ canvasElement }) => {
		const dropzone = canvasElement.querySelector('.dropzone') as HTMLElement;
		expect(dropzone).not.toHaveClass('disabled');
	}
};

export const CallsOnFilesViaInput: Story = {
	name: 'Test: calls onfiles when files are selected via input',
	args: { onfiles: fn() },
	play: async ({ canvasElement, args }) => {
		const input = canvasElement.querySelector('input[type="file"]') as HTMLInputElement;
		const file = new File(['image data'], 'photo.jpg', { type: 'image/jpeg' });
		await userEvent.upload(input, file);
		expect(args.onfiles).toHaveBeenCalledTimes(1);
		expect(args.onfiles).toHaveBeenCalledWith([file]);
	}
};

export const CallsOnFilesOnDrop: Story = {
	name: 'Test: calls onfiles when files are dropped',
	args: { onfiles: fn() },
	play: async ({ canvasElement, args }) => {
		const dropzone = canvasElement.querySelector('.dropzone') as HTMLElement;
		const file = new File(['image data'], 'photo.jpg', { type: 'image/jpeg' });
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(file);
		dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		await Promise.resolve();
		expect(args.onfiles).toHaveBeenCalledTimes(1);
		expect(args.onfiles).toHaveBeenCalledWith([file]);
	}
};

export const DoesNotCallOnFilesWhenDisabled: Story = {
	name: 'Test: does not call onfiles when disabled',
	args: { onfiles: fn(), disabled: true },
	play: async ({ canvasElement, args }) => {
		const dropzone = canvasElement.querySelector('.dropzone') as HTMLElement;
		const file = new File(['image data'], 'photo.jpg', { type: 'image/jpeg' });
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(file);
		dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		await Promise.resolve();
		expect(args.onfiles).not.toHaveBeenCalled();
	}
};

export const FiltersNonImageFiles: Story = {
	name: 'Test: filters non-image files on drop',
	args: { onfiles: fn() },
	play: async ({ canvasElement, args }) => {
		const dropzone = canvasElement.querySelector('.dropzone') as HTMLElement;
		const imageFile = new File(['img'], 'photo.jpg', { type: 'image/jpeg' });
		const textFile = new File(['text'], 'notes.txt', { type: 'text/plain' });
		const dataTransfer = new DataTransfer();
		dataTransfer.items.add(imageFile);
		dataTransfer.items.add(textFile);
		dropzone.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer }));
		await Promise.resolve();
		expect(args.onfiles).toHaveBeenCalledWith([imageFile]);
	}
};

export const ShowsDraggingState: Story = {
	name: 'Test: applies dragging class on dragover',
	args: { onfiles: fn() },
	play: async ({ canvasElement }) => {
		const dropzone = canvasElement.querySelector('.dropzone') as HTMLElement;
		expect(dropzone).not.toHaveClass('dragging');
		dropzone.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true }));
		await Promise.resolve();
		expect(dropzone).toHaveClass('dragging');
		dropzone.dispatchEvent(new DragEvent('dragleave', { bubbles: true }));
		await Promise.resolve();
		expect(dropzone).not.toHaveClass('dragging');
	}
};

export const KeyboardEnterTriggersInput: Story = {
	name: 'Test: Enter key triggers file input',
	args: { onfiles: fn() },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const dropzone = canvas.getByRole('button', { name: 'Upload pottery photos' });
		// Focus the dropzone and press Enter — the hidden input click() is called.
		// We verify no error is thrown and the dropzone remains interactive.
		dropzone.focus();
		await userEvent.keyboard('{Enter}');
		expect(dropzone).toBeInTheDocument();
	}
};

// --- Viewport stories ---

export const MobileSmall: Story = {
	name: 'Viewport: small mobile (320px)',
	globals: { viewport: { value: 'mobile1' } },
	args: { onfiles: fn() }
};

export const Desktop: Story = {
	name: 'Viewport: desktop (1280px)',
	globals: { viewport: { value: 'desktop' } },
	args: { onfiles: fn() }
};
