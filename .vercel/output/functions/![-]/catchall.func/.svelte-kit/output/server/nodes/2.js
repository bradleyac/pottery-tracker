import * as server from '../entries/pages/_page.server.ts.js';

export const index = 2;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/+page.server.ts";
export const imports = ["_app/immutable/nodes/2.BHFr5rNf.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/DkOTxvtt.js","_app/immutable/chunks/MNgn2XKp.js","_app/immutable/chunks/WgCdTky8.js","_app/immutable/chunks/DhfA7EE0.js"];
export const stylesheets = ["_app/immutable/assets/2.C3Syqrn2.css"];
export const fonts = [];
