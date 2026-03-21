import NavBar from '$lib/components/NavBar.svelte';
import type { User } from '@supabase/supabase-js';
import type { Meta, StoryObj } from '@storybook/sveltekit';
import { expect, within } from 'storybook/test';
import { MINIMAL_VIEWPORTS } from 'storybook/viewport';

const mockUser = { id: 'user-1', email: 'potter@example.com' } as User;
const longEmailUser = { id: 'user-2', email: 'andrew.charles.bradley@gmail.com' } as User;

const meta = {
	title: 'Components/NavBar',
	component: NavBar,
	tags: ['autodocs'],
	parameters: {
		viewport: {
			options: MINIMAL_VIEWPORTS
		}
	}
} satisfies Meta<typeof NavBar>;

export default meta;
type Story = StoryObj<typeof meta>;

// --- Visual stories ---

export const LoggedOut: Story = {
	args: {
		user: null,
		pendingCount: 0
	}
};

export const LoggedIn: Story = {
	args: {
		user: mockUser,
		pendingCount: 0
	}
};

export const WithPending: Story = {
	args: {
		user: mockUser,
		pendingCount: 3
	}
};

// --- Test stories ---

export const RendersBrandLink: Story = {
	name: 'Test: renders brand link',
	args: { user: null, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const brand = canvas.getByText('Pottery Tracker');
		expect(brand).toBeInTheDocument();
		expect(brand.closest('a')).toHaveAttribute('href', '/');
	}
};

export const RendersNavLinks: Story = {
	name: 'Test: always shows My Pieces and Upload Photo links',
	args: { user: null, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const myPieces = canvas.getByRole('link', { name: 'My Pieces' });
		expect(myPieces).toBeInTheDocument();
		expect(myPieces).toHaveAttribute('href', '/');

		const upload = canvas.getByRole('link', { name: '+ Upload Photo' });
		expect(upload).toBeInTheDocument();
		expect(upload).toHaveAttribute('href', '/upload');
	}
};

export const HidesReviewLinkWhenNoPending: Story = {
	name: 'Test: hides review link when pendingCount is 0',
	args: { user: null, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.queryByRole('link', { name: /Review/i })).not.toBeInTheDocument();
	}
};

export const ShowsReviewLinkWithBadge: Story = {
	name: 'Test: shows review link and badge when pendingCount > 0',
	args: { user: null, pendingCount: 3 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const reviewLink = canvas.getByRole('link', { name: /Review/i });
		expect(reviewLink).toBeInTheDocument();
		expect(reviewLink).toHaveAttribute('href', '/review');
		expect(canvas.getByText('3')).toBeInTheDocument();
	}
};

export const ShowsUserWhenLoggedIn: Story = {
	name: 'Test: shows user email and sign out when logged in',
	args: { user: mockUser, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('potter@example.com')).toBeInTheDocument();
		expect(canvas.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
	}
};

export const HidesUserSectionWhenLoggedOut: Story = {
	name: 'Test: hides user section when logged out',
	args: { user: null, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.queryByText('potter@example.com')).not.toBeInTheDocument();
		expect(canvas.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
	}
};

// --- Viewport stories ---

export const MobileSmall: Story = {
	name: 'Viewport: small mobile (320px)',
	globals: { viewport: { value: 'mobile1' } },
	args: { user: mockUser, pendingCount: 3 }
};

export const Desktop: Story = {
	name: 'Viewport: desktop (1280px)',
	globals: { viewport: { value: 'desktop' } },
	args: { user: mockUser, pendingCount: 3 }
};

// --- Viewport test stories ---

export const MobileHidesEmail: Story = {
	name: 'Test [mobile]: hides user email at narrow viewport',
	globals: { viewport: { value: 'mobile1' } },
	args: { user: mockUser, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		const emailEl = canvasElement.querySelector('.user-email') as HTMLElement | null;
		expect(emailEl).not.toBeNull();
		const display = getComputedStyle(emailEl!).display;
		expect(display).toBe('none');
	}
};

export const DesktopShowsEmail: Story = {
	name: 'Test [desktop]: shows user email',
	globals: { viewport: { value: 'desktop' } },
	args: { user: mockUser, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('potter@example.com')).toBeInTheDocument();
		const emailEl = canvasElement.querySelector('.user-email') as HTMLElement | null;
		expect(emailEl).not.toBeNull();
		const display = getComputedStyle(emailEl!).display;
		expect(display).not.toBe('none');
	}
};

// --- Long email regression tests ---

export const LongEmailDesktop: Story = {
	name: 'Viewport: long email at desktop (1280px)',
	globals: { viewport: { value: 'desktop' } },
	args: { user: longEmailUser, pendingCount: 0 }
};

export const LongEmailNotTruncatedAtDesktop: Story = {
	name: 'Test [desktop]: long email is not truncated when space is available',
	globals: { viewport: { value: 'desktop' } },
	args: { user: longEmailUser, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		expect(canvas.getByText('andrew.charles.bradley@gmail.com')).toBeInTheDocument();
		const emailEl = canvasElement.querySelector('.user-email') as HTMLElement;
		// Text should fit without overflow — scrollWidth should not exceed offsetWidth
		expect(emailEl.scrollWidth).toBeLessThanOrEqual(emailEl.offsetWidth);
	}
};

export const LongEmailTruncatedWhenTooNarrow: Story = {
	name: 'Test [mobile2]: long email truncates when viewport is 414px',
	globals: { viewport: { value: 'mobile2' } },
	args: { user: longEmailUser, pendingCount: 0 },
	play: async ({ canvasElement }) => {
		// On mobile2 (414px) the email is hidden via CSS — confirm it's not visible
		const emailEl = canvasElement.querySelector('.user-email') as HTMLElement | null;
		expect(emailEl).not.toBeNull();
		const display = getComputedStyle(emailEl!).display;
		expect(display).toBe('none');
	}
};
