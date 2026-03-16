import "clsx";
import { e as escape_html } from "../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/root.js";
import "../../chunks/state.svelte.js";
function NavBar($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { user } = $$props;
    $$renderer2.push(`<nav class="navbar svelte-q971rm"><div class="navbar-inner svelte-q971rm"><a href="/" class="brand svelte-q971rm"><span class="brand-icon svelte-q971rm">🏺</span> <span class="brand-name">Pottery Tracker</span></a> <div class="nav-links svelte-q971rm"><a href="/" class="nav-link svelte-q971rm">My Pieces</a> <a href="/upload" class="nav-link upload-btn svelte-q971rm">+ Upload Photo</a></div> <div class="nav-user svelte-q971rm">`);
    if (user) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="user-email svelte-q971rm">${escape_html(user.email)}</span> <form method="POST" action="/auth?/logout"><button type="submit" class="logout-btn svelte-q971rm">Sign out</button></form>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div></nav>`);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, children } = $$props;
    $$renderer2.push(`<div class="app svelte-12qhfyh">`);
    if (data.session) {
      $$renderer2.push("<!--[0-->");
      NavBar($$renderer2, { user: data.user });
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <main class="main-content svelte-12qhfyh">`);
    children($$renderer2);
    $$renderer2.push(`<!----></main></div>`);
  });
}
export {
  _layout as default
};
