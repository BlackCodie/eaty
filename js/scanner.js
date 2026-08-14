/* ==========================================================================
   scanner.js — camera barcode scanner + product lookup flow
   ========================================================================== */
(function () {
  'use strict';

  /**
   * Open the camera and resolve with a barcode string, or null if cancelled.
   * Handles permissions, missing cameras and insecure origins with real messages.
   */
  function scan() {
    return new Promise(resolve => {
      let stream = null, decoder = null, loopTimer = null, done = false, track = null;

      const s = UI.sheet({
        full: true,
        title: 'Scan barcode',
        subtitle: 'Hold the barcode inside the frame',
        body: `
          <div class="scan-stage" id="sc-stage">
            <video id="sc-video" playsinline autoplay muted></video>
            <div class="scan-mask"><div class="scan-box"><i class="scan-laser"></i></div></div>
            <div class="scan-status" id="sc-status">Starting camera…</div>
          </div>
          <div class="row mt12" style="gap:10px">
            <button class="btn ghost grow" type="button" id="sc-manual">${App.icon('list')}Enter code</button>
            <button class="btn ghost" type="button" id="sc-torch" hidden aria-label="Torch">${App.icon('bolt')}</button>
          </div>
          <p class="tiny muted mt12" style="line-height:1.55">
            Products come from Open Food Facts. Only the barcode number is sent —
            nothing from your diary. Scanned products are saved on your device and
            work offline afterwards.
          </p>`,
        onOpen(el) {
          const video = el.querySelector('#sc-video');
          const status = el.querySelector('#sc-status');
          const setStatus = t => { status.textContent = t; };

          el.querySelector('#sc-manual').addEventListener('click', () => {
            manualEntry(code => { finish(code); });
          });

          start();

          async function start() {
            if (!window.isSecureContext) {
              return fail('The camera needs a secure connection (https). Open the app over https and try again.');
            }
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
              return fail('This browser cannot open the camera. Use the “Enter code” button instead.');
            }

            try {
              setStatus('Loading decoder…');
              decoder = await Barcode.createDecoder();
            } catch (err) {
              return fail(err.message || 'Could not load the barcode decoder.');
            }

            try {
              setStatus('Starting camera…');
              stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  facingMode: { ideal: 'environment' },
                  width: { ideal: 1280 }, height: { ideal: 720 }
                },
                audio: false
              });
            } catch (err) {
              const n = err && err.name;
              if (n === 'NotAllowedError' || n === 'SecurityError') {
                return fail('Camera access was blocked. Allow it in Settings → Safari → Camera, then reopen the scanner.');
              }
              if (n === 'NotFoundError' || n === 'OverconstrainedError') {
                return fail('No camera was found on this device.');
              }
              if (n === 'NotReadableError') {
                return fail('The camera is busy in another app. Close it and try again.');
              }
              return fail('Could not start the camera: ' + (err.message || n || 'unknown error'));
            }

            video.srcObject = stream;
            try { await video.play(); } catch (_) {}

            track = stream.getVideoTracks()[0];
            setupTorch();
            setStatus('Looking for a barcode…');
            loop();
          }

          function setupTorch() {
            if (!track || !track.getCapabilities) return;
            let caps = {};
            try { caps = track.getCapabilities() || {}; } catch (_) { return; }
            if (!('torch' in caps)) return;
            const btn = el.querySelector('#sc-torch');
            btn.hidden = false;
            let on = false;
            btn.addEventListener('click', async () => {
              on = !on;
              try {
                await track.applyConstraints({ advanced: [{ torch: on }] });
                btn.classList.toggle('primary', on);
              } catch (_) { UI.toast('Torch not available', 'err'); }
            });
          }

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          let pass = 0, frames = 0;

          async function loop() {
            if (done) return;
            const vw = video.videoWidth, vh = video.videoHeight;
            if (!vw || !vh) { loopTimer = setTimeout(loop, 160); return; }

            // Alternate a wide pass (barcode far away) with a tight centre-band
            // pass at higher resolution (barcode close up). Between them this
            // catches both how people actually hold a package.
            let sx, sy, sw, sh, outW;
            if (pass % 2 === 0) {
              sx = 0; sy = 0; sw = vw; sh = vh; outW = Math.min(800, vw);
            } else {
              sw = Math.round(vw * 0.86);
              sh = Math.round(vh * 0.42);
              sx = Math.round((vw - sw) / 2);
              sy = Math.round((vh - sh) / 2);
              outW = Math.min(1024, sw);
            }
            pass++;

            const scale = outW / sw;
            canvas.width = Math.round(sw * scale);
            canvas.height = Math.round(sh * scale);
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

            let code = null;
            try {
              const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
              code = await decoder.decode(img, canvas);
            } catch (err) {
              console.warn('[scan] decode error', err);
            }

            if (code) return finish(code);

            if (++frames === 60) setStatus('Still looking — try more light, or hold steadier');
            if (frames === 160) setStatus('No luck? Use “Enter code” to type the number');
            loopTimer = setTimeout(loop, 110);
          }

          function fail(msg) {
            setStatus('');
            el.querySelector('#sc-stage').innerHTML =
              `<div class="scan-error">${App.icon('info')}<p>${App.esc(msg)}</p></div>`;
          }

          function finish(code) {
            if (done) return;
            done = true;
            App.haptic('ok');
            cleanup();
            s.close();
            resolve(code);
          }

          function cleanup() {
            if (loopTimer) clearTimeout(loopTimer);
            if (decoder) { try { decoder.close(); } catch (_) {} }
            if (stream) stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
            stream = null;
          }

          s._cleanup = cleanup;
        },
        onClose() {
          if (s._cleanup) s._cleanup();
          if (!done) { done = true; resolve(null); }
        }
      });
    });
  }

  /* ------------------------------------------------------- manual entry */
  function manualEntry(onCode) {
    const s = UI.sheet({
      title: 'Enter barcode',
      subtitle: 'The number printed under the bars',
      body: `<div class="field">
               <label for="mb-code">Barcode</label>
               <input id="mb-code" type="text" inputmode="numeric" autocomplete="off"
                      placeholder="4008400202037" enterkeyhint="go">
               <div class="hint" id="mb-hint">Usually 8 or 13 digits.</div>
             </div>`,
      footer: `<button class="btn primary block" type="button" id="mb-go">${App.icon('search')}Look up</button>`,
      onOpen(el) {
        const input = el.querySelector('#mb-code');
        const go = () => {
          const code = input.value.replace(/\D/g, '');
          if (!code) return UI.toast('Type the barcode number', 'err');
          if (!Barcode.validGtin(code)) {
            el.querySelector('#mb-hint').innerHTML =
              '<span style="color:var(--warn)">That number fails its check digit — looking it up anyway.</span>';
          }
          s.close();
          onCode(code);
        };
        el.querySelector('#mb-go').addEventListener('click', go);
        input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        setTimeout(() => input.focus(), 120);
      }
    });
  }

  /* ------------------------------------------------------- lookup flow */

  /**
   * Resolve a barcode to a food.
   *   1. every GTIN encoding of the code against Open Food Facts
   *   2. USDA FoodData Central's branded set as a fallback
   * A hard network failure stops the chain early rather than pretending the
   * product does not exist.
   */
  async function resolve(code) {
    const codes = Barcode.variants(code);
    let lastErr = null;
    let netDown = false;

    // 0. Anything already on this device wins — including a product whose
    //    label the user has corrected by hand. The pack must never clobber it.
    for (const v of codes) {
      const mine = await OFF.localByBarcode(v);
      if (mine) return { food: mine, from: 'local' };
    }

    // 1. The bundled German supermarket pack — instant, and works with no
    //    signal, which is the normal state of affairs inside a supermarket.
    try {
      const packed = await LocalPack.lookup(code);
      if (packed) {
        await OFF.save(packed);
        return { food: packed, from: 'pack' };
      }
    } catch (_) { /* pack missing or unreadable — carry on */ }

    for (const v of codes) {
      try {
        return await OFF.lookup(v);
      } catch (err) {
        lastErr = err;
        if (err.code === 'offline' || err.code === 'timeout' || err.code === 'server' || err.code === 'unreachable') {
          netDown = true;
          break;
        }
      }
    }
    if (netDown) throw lastErr;

    for (const v of codes) {
      try {
        const food = await FDC.barcode(v);
        if (food) {
          await OFF.save(food);            // cache locally like any other product
          return { food, from: 'network' };
        }
      } catch (err) {
        if (err.code === 'offline' || err.code === 'timeout') { lastErr = err; break; }
      }
    }

    throw lastErr || Object.assign(new Error('not-found'), { code: 'not-found' });
  }

  /**
   * Full flow: scan → look up → portion sheet.
   * opts: { mode:'diary'|'pick', date, meal, onPick, parent }
   */
  async function scanAndAdd(opts) {
    // Scanning is nearly always more than one item, so the portion sheet keeps
    // an 'Add & scan' button unless a caller opts out.
    const o = Object.assign({ batch: true }, opts);
    const code = await scan();
    if (!code) return;
    await lookupAndOpen(code, o);
  }

  async function lookupAndOpen(code, o) {
    const busy = UI.sheet({
      title: 'Looking up…',
      subtitle: code,
      body: `<div class="empty" style="padding:26px 20px">
               <div class="ic" style="background:var(--brand-dim);color:var(--brand)">${App.icon('search')}</div>
               <h3>Searching Open Food Facts</h3>
               <p>Checking this device first, then the product database.</p>
               <div class="boot-bar mt8" style="width:150px"><i></i></div>
             </div>`
    });

    let result = null, err = null;
    try { result = await resolve(code); }
    catch (e) { err = e; }
    busy.close();
    await App.sleep(220);

    if (result) {
      const { food, from } = result;

      // A saved supplement needs no portion maths — scanning the tub means
      // "I took one", so log a dose and get out of the way.
      if (App.isSupplement(food)) {
        await Supplements.take(food, o.date || App.date.today(), 1);
        App.haptic('ok');
        UI.toast(food.name + ' · 1 ' + food.unitLabel + ' logged', 'ok');
        App.refresh();
        if (o.batch) setTimeout(() => scanAndAdd(o), 400);
        else if (o.parent) o.parent.close();
        return;
      }

      // The product exists but the database has no nutrition table for it.
      // Rather than claiming it does not exist, hand over a prefilled form.
      if (food.needsNutrition) {
        incomplete(food, code, o);
        return;
      }

      if (from === 'pack') UI.toast('Found offline', 'ok');
      else if (from === 'network') {
        UI.toast(food.partialMicros
          ? 'Found — label has macros only'
          : 'Found in Open Food Facts', 'ok');
      }
      FoodSheet.openPortion({ kind: 'food', data: food }, o, o.parent || null);
      return;
    }

    notFound(code, err, o);
  }

  /** Known product, missing nutrition table — offer to complete it. */
  function incomplete(food, code, o) {
    const s = UI.sheet({
      title: 'Found, but no label',
      subtitle: food.name,
      body: `<p class="muted" style="font-size:14.5px;line-height:1.55;padding:2px 2px 14px">
               Open Food Facts knows this product${food.brand ? ' from ' + App.esc(food.brand) : ''},
               but nobody has added its nutrition table yet. Type the values off the packet once and
               Eaty will remember them against this barcode — including offline.
             </p>
             <button class="btn primary block" type="button" id="ic-fill">
               ${App.icon('edit')}Enter the label</button>
             <button class="btn ghost block mt12" type="button" id="ic-skip">
               ${App.icon('refresh')}Scan something else</button>`,
      onOpen(el) {
        el.querySelector('#ic-fill').addEventListener('click', () => {
          s.close();
          setTimeout(() => FoodSheet.openCustomFood({
            prefill: food,
            barcode: code,
            onSaved(saved) {
              if (saved) FoodSheet.openPortion({ kind: 'food', data: saved }, o, o.parent || null);
            }
          }), 200);
        });
        el.querySelector('#ic-skip').addEventListener('click', () => {
          s.close();
          setTimeout(() => scanAndAdd(o), 200);
        });
      }
    });
  }

  function notFound(code, err, o) {
    const msg = OFF.message(err);
    const recoverable = err && ['offline','timeout','server','unreachable'].indexOf(err.code) !== -1;

    const s = UI.sheet({
      title: recoverable ? 'Could not reach the database' : 'Product not found',
      subtitle: code,
      body: `<p class="muted" style="font-size:14.5px;line-height:1.55;padding:2px 2px 14px">${App.esc(msg)}</p>
             <div class="stack" style="gap:10px">
               <button class="btn primary block" type="button" id="nf-create">
                 ${App.icon('plus')}Add this product myself</button>
               <button class="btn ghost block" type="button" id="nf-supp">
                 ${App.icon('sparkle')}Add as a supplement</button>
               <button class="btn ghost block" type="button" id="nf-retry">
                 ${App.icon('refresh')}${recoverable ? 'Try again' : 'Scan another'}</button>
             </div>
             <p class="tiny muted mt16" style="line-height:1.55">
               Typing the label in once saves it against this barcode, so the next scan
               finds it instantly — even with no connection.
             </p>`,
      onOpen(el) {
        el.querySelector('#nf-create').addEventListener('click', () => {
          s.close();
          setTimeout(() => FoodSheet.openCustomFood({
            barcode: code,
            onSaved(food) { if (food) FoodSheet.openPortion({ kind: 'food', data: food }, o, o.parent || null); }
          }), 200);
        });
        el.querySelector('#nf-supp').addEventListener('click', () => {
          s.close();
          // Vitamin and mineral products are barely covered by food databases,
          // so this is the normal path for a supplement rather than a fallback.
          setTimeout(() => Supplements.editor({
            barcode: code,
            onSaved(supp) {
              if (supp) Supplements.take(supp, o.date || App.date.today(), 1)
                .then(() => { UI.toast(supp.name + ' logged', 'ok'); App.refresh(); });
            }
          }), 200);
        });

        el.querySelector('#nf-retry').addEventListener('click', () => {
          s.close();
          setTimeout(() => recoverable ? lookupAndOpen(code, o) : scanAndAdd(o), 200);
        });
      }
    });
  }

  window.Scanner = { scan, scanAndAdd, lookupAndOpen, resolve, manualEntry };

  App.act({
    'scan-barcode': el => Scanner.scanAndAdd({
      mode: 'diary',
      date: App.state.date || App.date.today(),
      meal: (el && el.dataset.meal) || App.guessMeal()
    })
  });
})();
