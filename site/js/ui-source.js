/*
 * The bar above the strip that says where its code came from: a photo (with
 * a thumbnail), Find a film, a cassette number, the code list or an example,
 * with a way back there. app.js decides when it shows.
 */
(function (root) {
  'use strict';
  const { h, icon } = root.DX.dom;
  const i18n = root.DX.i18n;
  const t = i18n.t;

  // Looked up when the bar is drawn, not when this script loads: the page's
  // language file may come in after it (js/prepaint.js).
  const kinds = () => ({
    photo: { from: t('From your photo'), back: t('Open the photo'), remove: t('Remove the photo') },
    finder: { icon: 'search', from: t('From Find a film'), back: t('Back to the search') },
    cassette: { icon: 'cassette', from: t('From a cassette number'), back: t('Back to the cassette number') },
    list: { icon: 'list', from: t('From the code list'), back: t('Back to the code list') },
    example: { icon: 'barcode', from: t('Example') },
  });

  /**
   * origin: { kind, label } (a photo also has its thumbnail, a canvas), or
   * null to hide the bar. edited: the strip has changed since.
   */
  function renderSource(host, origin, { edited, onBack, onRemove }) {
    host.hidden = !origin;
    if (!origin) {
      host.replaceChildren();
      return;
    }
    const kind = kinds()[origin.kind];
    if (origin.photo) {
      origin.photo.setAttribute('role', 'img');
      origin.photo.setAttribute('aria-label', t('Your photo'));
    }
    host.replaceChildren(
      origin.photo || h('span', { class: 'source__icon' }, icon(kind.icon)),
      h('p', { class: 'source__text' },
        h('strong', null, kind.from), i18n.punctuation().colon, origin.label,
        edited ? h('span', { class: 'source__edited' }, t('edited since')) : null),
      h('div', { class: 'source__actions' },
        kind.back ? h('button', { type: 'button', class: 'tool tool--small', onClick: onBack }, kind.back) : null,
        h('button', {
          type: 'button', class: 'icon-button source__remove', onClick: onRemove,
          'aria-label': kind.remove || t('Hide where this code came from'),
        }, icon('cross'))));
  }

  root.DX.ui = root.DX.ui || {};
  root.DX.ui.renderSource = renderSource;
})(globalThis);
