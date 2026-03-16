import * as server from '../entries/pages/auth/_page.server.ts.js';

export const index = 3;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/auth/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/auth/+page.server.ts";
export const imports = ["_app/immutable/nodes/3.DMaPnuio.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/DkOTxvtt.js","_app/immutable/chunks/MNgn2XKp.js","_app/immutable/chunks/DhfA7EE0.js","_app/immutable/chunks/DRRjdx4M.js","_app/immutable/chunks/WrfJn8Ne.js","_app/immutable/chunks/CZVOyuXN.js","_app/immutable/chunks/BWxYbWZ2.js","_app/immutable/chunks/CVsxSqJP.js"];
export const stylesheets = ["_app/immutable/assets/3.AsOwNy9F.css"];
export const fonts = [];
