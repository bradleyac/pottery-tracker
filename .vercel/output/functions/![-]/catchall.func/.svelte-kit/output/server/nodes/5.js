import * as server from '../entries/pages/upload/_page.server.ts.js';

export const index = 5;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/upload/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/upload/+page.server.ts";
export const imports = ["_app/immutable/nodes/5.DCWSor7z.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/DkOTxvtt.js","_app/immutable/chunks/MNgn2XKp.js","_app/immutable/chunks/DhfA7EE0.js","_app/immutable/chunks/CVsxSqJP.js","_app/immutable/chunks/EnjA4lWA.js","_app/immutable/chunks/WgCdTky8.js","_app/immutable/chunks/BWxYbWZ2.js","_app/immutable/chunks/CZVOyuXN.js"];
export const stylesheets = ["_app/immutable/assets/5.BMqrHh8M.css"];
export const fonts = [];
