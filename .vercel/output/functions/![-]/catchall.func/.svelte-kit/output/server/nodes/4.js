import * as server from '../entries/pages/pieces/_id_/_page.server.ts.js';

export const index = 4;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/pieces/_id_/_page.svelte.js')).default;
export { server };
export const server_id = "src/routes/pieces/[id]/+page.server.ts";
export const imports = ["_app/immutable/nodes/4.BqWhbVEN.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/DkOTxvtt.js","_app/immutable/chunks/MNgn2XKp.js","_app/immutable/chunks/DhfA7EE0.js","_app/immutable/chunks/WgCdTky8.js"];
export const stylesheets = ["_app/immutable/assets/4.DofDrDmP.css"];
export const fonts = [];
