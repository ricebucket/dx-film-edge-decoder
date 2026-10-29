/*
 * "Read a photo": load an image of the film edge, straighten it, select one
 * barcode (optional) and let DX.image.readBarcodeAsync find the bars, in three
 * numbered steps. The image never leaves the browser. Once its code is used
 * the reader folds up, and the strip keeps the photo in sight: a thumbnail in
 * the bar above it (ui-source.js) and the barcode lined up over its cells.
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
    { synth: { part1: 96, part2: 12, frame: 14, half: true, module: 9, angle: -1.2 }, look: 'negative', note: t('Sample: a computer-drawn film edge, a color negative.') },
    { synth: { part1: 32, part2: 6, frame: 5, half: false, module: 9, angle: 0.8 }, look: 'slide', note: t('Sample: a computer-drawn film edge, a slide.') },
    { synth: { part1: 109, part2: 9, frame: 12, half: false, module: 9, mirrored: true }, look: 'bw', note: t('Sample: a computer-drawn film edge, a black-and-white negative seen from the back.') },
  ];

  const REASONS = {
    flat: t('This image has almost no contrast. Try a sharper, closer photo of the film edge.'),
    'no-clock': t('No clock track found: the row with a wide mark, a run of thin bars and a shorter mark. Turn the image so the film edge is horizontal, then drag a box around one barcode, including both rows.'),
    'no-data': t('The clock track was found, but not a readable data row next to it. Make sure your box includes both rows, or try a sharper photo.'),
    unclear: t('Something like a barcode was found, but it could not be read reliably. Straighten the image so the film edge runs left to right, or drag a box around one barcode.'),
  };

  /** A copy of a box of a canvas, fitted into maxW × maxH CSS pixels. */
  function thumbnail(src, box, maxW, maxH) {
    const k = Math.min(maxW / box.w, maxH / box.h);
    const dpr = root.devicePixelRatio || 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(box.w * k * dpr));
    c.height = Math.max(1, Math.round(box.h * k * dpr));
    c.style.width = `${Math.round(box.w * k)}px`; // the height follows, also when CSS narrows it
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, box.x, box.y, box.w, box.h, 0, 0, c.width, c.height);
    return c;
  }

  function createPhoto(section, { lookup, onApply }) {
    let source = null; // canvas with the loaded image, at working resolution
    let view = null; // source after rotation/flip
    let turns = 0;
    let fine = 0;
    let flip = false;
    let selection = null; // in view coordinates
    let result = null;
    let searching = null; // AbortController of the search in progress, which runs alongside the page
    let sampleIndex = 0;

    const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'photo-file', tabindex: '-1', 'aria-label': t('Photo of the film edge') });
    const chooseBtn = h('button', { type: 'button', class: 'tool' }, t('Choose a photo'));
    const sampleBtn = h('button', { type: 'button', class: 'tool' }, t('Try a sample'));
    const sourceNote = h('p', { class: 'photo__source' });

    const canvas = h('canvas', { class: 'photo__canvas', 'aria-label': t('Photo of the film edge. Drag to select one barcode.'), role: 'img' });
    const rotateLeft = h('button', { type: 'button', class: 'tool tool--small', 'aria-label': t('Rotate left 90 degrees') }, '⟲ 90°');
    const rotateRight = h('button', { type: 'button', class: 'tool tool--small', 'aria-label': t('Rotate right 90 degrees') }, '⟳ 90°');
    const flipBtn = h('button', { type: 'button', class: 'tool tool--small', 'aria-pressed': 'false' }, t('Flip'));
    const fineInput = h('input', { type: 'range', min: '-15', max: '15', step: '0.5', value: '0', id: 'photo-fine', class: 'range' });
    const fineOut = h('output', { for: 'photo-fine', class: 'range__out' }, '0°');
    const readBtn = h('button', { type: 'button', class: 'tool' }, t('Read again'));
    const clearSel = h('button', { type: 'button', class: 'tool tool--small', hidden: true }, t('Clear selection'));
    const stage = h('div', { class: 'photo__stage', hidden: true }, canvas);
    // Messages and the result, in step 3; they show before any image is loaded too.
    const out = h('div', { class: 'photo__result', 'aria-live': 'polite' });
    const unfoldBtn = h('button', { type: 'button', class: 'tool tool--small' }, t('Open the photo'));

    const step = (n, title, ...content) => h('li', { class: 'photo__step', 'data-step': n }, h('h2', { class: 'steps__title' }, title), ...content);
    const steps = h('ol', { class: 'photo__steps' },
      step(1, t('Choose a photo'),
        h('p', { class: 'photo__drop' }, t('Drop an image here, paste one, or'), ' ', chooseBtn, ' ', sampleBtn),
        h('p', { class: 'fineprint' }, t('A close-up of the film edge works best: phone macro photo, loupe photo or scan. The image stays on your device.')),
        sourceNote),
      step(2, t('Check the barcode'),
        h('p', { class: 'fineprint photo__tip' }, t('Turn the image so the film edge runs left to right (within a few degrees), then drag a box around one barcode, including both rows. Without a box the whole image is searched.')),
        h('div', { class: 'photo__controls' },
          h('div', { class: 'photo__control' }, h('span', { class: 'toolbar__label' }, t('Turn')), rotateLeft, rotateRight, flipBtn),
          h('div', { class: 'photo__control photo__control--range' }, h('label', { for: 'photo-fine', class: 'toolbar__label' }, t('Straighten')), fineInput, fineOut),
          h('div', { class: 'photo__control' }, readBtn, clearSel)),
        stage),
      step(3, t('Use the code'), out));
    // Shown instead of the steps' contents once the code has been used.
    const folded = h('p', { class: 'photo__folded' }, t('The code from your photo is on the strip below.'), ' ', unfoldBtn);

    section.replaceChildren(steps, folded, fileInput);

    /** Highlight the step to do next: 1 until there is a photo, 2 until a code is found, then 3. */
    function setStep() {
      const current = !view ? 1 : result && result.found ? 3 : 2;
      for (const li of steps.children) {
        const n = Number(li.dataset.step);
        li.classList.toggle('is-done', n < current);
        if (n === current) li.setAttribute('aria-current', 'step');
        else li.removeAttribute('aria-current');
      }
      // Only the next step's button stands out.
      chooseBtn.classList.toggle('tool--primary', current === 1);
      readBtn.classList.toggle('tool--primary', current === 2);
      for (const control of [rotateLeft, rotateRight, flipBtn, fineInput, readBtn]) control.disabled = !view;
    }

    function showPlaceholder() {
      out.replaceChildren(h('p', { class: 'fineprint' }, t('The code appears here once a photo has been read.')));
    }

    function fold() {
      section.classList.add('is-folded');
      for (const li of steps.children) {
        li.classList.add('is-done');
        li.removeAttribute('aria-current');
      }
    }

    function unfold() {
      section.classList.remove('is-folded');
      setStep();
      draw();
    }

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
      stage.hidden = false;
      section.classList.remove('is-folded');
      replace(sourceNote, ...note);
      rebuildView();
      setStep();
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

    function reset() {
      stopSearch();
      source = null;
      view = null;
      result = null;
      selection = null;
      stage.hidden = true;
      clearSel.hidden = true;
      sourceNote.replaceChildren();
      showPlaceholder();
      unfold();
    }

    // ---- view (rotation) and drawing --------------------------------------------

    function rebuildView() {
      stopSearch(); // its result would be for the old view
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
      if (!view || stage.hidden || section.hidden) return;
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

    /**
     * The barcode as read, straightened and in reading order (cell 1 on the
     * left, clock track on top), CELL pixels per cell: the strip stretches it
     * so each cell sits over its own.
     */
    function lineUp(r) {
      const CELL = 16;
      const rowGap = Math.abs(r.dataY - r.clockY);
      const top = Math.min(r.clockY, r.dataY) - rowGap * 0.6;
      const bottom = Math.max(r.clockY, r.dataY) + rowGap * 0.6;
      const c = document.createElement('canvas');
      c.width = r.cells * CELL;
      c.height = CELL * 5;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      // Read right to left (mirrored or upside down): cell 1 goes on the left.
      // Data track above the clock track (upside down): the clock track goes on top.
      if (r.reversed) {
        ctx.translate(c.width, 0);
        ctx.scale(-1, 1);
      }
      if (r.dataY < r.clockY) {
        ctx.translate(0, c.height);
        ctx.scale(1, -1);
      }
      // From the view: x from the first cell, y from the top, less the tilt
      // (the rows rise or fall by r.slope per pixel across the region).
      const sx = c.width / (r.cells * r.unit);
      const sy = c.height / (bottom - top);
      const cx = r.offset.x + r.regionWidth / 2;
      ctx.transform(sx, -r.slope * sy, 0, sy, -sx * (r.offset.x + r.x0), sy * (r.slope * cx - r.offset.y - top));
      ctx.drawImage(view, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // Cell borders, to compare cell by cell.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
      for (let i = 1; i < r.cells; i++) ctx.fillRect(i * CELL, 0, 1, c.height);
      return c;
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

    /** Stop the search in progress, if any: a newer one, another view of the photo or another photo replaces it. */
    function stopSearch() {
      if (!searching) return;
      searching.abort();
      searching = null;
      readBtn.disabled = false;
    }

    function find() {
      if (!view) return;
      stopSearch();
      const search = new AbortController();
      searching = search;
      const usable = selection && selection.w >= 12 && selection.h >= 8;
      const region = usable ? selection : { x: 0, y: 0, w: view.width, h: view.height };
      showMessage(t('Looking for the barcode…'));
      readBtn.disabled = true;
      // Let the message paint before the search starts.
      setTimeout(async () => {
        if (search.signal.aborted) return;
        let r = null;
        try {
          const data = view.getContext('2d').getImageData(region.x, region.y, region.w, region.h);
          const gray = reader.grayFromRGBA(data.data, region.w, region.h);
          r = await reader.readBarcodeAsync(gray, null, search.signal);
        } catch (err) {
          r = null;
        }
        if (search.signal.aborted) return;
        searching = null;
        if (r) {
          result = Object.assign(r, { offset: { x: region.x, y: region.y }, regionWidth: region.w });
          showResult();
        } else {
          result = null;
          showMessage(t('This part of the image could not be read. Select the barcode again, or clear the selection.'), true);
        }
        readBtn.disabled = false;
        setStep();
        draw();
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
      apply.addEventListener('click', () => onApply(r.bits, r.format, r.polarity === 'light' ? 'slide' : null, {
        label: what,
        photo: thumbnail(view, { x: 0, y: 0, w: view.width, h: view.height }, 120, 72),
        lined: lineUp(r),
      }));
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
    unfoldBtn.addEventListener('click', () => {
      unfold();
      readBtn.focus();
    });
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
      setStep();
    });
    fineInput.addEventListener('change', find);
    readBtn.addEventListener('click', find);
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
    window.addEventListener('resize', draw);

    showPlaceholder();
    setStep();

    return {
      /** Show the reader, unfolded; with focus, also bring it into view and focus its next step. */
      open(options) {
        section.hidden = false;
        unfold();
        if (options && options.focus) {
          section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          (view ? readBtn : chooseBtn).focus({ preventScroll: true });
        }
      },
      close() {
        section.hidden = true;
      },
      fold,
      /** Forget the photo: back to step 1. */
      reset,
    };
  }

  root.DX.ui = root.DX.ui || {};
  root.DX.ui.createPhoto = createPhoto;
})(globalThis);
