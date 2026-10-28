/* Small DOM helpers. All text goes in through text nodes, never innerHTML. */
(function (root) {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function setProps(el, props) {
    if (!props) return;
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') el.setAttribute('class', value);
      else if (key === 'dataset') Object.assign(el.dataset, value);
      else if (key === 'style') {
        for (const [prop, v] of Object.entries(value)) el.style.setProperty(prop, v);
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }

  function append(el, children) {
    for (const child of children.flat(Infinity)) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  /** Like el.replaceChildren(), but skips null/false children instead of printing them. */
  function replace(el, ...children) {
    el.replaceChildren();
    return append(el, children);
  }

  /** h('p', { class: 'note' }, 'Text', h('a', { href }, 'link')) */
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    setProps(el, props);
    return append(el, children);
  }

  function s(tag, props, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    setProps(el, props);
    return append(el, children);
  }

  /** Small inline icons, drawn for this project. */
  const ICONS = {
    undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
    clear: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
    mirror: 'M12 3v18M8 7 3 12l5 5V7ZM16 7l5 5-5 5V7Z',
    photo: 'M4 8h3l2-3h6l2 3h3v11H4V8ZM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    pencil: 'M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4',
    cassette: 'M7 6h10v15H7V6ZM10 6V3h4v3M7 10h10',
    list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.5M4.5 12h.5M4.5 18h.5',
    barcode: 'M4 6v12M7 6v12M8.5 6v12M12 6v12M15.5 6v12M17 6v12M20 6v12',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    link: 'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
    check: 'M5 12.5 10 17l9-10',
    cross: 'M6 6l12 12M18 6 6 18',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
    rotate: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    flip: 'M12 3v18M4 7v10l5-5-5-5ZM20 7v10l-5-5 5-5Z',
    arrow: 'M5 12h14M13 6l6 6-6 6',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
    globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM3.5 9h17M3.5 15h17M12 3c-2.5 2.6-3.6 5.6-3.6 9s1.1 6.4 3.6 9M12 3c2.5 2.6 3.6 5.6 3.6 9s-1.1 6.4-3.6 9',
    chevron: 'm7 10 5 5 5-5',
  };

  function icon(name, extraClass) {
    return s(
      'svg',
      { class: `icon${extraClass ? ` ${extraClass}` : ''}`, viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
      s('path', { d: ICONS[name] })
    );
  }

  root.DX = root.DX || {};
  root.DX.dom = { h, s, append, replace, icon };
})(globalThis);
