# Sarah's Handmade Haven

The website for Sarah's Handmade Haven: handmade fabric book covers.

It's a plain static site with no build step. Open `index.html` in a browser, or serve the folder:

```sh
npx http-server .
```

## How the page works

- **Hero:** a stone tower drawn on a `<canvas>` (`js/scene.js`). The title letters fly out of the tower window when the page loads (`js/main.js`).
- **Zoom:** scrolling dives into the tower. Its stones come from the same seamless texture tile as the wall behind the content (`js/stone.js`), so the tower turns into the wall without any cut.
- **Ivy:** an SVG layer (`js/ivy.js`) that grows across the wall as you scroll down.
- If the visitor's device asks for reduced motion, the zoom becomes a simple crossfade and the letters appear without flying in.

## Things to edit

| What | Where |
| --- | --- |
| Instagram username (used by every Instagram link) | `INSTAGRAM` at the top of `js/main.js` |
| Price, product text, About text | `index.html` |
| Product photos | Replace `images/cover-*.svg` with real photos (square works best), then update the `src` and `alt` attributes in `index.html` |
| About photo | `images/about-hoop.svg` |
| Colours and fonts | CSS variables at the top of `css/styles.css` |

## Hosting on GitHub Pages

Settings → Pages → Deploy from a branch → pick the branch and `/ (root)`.
