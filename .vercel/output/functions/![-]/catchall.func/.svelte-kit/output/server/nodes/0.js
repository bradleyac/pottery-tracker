import * as universal from '../entries/pages/_layout.ts.js';
import * as server from '../entries/pages/_layout.server.ts.js';

export const index = 0;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/pages/_layout.svelte.js')).default;
export { universal };
export const universal_id = "src/routes/+layout.ts";
export { server };
export const server_id = "src/routes/+layout.server.ts";
export const imports = ["_app/immutable/nodes/0.DQ699BY4.js","_app/immutable/chunks/WrfJn8Ne.js","_app/immutable/chunks/CZVOyuXN.js","_app/immutable/chunks/DkOTxvtt.js","_app/immutable/chunks/BWxYbWZ2.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/MNgn2XKp.js","_app/immutable/chunks/DRRjdx4M.js"];
export const stylesheets = ["_app/immutable/assets/0.Ci92TjEk.css"];
export const fonts = [];
