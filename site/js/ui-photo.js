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
  /** A size in whole pixels, never 0: a canvas or bitmap of size 0 can't be drawn from. */
  const atLeastOne = (v) => Math.max(1, Math.round(v));
  /** A moment for the page between long steps. */
  const pause = () => new Promise((resolve) => setTimeout(resolve));
  // How far a press may move and still count as a click, in CSS pixels: a
  // finger drifts further than a mouse.
  const CLICK = { mouse: 5, pen: 10, touch: 12 };
  // The smallest box, on screen (CSS pixels) and in the photo (its pixels).
  const MIN_BOX = { screen: [24, 16], photo: [12, 8] };

  // Looked up when shown, as all text is (js/i18n.js).
  const samples = () => [
    { synth: { part1: 96, part2: 12, frame: 14, half: true, module: 9, angle: -1.2 }, look: 'negative', note: t('Sample: a computer-drawn color negative.') },
    { synth: { part1: 32, part2: 6, frame: 5, half: false, module: 9, angle: 0.8 }, look: 'slide', note: t('Sample: a computer-drawn slide.') },
    { synth: { part1: 109, part2: 9, frame: 12, half: false, module: 9, mirrored: true }, look: 'bw', note: t('Sample: a computer-drawn black-and-white negative, seen from the back.') },
  ];

  const reasons = () => ({
    flat: t('This image has almost no contrast. Try a sharper, closer photo of the film edge.'),
    'no-clock': t('The barcode’s top row was not found. Turn the image so the film edge runs left to right and select one barcode, or try a sharper photo in even light.'),
    'no-data': t('The lower row could not be read. Make sure both rows are visible, or try a sharper photo.'),
    unclear: t('A barcode was found but could not be read reliably. Straighten the image, or select one barcode.'),
    eleven: t('This barcode looks cut off or damaged at its end. Make sure the whole barcode is visible, or try a sharper photo.'),
  });

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

  function createPhoto(section, { lookup, onApply, onOpen }) {
    let picture = null; // what is loaded, to load it again: { blob } or { sample, seed }
    let loads = 0; // counts photos chosen and removed: one still opening when the next comes is dropped
    let opening = null; // the photo still opening, if any
    let source = null; // canvas with the loaded image, at working resolution
    let view = null; // source after rotation/flip
    let turns = 0;
    let fine = 0;
    let flip = false;
    let selection = null; // in view coordinates
    let corner = null; // the first corner of a box made by clicks, in view coordinates
    let pointer = null; // where the mouse is, so that the box follows it from that corner
    let result = null;
    let searching = null; // AbortController of the search in progress, which runs alongside the page
    let sampleIndex = 0;

    const fileInput = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'photo-file', tabindex: '-1', 'aria-hidden': 'true' });
    const chooseBtn = h('button', { type: 'button', class: 'tool' }, t('Choose a photo'));
    const sampleBtn = h('button', { type: 'button', class: 'tool' }, t('Try a sample'));
    const sourceNote = h('p', { class: 'photo__source' });

    const canvas = h('canvas', { class: 'photo__canvas', role: 'application', tabindex: '0', 'aria-label': t('Photo of the film edge'), 'aria-describedby': 'photo-keys' });
    // Shown while the photo has keyboard focus; screen readers read it as the photo's description.
    const keysHint = h('p', { class: 'fineprint photo__keys', id: 'photo-keys', hidden: true },
      t('Arrow keys move the box; Shift and arrows resize it. Enter reads, Escape clears.'));
    const rotateLeft = h('button', { type: 'button', class: 'tool tool--small', 'aria-label': t('Rotate left 90 degrees') }, '⟲ 90°');
    const rotateRight = h('button', { type: 'button', class: 'tool tool--small', 'aria-label': t('Rotate right 90 degrees') }, '⟳ 90°');
    const flipBtn = h('button', { type: 'button', class: 'tool tool--small', 'aria-pressed': 'false' }, t('Flip'));
    const fineInput = h('input', { type: 'range', min: '-15', max: '15', step: '0.5', value: '0', id: 'photo-fine', class: 'range' });
    const fineOut = h('output', { for: 'photo-fine', class: 'range__out', 'aria-hidden': 'true' }, '0°');
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
        h('p', { class: 'fineprint' }, t('A close-up of the film edge works best. The image stays on your device and is never transmitted to the server.')),
        sourceNote),
      step(2, t('Check the barcode'),
        h('p', { class: 'fineprint photo__tip' }, t('Turn the image so the film edge runs left to right, then select one barcode (both rows). Without a selection, the whole image is searched.')),
        h('div', { class: 'photo__controls' },
          h('div', { class: 'photo__control' }, h('span', { class: 'toolbar__label' }, t('Turn')), rotateLeft, rotateRight, flipBtn),
          h('div', { class: 'photo__control photo__control--range' }, h('label', { for: 'photo-fine', class: 'toolbar__label' }, t('Straighten')), fineInput, fineOut),
          h('div', { class: 'photo__control' }, readBtn, clearSel)),
        stage,
        keysHint),
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
      // While another photo opens, they would act on the one it replaces.
      // Disabled, a control would drop keyboard focus: it goes to the photo.
      const controls = [rotateLeft, rotateRight, flipBtn, fineInput, readBtn];
      const off = !view || Boolean(opening);
      if (off && view && controls.includes(document.activeElement)) canvas.focus();
      for (const control of controls) control.disabled = off;
    }

    /** Step 3 stays empty until a photo has been read. */
    function showPlaceholder() {
      out.replaceChildren();
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

    /**
     * Load a photo ({ blob }) or a sample ({ sample, seed }) and read it.
     * `kept`, from "Use this code", brings it back as it was then: turned,
     * straightened, flipped, boxed and read.
     */
    async function load(p, kept) {
      if (p.sample) {
        ++loads; // a photo still opening gives way
        opening = null;
        const syn = reader.synthesize(Object.assign({ width: 640, height: 150 }, p.sample.synth));
        const rgba = reader.compose(syn, { look: p.sample.look, noise: 12, blur: 1, seed: p.seed });
        const c = document.createElement('canvas');
        c.width = syn.width;
        c.height = syn.height;
        c.getContext('2d').putImageData(new ImageData(rgba, syn.width, syn.height), 0, 0);
        const another = h('button', { type: 'button', class: 'text-button', onClick: () => load(nextSample()) }, t('Show another sample'));
        const hadFocus = sourceNote.contains(document.activeElement);
        setSource(p, c, c.width, c.height, [p.sample.note, ' ', another], kept);
        if (hadFocus) another.focus();
        return;
      }
      // A file of another type is refused; one of unknown type (no extension,
      // or one the system doesn't know, such as ".HEIC") is tried anyway.
      const unknown = p.blob && (p.blob.type === '' || p.blob.type === 'application/octet-stream');
      const other = !p.blob || (!unknown && !/^image\//.test(p.blob.type));
      // A file dropped or pasted on the folded reader opens it: what follows shows in its steps.
      unfold();
      // Focus on "Use this code" or "Show another sample", about to be replaced, goes to the photo.
      const at = document.activeElement;
      if (view && at && (out.contains(at) || sourceNote.contains(at))) canvas.focus({ preventScroll: true });
      if (other) {
        // A photo still opening carries on; the one shown is not read further,
        // so that its reading doesn't replace this message.
        stopSearch();
        result = null;
        showMessage(t('That file is not an image.'), true);
        setStep();
        draw();
        return;
      }
      const ticket = ++loads;
      stopSearch(); // the photo shown now: its reading would come after this one's message
      result = null;
      opening = p;
      showMessage(t('Opening the photo…'));
      setStep();
      draw();
      try {
        // Another photo, or Remove, may come first.
        const { image, w, hgt, width, height } = await decode(p.blob, () => ticket !== loads);
        if (ticket !== loads) {
          if (image.close) image.close();
          return;
        }
        opening = null;
        setSource(p, image, w, hgt, [t('Your photo, {width} × {height} pixels.', { width, height })], kept);
        if (image.close) image.close();
      } catch (e) {
        if (ticket === loads) {
          opening = null;
          // Brought back by "Open the photo", the file may have been moved or
          // deleted since: the reader starts again rather than show another photo.
          const hadFocus = section.contains(document.activeElement);
          if (kept) reset();
          if (kept && hadFocus) chooseBtn.focus({ preventScroll: true });
          showMessage(kept ? t('This photo can no longer be opened. Choose it again.') : t('This image could not be opened. Try a JPEG, PNG or WebP file.'), true);
          setStep();
          draw();
        }
      }
    }

    /**
     * A photo file, decoded and shrunk to the working size: the image, its
     * size (w × hgt) and the size as taken. createImageBitmap does both.
     * Chromium decodes away from the page's main thread, but shrinks on it
     * (about 0.1 s for 48 megapixels), and other browsers may do both on it,
     * so the page gets a moment between the long steps. A photo replaced
     * meanwhile (`stale`) goes no further. For files that way can't open, an
     * <img> does it.
     */
    async function decode(blob, stale) {
      let full = null;
      try {
        full = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      } catch (e) {
        full = null; // not supported here, or not for this file
      }
      if (full) {
        const { width, height } = full;
        if (!width || !height) throw new Error('empty image');
        const scale = Math.min(1, MAX_WORKING_SIDE / Math.max(width, height));
        if (scale === 1) return { image: full, w: width, hgt: height, width, height };
        await pause();
        if (stale()) return { image: full, w: width, hgt: height, width, height };
        let small = null;
        try {
          small = await createImageBitmap(full, { resizeWidth: atLeastOne(width * scale), resizeHeight: atLeastOne(height * scale), resizeQuality: 'high' });
        } catch (e) {
          return { image: full, w: width, hgt: height, width, height }; // shrunk on the page instead
        }
        full.close();
        await pause();
        return { image: small, w: small.width, hgt: small.height, width, height };
      }
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        if (!width || !height) throw new Error('empty image');
        return { image: img, w: width, hgt: height, width, height };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function nextSample() {
      const all = samples();
      const sample = all[sampleIndex++ % all.length];
      return { sample, seed: sampleIndex };
    }

    function setSource(p, drawable, w, hgt, note, kept) {
      picture = p;
      const scale = Math.min(1, MAX_WORKING_SIDE / Math.max(w, hgt));
      source = document.createElement('canvas');
      source.width = atLeastOne(w * scale);
      source.height = atLeastOne(hgt * scale);
      source.getContext('2d').drawImage(drawable, 0, 0, source.width, source.height);
      result = null;
      stage.hidden = false;
      section.classList.remove('is-folded');
      replace(sourceNote, ...note);
      if (kept) {
        restore(kept);
        return;
      }
      setView(0, 0, false);
      setStep();
      find();
    }

    /** Turn, straighten and flip the photo as given, and show it so. */
    function setView(quarterTurns, degrees, flipped) {
      turns = quarterTurns;
      fine = degrees;
      flip = flipped;
      fineInput.value = String(fine);
      canvas.style.transform = '';
      showFine();
      flipBtn.setAttribute('aria-pressed', String(flip));
      rebuildView();
    }

    /** The photo as it was when its code was used: the same view, so the same reading, without searching again. */
    function restore(kept) {
      setView(kept.turns, kept.fine, kept.flip);
      selection = kept.selection;
      clearSel.hidden = !selection;
      result = kept.result;
      showResult();
      setStep();
      draw();
    }

    function reset() {
      loads++; // a photo still opening stays away too
      opening = null;
      stopSearch();
      picture = null;
      source = null;
      view = null;
      result = null;
      selection = null;
      corner = null;
      pointer = null;
      turns = 0;
      fine = 0;
      flip = false;
      fineInput.value = '0';
      canvas.style.transform = '';
      showFine();
      flipBtn.setAttribute('aria-pressed', 'false');
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
      view.width = atLeastOne(w * cos + hh * sin);
      view.height = atLeastOne(w * sin + hh * cos);
      // Read back again and again (getImageData): kept in memory rather than on the GPU.
      const ctx = view.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#808080';
      ctx.fillRect(0, 0, view.width, view.height);
      // Rotate first, then mirror the rotated image left to right as shown.
      ctx.translate(view.width / 2, view.height / 2);
      if (flip) ctx.scale(-1, 1);
      ctx.rotate(angle);
      ctx.drawImage(source, -w / 2, -hh / 2);
      selection = null;
      corner = null;
      pointer = null;
      dragStart = null; // a press begun on the old view ends with it
      pressId = null;
      dragging = false;
      clearSel.hidden = true;
      draw();
    }

    /** The straightening shown beside the slider, and read out by it. */
    function showFine(degrees = fine) {
      fineOut.textContent = `${degrees > 0 ? '+' : ''}${degrees}°`;
      fineInput.setAttribute('aria-valuetext', t('{n} degrees', { n: degrees }));
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
      canvas.width = atLeastOne(view.width * scale * dpr);
      canvas.height = atLeastOne(view.height * scale * dpr);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(view, 0, 0, canvas.width, canvas.height);
      const k = displayScale();
      // The box, or the one being made from a first corner to the mouse.
      const box = corner && pointer ? rect(corner, pointer) : selection;
      if (box && box.w > 0 && box.h > 0) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(view, box.x, box.y, box.w, box.h, box.x * k, box.y * k, box.w * k, box.h * k);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 * dpr;
        ctx.setLineDash([6 * dpr, 4 * dpr]);
        ctx.strokeRect(box.x * k, box.y * k, box.w * k, box.h * k);
        ctx.restore();
      }
      if (result && result.found) drawGrid(ctx, k, dpr);
      if (corner) drawCorner(ctx, corner, k, dpr);
    }

    /** The first corner of a box made by clicks: a white dot with a dark ring. */
    function drawCorner(ctx, p, k, dpr) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x * k, p.y * k, 4.5 * dpr, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2 * dpr;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.stroke();
      ctx.restore();
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
      for (let c = 0; c < r.cells; c++) {
        const x = r.x0 + c * r.unit;
        const xm = x + r.unit / 2;
        for (const [y, bit, color] of [[r.clockY, clockBits[c], '#4fb6c9'], [r.dataY, bits[c], '#ffd166']]) {
          const yy = y + (xm - cx) * r.slope;
          ctx.strokeStyle = color;
          ctx.lineWidth = bit === '1' ? Math.max(2, 2.4 * dpr) : Math.max(1, 1.2 * dpr);
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

    // A box is dragged, or made by clicking two opposite corners (for those
    // who can click but not drag), or moved with the keyboard.
    let dragStart = null;
    let pressedAt = null; // on screen, to tell a click from a drag
    let pressId = null; // the pointer pressing; a second one means a pinch, not a box
    let dragging = false;
    let selectionBefore = null;
    const cancelPress = () => {
      dragStart = null;
      pressId = null;
      selection = selectionBefore;
      draw();
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (!view || opening || e.button !== 0) return;
      if (dragStart) {
        cancelPress();
        return;
      }
      pressId = e.pointerId;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch (err) {
        // pointer already gone (or synthetic): the drag still works without capture
      }
      selectionBefore = selection;
      dragStart = toView(e);
      pressedAt = { x: e.clientX, y: e.clientY, slack: CLICK[e.pointerType] || CLICK.mouse };
      dragging = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!dragStart) {
        // After a first click, the box follows the mouse.
        if (corner && e.pointerType === 'mouse') {
          pointer = toView(e);
          draw();
        }
        return;
      }
      if (e.pointerId !== pressId) return;
      if (!dragging && Math.hypot(e.clientX - pressedAt.x, e.clientY - pressedAt.y) < pressedAt.slack) return;
      dragging = true;
      corner = null;
      selection = rect(dragStart, toView(e));
      draw();
    });
    canvas.addEventListener('pointerleave', () => {
      if (!pointer) return;
      pointer = null;
      draw();
    });
    const endDrag = (e) => {
      if (!dragStart || e.pointerId !== pressId) return;
      const start = dragStart;
      dragStart = null;
      pressId = null;
      if (!dragging) {
        markCorner(start);
        return;
      }
      const r = rect(start, toView(e));
      if (tooSmall(r)) {
        // Too small to hold a barcode: keep the box there was.
        selection = selectionBefore;
        draw();
        return;
      }
      setBox(r);
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', () => {
      if (dragStart) cancelPress();
    });

    /** A click marks one corner of a box; the next marks the opposite corner and reads the box. */
    function markCorner(p) {
      if (!corner) {
        corner = p;
        draw();
        return;
      }
      const r = rect(corner, p);
      corner = null;
      pointer = null;
      if (tooSmall(r)) {
        draw(); // the same place twice: no box
        return;
      }
      setBox(r);
    }

    /** Whether a box is too small to be meant, on screen or in the photo. */
    function tooSmall(r) {
      const k = canvas.getBoundingClientRect().width / view.width; // CSS pixels per photo pixel
      return r.w < MIN_BOX.photo[0] || r.h < MIN_BOX.photo[1] || r.w * k < MIN_BOX.screen[0] || r.h * k < MIN_BOX.screen[1];
    }

    function setBox(r) {
      selection = r;
      clearSel.hidden = false;
      find();
    }

    function clearSelection() {
      selection = null;
      corner = null;
      pointer = null;
      clearSel.hidden = true;
      find();
    }

    const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const clamp = (v, lo, hi) => Math.round(Math.min(hi, Math.max(lo, v)));

    /** The keyboard's box starts around the barcode that was read, or on the middle of the photo. */
    function startBox() {
      const r = result;
      if (!r || !r.found) {
        return { x: Math.round(view.width / 4), y: Math.round(view.height / 4), w: Math.round(view.width / 2), h: Math.round(view.height / 2) };
      }
      const w = r.cells * r.unit;
      const tilt = (Math.abs(r.slope) * w) / 2;
      const middle = (r.x0 + w / 2 - r.regionWidth / 2) * r.slope; // how far the rows rise or fall at the code's middle
      const gap = Math.abs(r.dataY - r.clockY);
      const left = clamp(r.offset.x + r.x0 - 2 * r.unit, 0, view.width);
      const top = clamp(r.offset.y + Math.min(r.clockY, r.dataY) + middle - gap - tilt, 0, view.height);
      const right = clamp(r.offset.x + r.x0 + w + 2 * r.unit, 0, view.width);
      const bottom = clamp(r.offset.y + Math.max(r.clockY, r.dataY) + middle + gap + tilt, 0, view.height);
      return { x: left, y: top, w: right - left, h: bottom - top };
    }

    canvas.addEventListener('keydown', (e) => {
      if (!view || opening || e.altKey || e.ctrlKey || e.metaKey) return;
      keysHint.hidden = false; // also after a click gave the photo focus
      const dir = ARROWS[e.key];
      if (dir) {
        e.preventDefault();
        // A step is a 50th of the photo's width, or a 25th of its height.
        const dx = dir[0] * Math.max(2, Math.round(view.width / 50));
        const dy = dir[1] * Math.max(2, Math.round(view.height / 25));
        const b = selection;
        corner = null;
        if (!b) selection = startBox();
        else if (e.shiftKey) selection = { x: b.x, y: b.y, w: clamp(b.w + dx, 12, view.width - b.x), h: clamp(b.h + dy, 8, view.height - b.y) };
        else selection = { x: clamp(b.x + dx, 0, view.width - b.w), y: clamp(b.y + dy, 0, view.height - b.h), w: b.w, h: b.h };
        clearSel.hidden = false;
        draw();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (selection) setBox(selection);
        else find(); // the whole photo, as "Read again" does
      } else if (e.key === 'Escape') {
        if (corner) {
          corner = null;
          pointer = null;
          draw();
        } else if (selection) {
          clearSelection();
        } else {
          return;
        }
        e.preventDefault();
      }
    });
    canvas.addEventListener('focus', () => {
      keysHint.hidden = !canvas.matches(':focus-visible');
    });
    // Left for a press elsewhere, as on "Use this code" below, the hint goes
    // only once that click is over: hidden at once, it would move what is
    // below it out from under the pointer, and the click would miss. A tap's
    // press is already over when focus moves; its click comes just after.
    let pressing = false;
    document.addEventListener('pointerdown', () => { pressing = true; }, true);
    for (const type of ['pointerup', 'pointercancel']) document.addEventListener(type, () => { pressing = false; }, true);
    canvas.addEventListener('blur', () => {
      const hide = () => { if (document.activeElement !== canvas) keysHint.hidden = true; };
      if (pressing) window.addEventListener('pointerup', () => setTimeout(hide), { once: true });
      else setTimeout(hide);
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
      readBtn.removeAttribute('aria-disabled');
    }

    function find() {
      if (!view || opening) return;
      stopSearch();
      const search = new AbortController();
      searching = search;
      const usable = selection && selection.w >= 12 && selection.h >= 8;
      const region = usable ? selection : { x: 0, y: 0, w: view.width, h: view.height };
      showMessage(t('Looking for the barcode…'));
      // aria-disabled rather than disabled, so keyboard focus stays on the button.
      readBtn.setAttribute('aria-disabled', 'true');
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
          result = Object.assign(r, { offset: { x: region.x, y: region.y }, regionWidth: region.w, box: usable ? region : null });
          showResult();
        } else {
          result = null;
          showMessage(usable
            ? t('This part of the image could not be read. Select the barcode again, or clear the selection.')
            : t('This image could not be read. Try another photo.'), true);
        }
        readBtn.removeAttribute('aria-disabled');
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
        out.replaceChildren(h('p', { class: 'form-message is-error' }, reasons()[r.reason] || t('No barcode found.')));
        return;
      }
      const d = r.decoded;
      const info = d.part1 ? lookup.byDx(d.part1, d.part2) : null;
      const name = info && root.DX.ui.filmName(info); // as the result's heading names it
      const what = d.frame === null ? `DX ${d.dxNumber}` : t('DX {dx}, frame {frame}', { dx: d.dxNumber, frame: d.frameLabel });
      const notes = [];
      if (r.reversed) notes.push(t('The film is mirrored or upside down in this photo; the code was read in the right direction anyway.'));
      if (r.polarity === 'light') notes.push(t('Clear bars on a dark edge: read as slide film.'));
      if (r.format === 'short') notes.push(t('An older 7-bar code, without a frame number.'));
      if (r.confidence < 0.3) notes.push(t('Some cells were hard to tell apart; compare the result with your film.'));
      if (r.weak) notes.push(t('The bars are faint or damaged in this photo; compare the result with your film.'));
      if (r.elevenBars) notes.push(t('If the top row of your film has 11 thin bars, not 7, this reading is incomplete: read it again with a little room at both ends of the barcode.'));
      if (!d.valid) notes.push(t('The code as read does not pass all checks. Use it, then look at the suggested corrections.'));
      const apply = h('button', { type: 'button', class: 'tool tool--primary' }, t('Use this code'));
      apply.addEventListener('click', () => onApply(r.bits, r.format, r.polarity, {
        label: what,
        photo: thumbnail(view, { x: 0, y: 0, w: view.width, h: view.height }, 120, 72),
        lined: lineUp(r),
        // For "Open the photo", once the reader has moved on to another.
        kept: { picture, turns, fine, flip, selection: r.box, result: r },
      }));
      replace(out,
        h('p', { class: `photo__found${d.valid ? '' : ' is-error'}` },
          h('strong', null, what), name ? i18n.punctuation().colon + name : d.valid ? i18n.punctuation().colon + t('not in the lists') : ''),
        h('p', { class: 'fineprint' }, t('Outlined in the photo: the cells that were read, top row in blue, lower row in yellow (bold outline = bar).')),
        notes.length ? h('ul', { class: 'photo__notes' }, notes.map((n) => h('li', null, n))) : null,
        h('div', { class: 'result__actions' }, apply));
    }

    // ---- wiring ------------------------------------------------------------------------

    chooseBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) load({ blob: fileInput.files[0] });
      fileInput.value = '';
    });
    sampleBtn.addEventListener('click', () => load(nextSample()));
    // The same as "Open the photo" above the strip, which app.js handles.
    unfoldBtn.addEventListener('click', onOpen);
    rotateLeft.addEventListener('click', () => { turns = (turns + 3) % 4; result = null; rebuildView(); find(); });
    rotateRight.addEventListener('click', () => { turns = (turns + 1) % 4; result = null; rebuildView(); find(); });
    flipBtn.addEventListener('click', () => {
      flip = !flip;
      flipBtn.setAttribute('aria-pressed', String(flip));
      result = null;
      rebuildView();
      find();
    });
    // While the slider moves, the photo on screen turns by the difference;
    // the full-size view is rebuilt and read once it stops. Back where it
    // started, nothing changes.
    fineInput.addEventListener('input', () => {
      const degrees = Number(fineInput.value);
      showFine(degrees);
      const turn = degrees - fine;
      canvas.style.transform = turn ? `rotate(${flip ? -turn : turn}deg)` : '';
    });
    fineInput.addEventListener('change', () => {
      canvas.style.transform = '';
      if (Number(fineInput.value) === fine) return;
      fine = Number(fineInput.value);
      result = null;
      rebuildView();
      setStep();
      find();
    });
    readBtn.addEventListener('click', () => {
      if (readBtn.getAttribute('aria-disabled') !== 'true') find();
    });
    // The button goes with the box: carry on at the photo.
    clearSel.addEventListener('click', () => {
      clearSelection();
      canvas.focus();
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
      if (file) load({ blob: file });
    });
    // Pasted while typing, text goes where it is typed; elsewhere, even on the
    // Straighten slider, an image opens.
    const typing = (el) => el && (el.isContentEditable || el.tagName === 'TEXTAREA'
      || (el.tagName === 'INPUT' && /^(text|search|url|tel|email|password|number)$/.test(el.type)));
    document.addEventListener('paste', (e) => {
      if (section.hidden || typing(e.target)) return;
      const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
      if (item) {
        e.preventDefault();
        load({ blob: item.getAsFile() });
      }
    });
    window.addEventListener('resize', draw);

    showPlaceholder();
    setStep();

    return {
      /**
       * Show the reader, unfolded; with focus, also bring it into view and
       * focus its next step. With `kept` (from "Use this code"), show that
       * reading as it was, if the reader has moved on from it: to another
       * photo, or to the same one turned, flipped or boxed differently.
       */
      open(options) {
        section.hidden = false;
        const kept = options && options.kept;
        if (kept && kept.result !== result) {
          if (kept.picture === picture) {
            loads++; // a photo still opening gives way
            opening = null;
            restore(kept);
          } else {
            load(kept.picture, kept);
          }
        }
        unfold();
        if (options && options.focus) {
          section.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
          // While its photo opens, Read again is disabled: the photo shown meanwhile takes focus.
          (opening ? (view ? canvas : chooseBtn) : view ? readBtn : chooseBtn).focus({ preventScroll: true });
        }
      },
      close() {
        section.hidden = true;
      },
      fold,
      /** Forget the photo `p` if it is the one loaded or opening (and so stop any photo opening): back to step 1. */
      forget(p) {
        if (p === picture || p === opening) reset();
      },
      /** Show the steps again if folded: the strip no longer has this photo's code. */
      unfold() {
        if (section.classList.contains('is-folded')) unfold();
      },
    };
  }

  root.DX.ui = root.DX.ui || {};
  root.DX.ui.createPhoto = createPhoto;
})(globalThis);
