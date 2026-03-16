import { c as attr_class, a as attr, h as head } from "../../../chunks/index2.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/root.js";
import "../../../chunks/state.svelte.js";
function UploadDropzone($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { disabled = false } = $$props;
    let dragging = false;
    $$renderer2.push(`<div${attr_class("dropzone svelte-1uqubm6", void 0, { "dragging": dragging, "disabled": disabled })} role="button"${attr("tabindex", disabled ? -1 : 0)} aria-label="Upload pottery photo"><input type="file" accept="image/*" class="hidden-input svelte-1uqubm6"${attr("disabled", disabled, true)}/> <div class="dropzone-content svelte-1uqubm6"><span class="dropzone-icon svelte-1uqubm6">📷</span> <p class="dropzone-title svelte-1uqubm6">Drop a photo here</p> <p class="dropzone-hint svelte-1uqubm6">or click to browse — JPEG, PNG, WebP</p></div></div>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    head("tziouu", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>Upload Photo — Pottery Tracker</title>`);
      });
    });
    $$renderer2.push(`<div class="upload-page svelte-tziouu"><div class="page-header svelte-tziouu"><h1 class="svelte-tziouu">Upload a Photo</h1> <p class="svelte-tziouu">Claude will identify your piece or create a new one</p></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[0-->");
      UploadDropzone($$renderer2, {});
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
