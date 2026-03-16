export const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.DMaJjyfk.js",app:"_app/immutable/entry/app.B3IwbgqV.js",imports:["_app/immutable/entry/start.DMaJjyfk.js","_app/immutable/chunks/WrfJn8Ne.js","_app/immutable/chunks/CZVOyuXN.js","_app/immutable/chunks/DkOTxvtt.js","_app/immutable/chunks/BWxYbWZ2.js","_app/immutable/entry/app.B3IwbgqV.js","_app/immutable/chunks/DkOTxvtt.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CZVOyuXN.js","_app/immutable/chunks/MNgn2XKp.js","_app/immutable/chunks/EnjA4lWA.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('../output/server/nodes/0.js')),
			__memo(() => import('../output/server/nodes/1.js')),
			__memo(() => import('../output/server/nodes/2.js')),
			__memo(() => import('../output/server/nodes/3.js')),
			__memo(() => import('../output/server/nodes/4.js')),
			__memo(() => import('../output/server/nodes/5.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			},
			{
				id: "/api/matches",
				pattern: /^\/api\/matches\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/matches/_server.ts.js'))
			},
			{
				id: "/api/pieces",
				pattern: /^\/api\/pieces\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/pieces/_server.ts.js'))
			},
			{
				id: "/api/pieces/[id]/images",
				pattern: /^\/api\/pieces\/([^/]+?)\/images\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/pieces/_id_/images/_server.ts.js'))
			},
			{
				id: "/api/upload",
				pattern: /^\/api\/upload\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/api/upload/_server.ts.js'))
			},
			{
				id: "/auth",
				pattern: /^\/auth\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 3 },
				endpoint: null
			},
			{
				id: "/auth/callback",
				pattern: /^\/auth\/callback\/?$/,
				params: [],
				page: null,
				endpoint: __memo(() => import('../output/server/entries/endpoints/auth/callback/_server.ts.js'))
			},
			{
				id: "/pieces/[id]",
				pattern: /^\/pieces\/([^/]+?)\/?$/,
				params: [{"name":"id","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,], errors: [1,], leaf: 4 },
				endpoint: null
			},
			{
				id: "/upload",
				pattern: /^\/upload\/?$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 5 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();
