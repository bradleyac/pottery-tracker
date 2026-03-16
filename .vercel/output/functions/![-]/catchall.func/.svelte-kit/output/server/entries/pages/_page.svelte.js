import { a as attr, s as stringify, e as escape_html, h as head, b as ensure_array_like } from "../../chunks/index2.js";
import { f as formatRelativeDate } from "../../chunks/utils2.js";
function PieceCard($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { piece } = $$props;
    $$renderer2.push(`<a${attr("href", `/pieces/${stringify(piece.id)}`)} class="piece-card svelte-fojkdg"><div class="piece-image svelte-fojkdg">`);
    if (piece.cover_url) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<img${attr("src", piece.cover_url)}${attr("alt", piece.name)} loading="lazy" class="svelte-fojkdg"/>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="no-image svelte-fojkdg"><span class="svelte-fojkdg">🏺</span> <p class="svelte-fojkdg">No photo yet</p></div>`);
    }
    $$renderer2.push(`<!--]--></div> <div class="piece-info svelte-fojkdg"><h3 class="piece-name svelte-fojkdg">${escape_html(piece.name)}</h3> `);
    if (piece.description) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<p class="piece-description svelte-fojkdg">${escape_html(piece.description)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <p class="piece-date svelte-fojkdg">${escape_html(formatRelativeDate(piece.updated_at))}</p></div></a>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    head("1uha8ag", $$renderer2, ($$renderer3) => {
      $$renderer3.title(($$renderer4) => {
        $$renderer4.push(`<title>My Pieces — Pottery Tracker</title>`);
      });
    });
    $$renderer2.push(`<div class="dashboard"><div class="dashboard-header svelte-1uha8ag"><div><h1 class="svelte-1uha8ag">My Pieces</h1> <p class="subtitle svelte-1uha8ag">${escape_html(data.pieces.length === 0 ? "No pieces yet" : `${data.pieces.length} piece${data.pieces.length === 1 ? "" : "s"}`)}</p></div> <a href="/upload" class="upload-btn svelte-1uha8ag">+ Upload Photo</a></div> `);
    if (data.pieces.length === 0) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="empty-state svelte-1uha8ag"><span class="empty-icon svelte-1uha8ag">🏺</span> <h2 class="svelte-1uha8ag">No pieces yet</h2> <p class="svelte-1uha8ag">Upload your first photo to start tracking your pottery journey.</p> <a href="/upload" class="btn-primary svelte-1uha8ag">Upload a photo</a></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`<div class="pieces-grid svelte-1uha8ag"><!--[-->`);
      const each_array = ensure_array_like(data.pieces);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let piece = each_array[$$index];
        PieceCard($$renderer2, { piece });
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}
export {
  _page as default
};
