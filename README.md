# molecular-editor

A web-based, gamified chemical structure editor. Drag atoms (`C`, `H`, `O`, `N`) onto a canvas, snap them together on a rigid 90° orbital grid, and let PubChem identify balanced molecules automatically.

## Quick Start

**Double-click `index.html`** to open it in your browser. No install or server required.

You do need an internet connection for Fabric.js, RDKit.js (CDN), and PubChem API lookups.

## How to Use

1. **Place atoms** — drag `C`, `H`, `O`, or `N` from the toolbar onto the canvas (or click to place at center).
2. **Bond atoms** — drag an atom/compound near another; it snaps to the closest orbital slot based on approach angle.
3. **Upgrade bonds** — double-click a bond to cycle single → double → triple.
4. **Break bonds** — right-click a bond line to remove it.
5. **Identify molecules** — when every atom in a multi-atom compound is electronically balanced, PubChem validation runs automatically.

## Optional: Local Server

If you prefer serving the folder (e.g. for development):

```bash
npm run dev
```

## Architecture

| Layer | Technology |
|---|---|
| Canvas UI | Fabric.js (CDN) |
| Cheminformatics | RDKit.js WASM (CDN) |
| Validation API | PubChem PUG REST |

All application logic lives in a single `js/app.js` file so the app works when opened directly via `file://`.

## License

MIT
