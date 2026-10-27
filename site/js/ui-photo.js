/*
 * "Read from a photo": load an image of the film edge, straighten it, select
 * one barcode (optional) and let DX.image.readBarcode find the bars. The
 * image never leaves the browser.
 */
(function (root) {
  'use strict';
  const { h, replace } = root.DX.dom;
  const codec = root.DX.codec;
  const reader = root.DX.image;
  const i18n = root.DX.i18n;
  const t = i18n.t;

  const MAX_WORKING_SIDE = 2400;

  const SAMPLES = [
    { synth: { part1: 96, part2: 12, frame: 14, half: true, module: 9, angle: -1.2 }, look: 'negative', note: t('Sample: a computer-drawn film edge, a colour negative.') },
    { synth: { part1: 32, part2: 6, frame: 5, half: false, module: 9, angle: 0.8 }, look: 'slide', note: t('Sample: a computer-drawn film edge, a slide.') },
    { synth: { part1: 109, part2: 9, frame: 12, half: false, module: 9, mirrored: true }, look: 'bw', note: t('Sample: a computer-drawn film edge, a black-and-white negative seen from the back.') },
  ];

  const REASONS = {
    flat: t('This image has almost no contrast. Try a sharper, closer photo of the film edge.'),
    'no-clock': t('No clock track found: the row with a wide mark, a run of thin bars and a shorter mark. Turn the image so the film edge is horizontal, then drag a box around one barcode, including both rows.'),
    'no-data': t('The clock track was found, but not a readable data row next to it. Make sure your box includes both rows, or try a sharper photo.'),
    unclear: t('Something like a barcode was found, but it could not be read reliably. Straighten the image so the film edge runs left to right, or drag a box around one barcode.'),
  };

  function createPhoto(section, { lookup, onApply, onClose }) {
    let source = null; // canvas with the loaded image, at working resolution
    let view = null; // source after rotation/flip
    let turns = 0;
    let fine = 0;
    let flip = false;
    let selection = null; // in view coordinates
    let result = null;
    let sampleIndex = 0;

    const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'photo-file', tabindex: '-1', 'aria-label': t('Photo of the film edge') });
    const chooseBtn = h('button', { type: 'button', class: 'tool tool--primary' }, t('Choose a photo'));
    const sampleBtn = h('button', { type: 'button', class: 'tool' }, t('Try a sample'));
    const closeBtn = h('button', { type: 'button', class: 'tool', 'aria-label': t('Close the photo reader') }, t('Close'));

    const drop = h('div', { class: 'photo__drop' },
      h('p', null, t('Drop an image here, paste one, or'), ' ', chooseBtn, ' ', sampleBtn),
      h('p', { class: 'fineprint' }, t('A close-up of the film edge works best: phone macro photo, loupe photo or scan. The image stays on your device.')));

    const canvas = h('canvas', { class: 'photo__canvas', 'aria-label': t('Photo of the film edge. Drag to select one barcode.'), role: 'img' });
    const rotateLeft = h('button', { type: 'button', class: 'tool tool--small', 'aria-label': t('Rotate left 90 degrees') }, '⟲ 90°');
    const rotateRight = h('button', { type: 'button', class: 'tool tool--small', 'aria-label': t('Rotate right 90 degrees') }, '⟳ 90°');
    const flipBtn = h('button', { type: 'button', class: 'tool tool--small', 'aria-pressed': 'false' }, t('Flip'));
    const fineInput = h('input', { type: 'range', min: '-15', max: '15', step: '0.5', value: '0', id: 'photo-fine', class: 'range' });
    const fineOut = h('output', { for: 'photo-fine', class: 'range__out' }, '0°');
    const findBtn = h('button', { type: 'button', class: 'tool tool--primary' }, t('Find the barcode'));
    const clearSel = h('button', { type: 'button', class: 'tool tool--small', hidden: true }, t('Clear selection'));
    // Outside the work area, so messages show before any image is loaded too.
    const out = h('div', { class: 'photo__result', 'aria-live': 'polite' });
    const sourceNote = h('p', { class: 'photo__source' });

    const work = h('div', { class: 'photo__work', hidden: true },
      h('div', { class: 'photo__controls' },
        h('div', { class: 'photo__control' }, h('span', { class: 'toolbar__label' }, t('Turn')), rotateLeft, rotateRight, flipBtn),
        h('div', { class: 'photo__control photo__control--range' }, h('label', { for: 'photo-fine', class: 'toolbar__label' }, t('Straighten')), fineInput, fineOut),
        h('div', { class: 'photo__control' }, findBtn, clearSel, h('button', { type: 'button', class: 'tool tool--small', onClick: () => fileInput.click() }, t('Other photo')))),
      h('p', { class: 'fineprint photo__tip' }, t('Turn the image so the film edge runs left to right (within a few degrees), then drag a box around one barcode, including both rows. Without a box the whole image is searched.')),
      sourceNote,
      h('div', { class: 'photo__stage' }, canvas));

    section.replaceChildren(
      h('div', { class: 'photo__head' },
        h('h2', { id: 'photo-title' }, t('Read the barcode from a photo')),
        closeBtn),
      drop, work, out, fileInput);

    // ---- loading ------------------------------------------------------------

    async function loadBlob(blob) {
      if (!blob || !/^image\//.test(blob.type)) {
        showMessage(t('That file is not an image.'), true);
        return;
      }
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        setSource(img, img.naturalWidth, img.naturalHeight, [t('Your photo, {width} × {height} pixels.', { width: img.naturalWidth, height: img.naturalHeight })]);
      } catch (e) {
        showMessage(t('This image could not be opened. JPEG, PNG and WebP photos work in every browser.'), true);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function setSource(drawable, w, hgt, note) {
      const scale = Math.min(1, MAX_WORKING_SIDE / Math.max(w, hgt));
      source = document.createElement('canvas');
      source.width = Math.round(w * scale);
      source.height = Math.round(hgt * scale);
      source.getContext('2d').drawImage(drawable, 0, 0, source.width, source.height);
      turns = 0;
      fine = 0;
      flip = false;
      fineInput.value = '0';
      fineOut.textContent = '0°';
      flipBtn.setAttribute('aria-pressed', 'false');
      selection = null;
      result = null;
      work.hidden = false;
      drop.hidden = true;
      replace(sourceNote, ...note);
      rebuildView();
      find();
    }

    function loadSample() {
      const s = SAMPLES[sampleIndex++ % SAMPLES.length];
      const syn = reader.synthesize(Object.assign({ width: 640, height: 150 }, s.synth));
      const rgba = reader.compose(syn, { look: s.look, noise: 12, blur: 1, seed: sampleIndex });
      const c = document.createElement('canvas');
      c.width = syn.width;
      c.height = syn.height;
      c.getContext('2d').putImageData(new ImageData(rgba, syn.width, syn.height), 0, 0);
      setSource(c, c.width, c.height, [
        s.note, ' ',
        h('button', { type: 'button', class: 'text-button', onClick: loadSample }, t('Show another sample')),
      ]);
    }

    // ---- view (rotation) and drawing --------------------------------------------

    function rebuildView() {
      const angle = ((turns * 90 + fine) * Math.PI) / 180;
      const w = source.width;
      const hh = source.height;
      const cos = Math.abs(Math.cos(angle));
      const sin = Math.abs(Math.sin(angle));
      view = document.createElement('canvas');
      view.width = Math.round(w * cos + hh * sin);
      view.height = Math.round(w * sin + hh * cos);
      const ctx = view.getContext('2d');
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, view.width, view.height);
      // Rotate first, then mirror the rotated image left to right as shown.
      ctx.translate(view.width / 2, view.height / 2);
      if (flip) ctx.scale(-1, 1);
      ctx.rotate(angle);
      ctx.drawImage(source, -w / 2, -hh / 2);
      selection = null;
      clearSel.hidden = true;
      draw();
    }

    function displayScale() {
      return canvas.width / view.width;
    }

    function draw() {
      if (!view) return;
      const stage = canvas.parentElement;
      const pad = getComputedStyle(stage);
      const maxW = stage.clientWidth - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight) || 800;
      const maxH = Math.max(160, Math.round(window.innerHeight * 0.55));
      const scale = Math.min(maxW / view.width, maxH / view.height, 3);
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${Math.round(view.width * scale)}px`;
      canvas.style.height = 'auto'; // keeps the bitmap's aspect ratio if CSS narrows it
      canvas.width = Math.round(view.width * scale * dpr);
      canvas.height = Math.round(view.height * scale * dpr);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(view, 0, 0, canvas.width, canvas.height);
      const k = displayScale();
      if (selection) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(view, selection.x, selection.y, selection.w, selection.h, selection.x * k, selection.y * k, selection.w * k, selection.h * k);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.strokeRect(selection.x * k, selection.y * k, selection.w * k, selection.h * k);
        ctx.restore();
      }
      if (result && result.found) drawGrid(ctx, k, dpr);
    }

    /** Outline every cell that was read, on both tracks, in the photo itself. */
    function drawGrid(ctx, k, dpr) {
      const r = result;
      const ox = r.offset.x;
      const oy = r.offset.y;
      const cx = r.regionWidth / 2;
      const trackH = Math.abs(r.dataY - r.clockY);
      const bits = r.reversed ? [...r.bits].reverse().join('') : r.bits;
      const clock = codec.getFormat(r.format).clock;
      const clockBits = r.reversed ? [...clock].reverse().join('') : clock;
      ctx.save();
      ctx.lineWidth = Math.max(1, 1.2 * dpr);
      for (let c = 0; c < r.cells; c++) {
        const x = r.x0 + c * r.unit;
        const xm = x + r.unit / 2;
        for (const [y, bit, color] of [[r.clockY, clockBits[c], '#4fb6c9'], [r.dataY, bits[c], '#ffd166']]) {
          const yy = y + (xm - cx) * r.slope;
          ctx.strokeStyle = color;
          ctx.globalAlpha = bit === '1' ? 0.95 : 0.45;
          ctx.strokeRect((ox + x) * k, (oy + yy - trackH * 0.38) * k, r.unit * k, trackH * 0.76 * k);
        }
      }
      ctx.restore();
    }

    // ---- selection ----------------------------------------------------------------

    let dragStart = null;
    let selectionBefore = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!view || e.button !== 0) return;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        // pointer already gone (or synthetic): the drag still works without capture
      }
      selectionBefore = selection;
      dragStart = toView(e);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragStart) return;
      const p = toView(e);
      selection = rect(dragStart, p);
      draw();
    });
    const endDrag = (e) => {
      if (!dragStart) return;
      const p = toView(e);
      const r = rect(dragStart, p);
      dragStart = null;
      if (r.w < 12 || r.h < 8) {
        // A tap clears the selection; search the whole image again if there was one.
        selection = null;
        clearSel.hidden = true;
        if (selectionBefore) find();
        else draw();
        return;
      }
      selection = r;
      clearSel.hidden = false;
      find();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', () => {
      if (!dragStart) return;
      dragStart = null;
      selection = selectionBefore;
      draw();
    });

    function toView(e) {
      const box = canvas.getBoundingClientRect();
      return {
        x: Math.min(view.width, Math.max(0, ((e.clientX - box.left) * view.width) / box.width)),
        y: Math.min(view.height, Math.max(0, ((e.clientY - box.top) * view.height) / box.height)),
      };
    }

    function rect(a, b) {
      const x = Math.round(Math.min(a.x, b.x));
      const y = Math.round(Math.min(a.y, b.y));
      return { x, y, w: Math.round(Math.abs(a.x - b.x)), h: Math.round(Math.abs(a.y - b.y)) };
    }

    // ---- reading ---------------------------------------------------------------------

    function find() {
      if (!view) return;
      const usable = selection && selection.w >= 12 && selection.h >= 8;
      const region = usable ? selection : { x: 0, y: 0, w: view.width, h: view.height };
      showMessage(t('Looking for the barcode…'));
      findBtn.disabled = true;
      // Let the message paint before the (short) search.
      setTimeout(() => {
        try {
          const data = view.getContext('2d').getImageData(region.x, region.y, region.w, region.h);
          const gray = reader.grayFromRGBA(data.data, region.w, region.h);
          const r = reader.readBarcode(gray);
          result = Object.assign(r, { offset: { x: region.x, y: region.y }, regionWidth: region.w });
          showResult();
        } catch (err) {
          result = null;
          showMessage(t('This part of the image could not be read. Select the barcode again, or clear the selection.'), true);
        } finally {
          findBtn.disabled = false;
          draw();
        }
      }, 30);
    }

    function showMessage(text, isError) {
      out.replaceChildren(h('p', { class: isError ? 'form-message is-error' : 'form-message' }, text));
    }

    function showResult() {
      const r = result;
      if (!r.found) {
        out.replaceChildren(h('p', { class: 'form-message is-error' }, REASONS[r.reason] || t('No barcode found.')));
        return;
      }
      const d = r.decoded;
      const info = d.part1 ? lookup.byDx(d.part1, d.part2) : null;
      const name = info && (info.products[0] || info.community[0]);
      const what = d.frame === null ? `DX ${d.dxNumber}` : t('DX {dx}, frame {frame}', { dx: d.dxNumber, frame: d.frameLabel });
      const notes = [];
      if (r.reversed) notes.push(t('The film is mirrored or upside down in this photo; the code was read in the right direction anyway.'));
      if (r.polarity === 'light') notes.push(t('Clear bars on a dark edge: read as slide film.'));
      if (r.format === 'short') notes.push(t('This is the original 23-cell layout without a frame number.'));
      if (r.confidence < 0.3) notes.push(t('Some cells were hard to tell apart; compare the result with your film.'));
      if (!d.valid) notes.push(t('The code as read does not pass all checks. Use it, then look at the suggested corrections.'));
      const apply = h('button', { type: 'button', class: 'tool tool--primary' }, t('Use this code'));
      apply.addEventListener('click', () => onApply(r.bits, r.format, r.polarity === 'light' ? 'slide' : null));
      replace(out,
        h('p', { class: `photo__found${d.valid ? '' : ' is-error'}` },
          h('strong', null, what), name ? i18n.punctuation().colon + name.name : d.valid ? i18n.punctuation().colon + t('not in the lists') : ''),
        h('p', { class: 'fineprint' }, t('Outlined in the photo: the cells that were read, clock track in blue, data track in yellow (bold outline = bar).')),
        notes.length ? h('ul', { class: 'photo__notes' }, notes.map((n) => h('li', null, n))) : null,
        h('div', { class: 'result__actions' }, apply));
    }

    // ---- wiring ------------------------------------------------------------------------

    chooseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) loadBlob(fileInput.files[0]);
      fileInput.value = '';
    });
    sampleBtn.addEventListener('click', loadSample);
    closeBtn.addEventListener('click', () => onClose());
    rotateLeft.addEventListener('click', () => { turns = (turns + 3) % 4; result = null; rebuildView(); find(); });
    rotateRight.addEventListener('click', () => { turns = (turns + 1) % 4; result = null; rebuildView(); find(); });
    flipBtn.addEventListener('click', () => {
      flip = !flip;
      flipBtn.setAttribute('aria-pressed', String(flip));
      result = null;
      rebuildView();
      find();
    });
    fineInput.addEventListener('input', () => {
      fine = Number(fineInput.value);
      fineOut.textContent = `${fine > 0 ? '+' : ''}${fine}°`;
      result = null;
      rebuildView();
    });
    fineInput.addEventListener('change', find);
    findBtn.addEventListener('click', find);
    clearSel.addEventListener('click', () => {
      selection = null;
      clearSel.hidden = true;
      find();
    });

    section.addEventListener('dragover', (e) => {
      e.preventDefault();
      section.classList.add('is-dragging');
    });
    section.addEventListener('dragleave', () => section.classList.remove('is-dragging'));
    section.addEventListener('drop', (e) => {
      e.preventDefault();
      section.classList.remove('is-dragging');
      const file = e.dataTransfer && e.dataTransfer.files[0];
      if (file) loadBlob(file);
    });
    document.addEventListener('paste', (e) => {
      if (section.hidden) return;
      const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        loadBlob(item.getAsFile());
      }
    });
    window.addEventListener('resize', () => { if (!section.hidden) draw(); });

    return {
      open() {
        section.hidden = false;
        section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
        (view ? findBtn : chooseBtn).focus({ preventScroll: true });
        draw();
      },
      close() {
        section.hidden = true;
      },
    };
  }

  root.DX.ui = root.DX.ui || {};
  root.DX.ui.createPhoto = createPhoto;
})(globalThis);
