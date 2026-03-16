import { h as head, c as attr_class, e as escape_html, a as attr } from "../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { form } = $$props;
    let activeTab = "login";
    let loading = false;
    head("1s728sz", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Sign in — Pottery Tracker</title>`);
      });
    });
    $$renderer2.push(`<div class="auth-container svelte-1s728sz"><div class="auth-card svelte-1s728sz"><div class="logo svelte-1s728sz"><span class="logo-icon svelte-1s728sz">🏺</span> <h1 class="svelte-1s728sz">Pottery Tracker</h1> <p class="svelte-1s728sz">Track your pieces from clay to kiln</p></div> <div class="tabs svelte-1s728sz"><button${attr_class("tab svelte-1s728sz", void 0, { "active": activeTab === "login" })}>Sign in</button> <button${attr_class("tab svelte-1s728sz", void 0, { "active": activeTab === "signup" })}>Sign up</button></div> `);
    if (form?.message) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div${attr_class("alert svelte-1s728sz", void 0, { "success": form.success, "error": !form.success })}>${escape_html(form.message)}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<form method="POST" action="?/login"><div class="field svelte-1s728sz"><label for="login-email" class="svelte-1s728sz">Email</label> <input id="login-email" name="email" type="email" required="" autocomplete="email"${attr("value", form?.email ?? "")} placeholder="potter@example.com" class="svelte-1s728sz"/></div> <div class="field svelte-1s728sz"><label for="login-password" class="svelte-1s728sz">Password</label> <input id="login-password" name="password" type="password" required="" autocomplete="current-password" placeholder="••••••••" class="svelte-1s728sz"/></div> <button type="submit" class="btn-primary svelte-1s728sz"${attr("disabled", loading, true)}>${escape_html("Sign in")}</button></form>`);
    }
    $$renderer2.push(`<!--]--></div></div>`);
  });
}
export {
  _page as default
};
