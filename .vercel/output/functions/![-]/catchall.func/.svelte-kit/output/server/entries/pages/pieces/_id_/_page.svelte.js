import { b as ensure_array_like, a as attr, e as escape_html, s as stringify, h as head, d as derived } from "../../../../chunks/index2.js";
import { a as formatDate } from "../../../../chunks/utils2.js";
function ImageGallery($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { images } = $$props;
    $$renderer2.push(`<div class="gallery svelte-geoysn"><!--[-->`);
    const each_array = ensure_array_like(images);
    for (let i = 0, $$length = each_array.length; i < $$length; i++) {
      let image = each_array[i];
      $$renderer2.push(`<div class="gallery-item svelte-geoysn"><button class="image-btn svelte-geoysn"><img${attr("src", image.url)}${attr("alt", `Pottery photo ${stringify(i + 1)}`)} loading="lazy" class="svelte-geoysn"/></button> <div class="image-meta svelte-geoysn"><span class="image-date svelte-geoysn">${escape_html(formatDate(image.uploaded_at))}</span> `);
      if (image.notes) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<span class="image-notes svelte-geoysn">${escape_html(image.notes)}</span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div></div>`);
    }
    $$renderer2.push(`<!--]--></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let piece = derived(() => data.piece);
    head("w0kh60", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>${escape_html(piece().name)} — Pottery Tracker</title>`);
      });
    });
    $$renderer2.push(`<div class="piece-page svelte-w0kh60"><div class="piece-header svelte-w0kh60"><div class="breadcrumb svelte-w0kh60"><a href="/" class="svelte-w0kh60">My Pieces</a> <span>›</span> <span>${escape_html(piece().name)}</span></div> <div class="piece-title-row svelte-w0kh60"><h1 class="svelte-w0kh60">${escape_html(piece().name)}</h1> <a href="/upload" class="upload-btn svelte-w0kh60">+ Add Photo</a></div> `);
    if (piece().description) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="piece-description svelte-w0kh60">${escape_html(piece().description)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="piece-meta svelte-w0kh60"><span>Started ${escape_html(formatDate(piece().created_at))}</span> <span>·</span> <span>${escape_html(piece().images.length)} photo${escape_html(piece().images.length === 1 ? "" : "s")}</span></div></div> `);
    if (piece().images.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="empty-images svelte-w0kh60"><p>No photos yet.</p> <a href="/upload" class="btn-primary svelte-w0kh60">Upload a photo</a></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<section class="timeline-section svelte-w0kh60"><h2 class="svelte-w0kh60">Photo Timeline</h2> `);
      ImageGallery($$renderer2, { images: piece().images });
      $$renderer2.push(`<!----></section>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
