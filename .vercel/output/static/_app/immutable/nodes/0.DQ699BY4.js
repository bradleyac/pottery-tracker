import{c as q}from"../chunks/WrfJn8Ne.js";import"../chunks/Bzak7iHL.js";import{H as T,am as A,p as _,g as i,s as d,r as l,b as v,c as k,aD as N,t as w,k as R,f as m}from"../chunks/DkOTxvtt.js";import{B as C,i as y}from"../chunks/MNgn2XKp.js";import{a as I,e as O}from"../chunks/DRRjdx4M.js";function j(e,a,...s){var t=new C(e);T(()=>{const r=a()??null;t.ensure(r,r&&(o=>r(o,...s)))},A)}const b="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".split(""),g=` 	
\r=`.split("");(()=>{const e=new Array(128);for(let a=0;a<e.length;a+=1)e[a]=-1;for(let a=0;a<g.length;a+=1)e[g[a].charCodeAt(0)]=-2;for(let a=0;a<b.length;a+=1)e[b[a].charCodeAt(0)]=a;return e})();function B(e,a,s){throw new Error(`@supabase/ssr: Your project's URL and API key are required to create a Supabase client!

Check your Supabase project's API settings to find these values

https://supabase.com/dashboard/project/_/settings/api`)}var c={};if(typeof process<"u"&&(c!=null&&c.npm_package_name)){const e=c.npm_package_name;["@supabase/auth-helpers-nextjs","@supabase/auth-helpers-react","@supabase/auth-helpers-remix","@supabase/auth-helpers-sveltekit"].includes(e)&&console.warn(`
╔════════════════════════════════════════════════════════════════════════════╗
║ ⚠️  IMPORTANT: Package Consolidation Notice                                ║
║                                                                            ║
║ The ${e.padEnd(35)} package name is deprecated.  ║
║                                                                            ║
║ You are now using @supabase/ssr - a unified solution for all frameworks.  ║
║                                                                            ║
║ The auth-helpers packages have been consolidated into @supabase/ssr       ║
║ to provide better maintenance and consistent APIs across frameworks.      ║
║                                                                            ║
║ Please update your package.json to use @supabase/ssr directly:            ║
║   npm uninstall ${e.padEnd(42)} ║
║   npm install @supabase/ssr                                               ║
║                                                                            ║
║ For more information, visit:                                              ║
║ https://supabase.com/docs/guides/auth/server-side                         ║
╚════════════════════════════════════════════════════════════════════════════╝
    `)}function U(){return B()}const x=async({data:e,depends:a})=>{a("supabase:auth");const s=U();return s&&s.auth.onAuthStateChange(t=>{(t==="SIGNED_IN"||t==="SIGNED_OUT"||t==="TOKEN_REFRESHED")&&q("supabase:auth")}),{supabase:s,session:e.session,user:e.user}},J=Object.freeze(Object.defineProperty({__proto__:null,load:x},Symbol.toStringTag,{value:"Module"}));var M=m('<span class="user-email svelte-q971rm"> </span> <form method="POST" action="/auth?/logout"><button type="submit" class="logout-btn svelte-q971rm">Sign out</button></form>',1),D=m('<nav class="navbar svelte-q971rm"><div class="navbar-inner svelte-q971rm"><a href="/" class="brand svelte-q971rm"><span class="brand-icon svelte-q971rm">🏺</span> <span class="brand-name">Pottery Tracker</span></a> <div class="nav-links svelte-q971rm"><a href="/" class="nav-link svelte-q971rm">My Pieces</a> <a href="/upload" class="nav-link upload-btn svelte-q971rm">+ Upload Photo</a></div> <div class="nav-user svelte-q971rm"><!></div></div></nav>');function F(e,a){_(a,!0);var s=D(),t=i(s),r=d(i(t),4),o=i(r);{var u=n=>{var h=M(),p=N(h),E=i(p,!0);l(p);var P=d(p,2);I(P,S=>{var f;return(f=O)==null?void 0:f(S)}),w(()=>R(E,a.user.email)),v(n,h)};y(o,n=>{a.user&&n(u)})}l(r),l(t),l(s),v(e,s),k()}var G=m('<div class="app svelte-12qhfyh"><!> <main class="main-content svelte-12qhfyh"><!></main></div>');function Q(e,a){_(a,!0);var s=G(),t=i(s);{var r=n=>{F(n,{get user(){return a.data.user}})};y(t,n=>{a.data.session&&n(r)})}var o=d(t,2),u=i(o);j(u,()=>a.children),l(o),l(s),v(e,s),k()}export{Q as component,J as universal};
