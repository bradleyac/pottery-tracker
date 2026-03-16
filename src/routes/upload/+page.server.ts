import type { PageServerLoad } from './$types';

// No server-side data needed for the upload page;
// the wizard uses client-side fetch to /api/upload
export const load: PageServerLoad = async () => {
	return {};
};
