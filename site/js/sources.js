/* The sources page: its text in the chosen language, and the header's controls. */
(function () {
  'use strict';
  const DX = globalThis.DX;
  DX.i18n.applyLanguage(document);
  DX.ui.bindHeader();
})();
