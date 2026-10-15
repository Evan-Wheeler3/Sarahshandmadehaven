# Sarah's Handmade Haven

The website for Sarah's Handmade Haven: handmade fabric book covers.

It's a plain static site with no build step. Open `index.html` in a browser, or serve the folder:

```sh
npx http-server .
```

## How the page works

- **Hero:** a stone tower drawn on a `<canvas>` (`js/scene.js`). The title letters fly out of the tower window when the page loads (`js/main.js`).
- **Zoom:** scrolling dives into the tower. Its stones come from the same seamless texture tile as the wall behind the content (`js/stone.js`), so the tower turns into the wall without any cut.
- **Ivy:** an SVG layer (`js/ivy.js`) that grows across the wall as you scroll down, with little flowers that bloom as it grows.
- **Stone style:** sandstone with twinkling glints is the default. Add `?tower=grey` to the address to see the original grey stone (the original version of the whole site is also saved on the `tower-grey` branch). The style is chosen at the top of `js/scene.js`.
- **Order letter:** `js/letter.js`. Customers fill in a handwritten-style letter; on sending it rolls into a scroll and a carrier pigeon flies off with it. The site has no server, so the letter is then sent by Instagram DM (copied for pasting) or email (opens their mail app, already addressed).
- If the visitor's device asks for reduced motion, the zoom becomes a simple crossfade and the letters appear without flying in.

## Things to edit

| What | Where |
| --- | --- |
| Instagram username (used by every Instagram link) | `instagram` in `js/config.js` |
| Email address that order letters go to | `email` in `js/config.js` (leave empty to offer Instagram only) |
| Price, product text, About text | `index.html` |
| Product photos | Replace `images/cover-*.svg` with real photos (square works best), then update the `src` and `alt` attributes in `index.html` |
| About photo | `images/about-hoop.svg` |
| Colours and fonts | CSS variables at the top of `css/styles.css` |

## Hosting on GitHub Pages

Settings → Pages → Deploy from a branch → pick the branch and `/ (root)`.
