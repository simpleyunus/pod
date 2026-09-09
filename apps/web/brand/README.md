# Brand assets

Source artwork, kept out of `public/` so it is not served or shipped in the
production image.

| File | Note |
|---|---|
| `pod-logo.svg` | 556 KB. Not vector — an SVG wrapper around a base64 raster (2 `<image>` elements, 1 real path). |
| `pod-mark.svg` | 1146 KB. Same: one embedded raster, no vector geometry. |

## What the app actually uses

`public/` carries PNGs extracted from the supplied navy lockup by keying out
its flat background, which gives true alpha and clean anti-aliased edges:

| File | Size | Use |
|---|---|---|
| `pod-logo.png` | 30 KB | white wordmark — the navy sidebar, login, tracking hero |
| `pod-logo-dark.png` | 10 KB | navy wordmark — light canvas, cards, the audit-pack PDF |
| `pod-mark.png` | 4 KB | square crop for the collapsed rail |

The PNGs are preferred because the SVGs are 18–280x larger while containing
the same raster data, so they render no more sharply. If a genuinely vector
version is ever produced — real `<path>` geometry rather than an embedded
bitmap — it would be worth switching: it would scale cleanly to any size and
would likely be a few KB.

## Colours measured from the artwork

- POD navy `#02182C` in the lockup; the app's chrome uses `#0E1B2A`
- Brand orange `#ED482F`; the app's `--signal` token is `#E8503A`

Close enough that neither was changed, but worth knowing if exact matching
ever matters.
