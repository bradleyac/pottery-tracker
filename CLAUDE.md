# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run check        # TypeScript + Svelte type checking
npm run lint         # Prettier + ESLint check
npm run format       # Auto-format with Prettier

# Tests (three separate projects)
npx vitest run --project server    # Node unit tests (src/**/*.{test,spec}.{js,ts})
npx vitest run --project client    # Browser component tests (src/**/*.svelte.{test,spec}.{js,ts})
npx vitest run --project storybook # Storybook interaction tests (src/stories/)

npm run storybook    # Run Storybook dev server on port 6006
```

To run a single test file: `npx vitest run --project storybook src/stories/ImageGallery.stories.ts`

## Architecture

This is a pottery-tracking app. Users upload photos; Claude Vision matches them to existing pieces or identifies new ones. The key flow:

1. **Upload** (`/upload`) → `POST /api/upload` → stores image in `pottery-images` bucket at `{user_id}/temp/{uuid}.jpg`, calls Claude, writes a `pending_uploads` row with `status: 'queued'` → immediately returns match result to the client
2. **Review** (`/review`) → user sees `PendingUploadCard` for each pending upload, accepts/overrides the suggestion → `POST /api/pending-uploads/{id}` confirms and moves the image to `{user_id}/{piece_id}/{image_id}.jpg`
3. **Pieces** (`/pieces`, `/pieces/{id}`) → browse and view individual pieces with their full image history via `ImageGallery`

### Server-side patterns

- **Two Supabase clients**: `createSupabaseServerClient(event)` (cookie-based, user auth) used in `hooks.server.ts`; `createServiceRoleClient()` (service role, bypasses RLS) used everywhere data is actually read/written
- **All DB queries are in `+page.server.ts` load functions** — no client-side DB access
- **Signed URLs generated server-side** with service-role key, never on the client. Bucket `pottery-images` has RLS; all access goes through signed URLs
- **Claude image preprocessing**: images are resized to ≤512px via `sharp` before sending to Claude to control token costs (~100 tokens vs ~4000 for full-res). Originals stored at full resolution.
- **Gemini Flash**: `gemini-2.5-flash` for both matching and descriptions (vision + reasoning, much cheaper than Claude for vision tasks)

### UI patterns

- **Mobile first design** - components are constructed for small viewports and touch devices first
- **Avoid using :hover states to expose functionality** - only use for cosmetic changes like shading a hovered button
- **Accessibility is important** - don't ignore accessibility warnings

### Key types (`src/lib/types.ts`)

- `PendingUpload` — row in `pending_uploads` table, status: `'queued' | 'ready' | 'failed'`
- `PendingUploadWithUrls` — extends PendingUpload with `tempImageUrl`, `matchedPieceCoverUrl`, `matchedPieceName`, `isStuck`
- `ImageWithUrl` — extends `Image` with `url` (signed URL)
- `Database` type must include `Relationships: []` on each table and `Functions` typed as `Record<string, { Args: ...; Returns: ... }>` to satisfy `GenericSchema`

### API routes (`src/routes/api/`)

- `POST /api/upload` — upload + Claude match, returns result immediately (client stores pending row)
- `POST /api/pending-uploads/{id}` — confirm a pending upload (accept/override/new piece)
- `DELETE /api/pending-uploads/{id}` — discard a pending upload
- `POST /api/bulk-upload` — batch upload flow
- `GET/POST /api/images`, `GET /api/pieces`, `GET /api/matches` — CRUD for pieces/images

### Testing

Tests use **Storybook 10 + `@storybook/addon-vitest`** running in headless Playwright/Chromium.

- Stories live in `src/stories/` alongside components in `src/lib/components/`
- Import test utilities from **`storybook/test`** (not `@storybook/test`)
- Import viewports from **`storybook/viewport`** (`MINIMAL_VIEWPORTS`: `mobile1`=320×568, `mobile2`=414×896, `desktop`=1280×1024)
- Set viewport per story: `globals: { viewport: { value: 'mobile1' } }`
- Touch simulation: `userEvent.pointer({ keys: '[TouchA][/TouchA]', target: element })`
- `vitest.shims.d.ts` exists at the root for type shims

### Svelte 5 notes

- Uses runes throughout: `$props()`, `$state()`, `$derived()`, `$effect()`
- `svelte/reactivity` `MediaQuery` class used for pointer type detection (`pointer: coarse` = touch device)
- `svelte/events` `on()` helper used for imperative event listeners with cleanup
- Adapter: `@sveltejs/adapter-vercel` with `runtime: 'nodejs22.x'` (required when building locally with Node 24)

### Environment variables

```
PUBLIC_SUPABASE_URL
PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
GEMINI_API_KEY
```
