/* ==========================================================================
   ui.js — bottom sheets, action sheets, toasts, confirms + shared renderers
   ========================================================================== */
(function () {
  'use strict';

  const host = () => App.$('#sheet-host');
  const stack = [];

  /* ---------------------------------------------------------- Bottom sheet */
  /**
   * UI.sheet({ title, subtitle, body, footer, full, headerRight, onOpen, onClose,
   *            dismissible })
   * Returns { el, close, setBody, setFooter, setTitle }.
   */
  function sheet(cfg) {
    const o = Object.assign({ dismissible: true, full: false }, cfg);

    const wrap = document.createElement('div');
    wrap.className = 'sheet-layer';
    wrap.style.cssText = 'position:absolute;inset:0;pointer-events:none';
    wrap.innerHTML =
      `<div class="scrim" data-sheet-scrim></div>
       <div class="sheet${o.full ? ' full' : ''}" role="dialog" aria-modal="true">
         <div class="sheet-grip" data-sheet-grip><i></i></div>
         <div class="sheet-head">
           <div class="grow">
             <h2>${App.esc(o.title || '')}</h2>
             ${o.subtitle ? `<p class="sub">${o.subtitle}</p>` : ''}
           </div>
           ${o.headerRight || ''}
           <button class="x" type="button" data-sheet-x aria-label="Close">${App.icon('close')}</button>
         </div>
         <div class="sheet-body${o.footer ? '' : ' no-foot'}">${o.body || ''}</div>
         ${o.footer ? `<div class="sheet-foot">${o.footer}</div>` : ''}
       </div>`;

    host().appendChild(wrap);
    host().style.pointerEvents = 'auto';

    const sheetEl = wrap.querySelector('.sheet');
    const bodyEl = wrap.querySelector('.sheet-body');
    const footEl = wrap.querySelector('.sheet-foot');

    const api = {
      el: wrap,
      sheetEl, bodyEl,
      close,
      setTitle(t) { wrap.querySelector('.sheet-head h2').textContent = t; },
      setSubtitle(t) {
        let p = wrap.querySelector('.sheet-head .sub');
        if (!p) {
          p = document.createElement('p'); p.className = 'sub';
          wrap.querySelector('.sheet-head .grow').appendChild(p);
        }
        p.innerHTML = t;
      },
      setBody(html) { bodyEl.innerHTML = html; },
      setFooter(html) { if (footEl) footEl.innerHTML = html; }
    };

    function close(result) {
      const i = stack.indexOf(api);
      if (i === -1) return;
      stack.splice(i, 1);
      wrap.classList.remove('sheet-open');
      sheetEl.style.transform = '';
      setTimeout(() => {
        wrap.remove();
        if (!stack.length) host().style.pointerEvents = 'none';
      }, 340);
      if (o.onClose) { try { o.onClose(result); } catch (e) { console.error(e); } }
    }

    if (o.dismissible) {
      wrap.querySelector('[data-sheet-scrim]').addEventListener('click', () => close());
    }
    wrap.querySelector('[data-sheet-x]').addEventListener('click', () => close());

    /* drag-to-dismiss from the grip */
    const grip = wrap.querySelector('[data-sheet-grip]');
    let startY = 0, dy = 0, dragging = false, t0 = 0;
    grip.addEventListener('pointerdown', e => {
      dragging = true; startY = e.clientY; dy = 0; t0 = Date.now();
      sheetEl.style.transition = 'none';
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
    });
    grip.addEventListener('pointermove', e => {
      if (!dragging) return;
      dy = Math.max(0, e.clientY - startY);
      sheetEl.style.transform = 'translateY(' + dy + 'px)';
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      sheetEl.style.transition = '';
      const fast = dy > 40 && (Date.now() - t0) < 260;
      if (dy > sheetEl.offsetHeight * 0.28 || fast) { close(); }
      else { sheetEl.style.transform = ''; }
    };
    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);

    stack.push(api);
    App.raf(() => wrap.classList.add('sheet-open'));
    if (o.onOpen) App.raf(() => { try { o.onOpen(wrap); } catch (e) { console.error(e); } });
    App.haptic('light');
    return api;
  }

  function closeTop(result) {
    if (stack.length) stack[stack.length - 1].close(result);
  }
  function closeAll() { while (stack.length) stack[stack.length - 1].close(); }

  /* ---------------------------------------------------------- Action sheet */
  /** items: [{ label, icon, danger, onClick }] — a null item renders a divider. */
  function actions(cfg) {
    const items = (cfg.items || []).filter(Boolean);
    const body = '<div class="action-sheet">' + items.map((it, i) =>
      it === '-' ? '<div class="action-sep"></div>' :
      `<button class="action-item${it.danger ? ' danger' : ''}" type="button" data-ai="${i}">
         ${it.icon ? App.icon(it.icon) : '<span style="width:21px"></span>'}<span>${App.esc(it.label)}</span>
       </button>`).join('') + '</div>';

    const s = sheet({
      title: cfg.title || '',
      subtitle: cfg.subtitle,
      body,
      onOpen(el) {
        el.querySelectorAll('[data-ai]').forEach(btn => {
          btn.addEventListener('click', () => {
            const it = items[Number(btn.dataset.ai)];
            s.close();
            if (it && it.onClick) setTimeout(() => it.onClick(), 180);
          });
        });
      }
    });
    return s;
  }

  /* -------------------------------------------------------------- Confirm */
  function confirm(cfg) {
    return new Promise(resolve => {
      let done = false;
      const s = sheet({
        title: cfg.title || 'Are you sure?',
        body: `<p class="muted" style="font-size:14.5px;line-height:1.5;padding:2px 2px 6px">${App.esc(cfg.message || '')}</p>`,
        footer: `<button class="btn ghost" type="button" data-cf="0">${App.esc(cfg.cancelLabel || 'Cancel')}</button>
                 <button class="btn ${cfg.danger ? 'danger' : 'primary'}" type="button" data-cf="1">${App.esc(cfg.confirmLabel || 'Confirm')}</button>`,
        onOpen(el) {
          el.querySelectorAll('[data-cf]').forEach(b => b.addEventListener('click', () => {
            done = true; resolve(b.dataset.cf === '1'); s.close();
          }));
        },
        onClose() { if (!done) resolve(false); }
      });
    });
  }

  /* ---------------------------------------------------------------- Toast */
  let toastN = 0;
  function toast(msg, kind, action) {
    const host = App.$('#toast-host');
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'ok');
    el.innerHTML = App.icon(kind === 'err' ? 'info' : 'check') +
      `<span class="grow">${App.esc(msg)}</span>` +
      (action ? `<button type="button">${App.esc(action.label)}</button>` : '');
    if (action) {
      el.querySelector('button').addEventListener('click', () => { kill(); action.onClick(); });
    }
    host.appendChild(el);
    const id = ++toastN;
    const timer = setTimeout(kill, action ? 5200 : 2600);
    function kill() {
      clearTimeout(timer);
      if (!el.isConnected) return;
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }
    // Never let more than three stack up.
    while (host.children.length > 3) host.firstElementChild.remove();
    return { close: kill, id };
  }
  App.toast = toast;

  /* --------------------------------------------------- Shared renderers */

  /** Progress bar row for a macro. */
  function macroCell(cls, label, value, target, unit) {
    const pct = App.clamp(App.pct(value, target), 0, 100);
    const over = value > target * 1.02;
    return `<div class="macro ${cls}">
      <div class="top">
        <span class="name">${label}</span>
        <span class="num">${App.n(value, 0)}<small>/${App.n(target, 0)}${unit || 'g'}</small></span>
      </div>
      <div class="bar${over ? ' over' : ''}"><i style="width:${pct}%"></i></div>
    </div>`;
  }

  /**
   * Grid of micronutrient progress rows.
   * `split` optionally carries { food, supp } totals so the bar can show how
   * much of each nutrient came from a pill rather than from a meal.
   */
  function microGrid(totals, targets, filter, split) {
    const list = Nutrition.MICROS.filter(m => !filter || m.group === filter);
    return '<div class="micro-grid">' + list.map(m => {
      const val = totals[m.k] || 0;
      const tgt = targets.micros[m.k] || 0;
      const pct = App.pct(val, tgt);
      const cls = m.limit ? (pct > 100 ? 'over' : 'good') : (pct >= 80 ? 'good' : pct >= 40 ? '' : 'low');
      const color = m.limit
        ? (pct > 100 ? 'var(--protein)' : 'var(--brand)')
        : (pct >= 80 ? 'var(--brand)' : pct >= 40 ? 'var(--carbs)' : 'var(--warn)');

      let bar;
      if (split && (split.supp[m.k] || 0) > 0) {
        const fPct = App.clamp(App.pct(split.food[m.k] || 0, tgt), 0, 100);
        const sPct = App.clamp(App.pct(split.supp[m.k] || 0, tgt), 0, 100 - fPct);
        bar = `<div class="bar" style="display:flex;gap:0">
          <i style="width:${fPct}%;background:var(--brand);border-radius:5px 0 0 5px"></i>
          <i style="width:${sPct}%;background:var(--fiber);border-radius:0 5px 5px 0"></i></div>`;
      } else {
        bar = `<div class="bar" style="color:${color}"><i style="width:${App.clamp(pct, 0, 100)}%"></i></div>`;
      }

      return `<div class="micro ${cls}">
        <div class="lab"><b>${m.label}</b><span>${Math.round(pct)}%</span></div>
        ${bar}
      </div>`;
    }).join('') + '</div>';
  }

  /* -------------------------------------------------------- food quality */

  /** Small A–E grade chip for list rows. */
  function gradePill(rating, small) {
    if (!rating) return '';
    return `<span class="q-pill${small ? ' sm' : ''}" style="background:${rating.color}"
      title="Quality ${rating.score}/100 — ${rating.label}">${rating.grade}</span>`;
  }

  /** Full quality breakdown: ring, grade, per-criterion bars and tags. */
  function qualityCard(food) {
    const r = Quality.rate(food);
    if (!r) return '';

    const tags = [];
    if (r.nova) {
      const novaLabel = ['', 'Unprocessed', 'Basic ingredient', 'Processed', 'Ultra-processed'][r.nova];
      tags.push({ text: novaLabel + (r.estimatedNova ? ' (est.)' : ''), cls: r.nova <= 2 ? 'good' : r.nova === 4 ? 'bad' : '' });
    }
    if (typeof food.additives === 'number' && food.additives >= 0) {
      tags.push({ text: food.additives === 0 ? 'No additives' : food.additives + ' additives',
        cls: food.additives === 0 ? 'good' : food.additives > 5 ? 'bad' : '' });
    }
    if (food.nutriscore) tags.push({ text: 'Nutri-Score ' + food.nutriscore, cls: '' });
    if (food.vegan) tags.push({ text: 'Vegan', cls: 'good' });
    else if (food.vegetarian) tags.push({ text: 'Vegetarian', cls: 'good' });
    if (food.palmOilFree) tags.push({ text: 'Palm-oil free', cls: 'good' });

    return `
      <div class="q-hero">
        <div class="q-ring">
          ${Charts.rings([{ pct: r.score, color: r.color }], { size: 68, stroke: 7 })}
          <div class="q-score"><b style="color:${r.color}">${r.score}</b><span>/100</span></div>
        </div>
        <div class="q-meta">
          <h4 style="color:${r.color}">${r.grade} · ${r.label}</h4>
          <p>${qualitySummary(r)}</p>
        </div>
      </div>
      ${tags.length ? `<div class="q-tags">${tags.map(t =>
        `<span class="q-tag ${t.cls}">${App.esc(t.text)}</span>`).join('')}</div>` : ''}
      <div class="q-bars">
        ${r.parts.map(p => `
          <div class="q-row">
            <span class="q-name">${p.label}</span>
            <div class="bar" style="color:${p.pct >= 70 ? 'var(--brand)' : p.pct >= 40 ? 'var(--fat)' : 'var(--protein)'}">
              <i style="width:${Math.round(p.pct)}%"></i></div>
            <span class="q-note">${App.esc(p.note || Math.round(p.pct) + '%')}</span>
          </div>`).join('')}
      </div>
      ${r.confidence < 100 ? `<p class="tiny muted mt12" style="line-height:1.5">
        Rated on ${r.confidence}% of the criteria — this product does not publish the rest.
        Missing data is left out rather than counted against it.</p>` : ''}`;
  }

  function qualitySummary(r) {
    const sorted = r.parts.slice().sort((a, b) => a.pct - b.pct);
    const worst = sorted[0], best = sorted[sorted.length - 1];
    if (r.score >= 80) return `Strong across the board — best on ${best.label.toLowerCase()}.`;
    if (worst.pct < 35) return `Held back by ${worst.label.toLowerCase()}.`;
    return `Good ${best.label.toLowerCase()}, weaker ${worst.label.toLowerCase()}.`;
  }

  function emptyState(icon, title, text, actionHtml) {
    return `<div class="empty">
      <div class="ic">${App.icon(icon)}</div>
      <h3>${App.esc(title)}</h3>
      ${text ? `<p>${App.esc(text)}</p>` : ''}
      ${actionHtml || ''}
    </div>`;
  }

  /** Compact "P 32 · C 41 · F 9" string. */
  function macroLine(n) {
    return `P ${App.n(n.protein, 0)} · C ${App.n(n.carbs, 0)} · F ${App.n(n.fat, 0)}`;
  }

  /** Read every [name] field inside a container into a plain object. */
  function readForm(root) {
    const out = {};
    App.$$('[name]', root).forEach(el => {
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else if (el.type === 'number') out[el.name] = el.value === '' ? null : Number(el.value);
      else out[el.name] = el.value;
    });
    return out;
  }

  /** Downscale an image File to a data URL that is safe to keep in IndexedDB. */
  function imageToDataURL(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Not an image'));
      const fr = new FileReader();
      fr.onerror = () => reject(fr.error);
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Could not read image'));
        img.onload = () => {
          const max = maxSize || 800;
          let { width: w, height: h } = img;
          const s = Math.min(1, max / Math.max(w, h));
          w = Math.round(w * s); h = Math.round(h * s);
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', quality || 0.72));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  window.UI = {
    sheet, closeTop, closeAll, actions, confirm, toast,
    macroCell, microGrid, emptyState, macroLine, readForm, imageToDataURL,
    gradePill, qualityCard,
    get openCount() { return stack.length; }
  };
})();
