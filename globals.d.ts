// For `npm run check:types` only: what the page's scripts share as
// `globalThis.DX`, so that a call from one script into another is checked
// against the function it calls. The page never loads this file.
//
// Each member is optional: every script adds its own as it loads.
declare var DX: {
  codec?: typeof import('./site/js/dx-codec.js');
  createLookup?: typeof import('./site/js/dx-lookup.js');
  image?: typeof import('./site/js/dx-image.js');
  i18n?: typeof import('./site/js/i18n.js');
  // The rest (the data tables, `ui`, `dom` …) exist only in a browser.
  [other: string]: any;
};
