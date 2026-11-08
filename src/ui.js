// Tiny DOM helpers. All user text goes through text nodes (never innerHTML).

function applyProps(el, props) {
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value' && 'value' in el) el.value = v;
    else if (k === 'checked' || k === 'selected') el[k] = Boolean(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Create an HTML element: h('div', { class: 'x' }, 'text', child) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  appendChildren(el, children);
  applyProps(el, props); // after children so <select value> works
  return el;
}

/** Create an SVG element. */
export function s(tag, props, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  appendChildren(el, children);
  applyProps(el, props);
  return el;
}

export function toast(message) {
  let host = document.getElementById('toasts');
  if (!host) {
    host = h('div', { id: 'toasts', 'aria-live': 'polite' });
    document.body.append(host);
  }
  const t = h('div', { class: 'toast' }, message);
  host.append(t);
  setTimeout(() => t.classList.add('out'), 2200);
  setTimeout(() => t.remove(), 2600);
}

export function debounce(fn, ms = 400) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => {
    clearTimeout(t);
    fn(...args);
  };
  return wrapped;
}

export function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pct = (x) => `${Math.round(x * 100)} %`;

// ---------- shared tooltip for [data-tip] elements (heatmap cells…) ----------

let tipEl;
function tip() {
  if (!tipEl) {
    tipEl = h('div', { class: 'tooltip', role: 'status' });
    document.body.append(tipEl);
  }
  return tipEl;
}

export function showTip(target, value, label) {
  const t = tip();
  t.replaceChildren(h('strong', null, value), label ? h('span', null, label) : null);
  t.classList.add('on');
  const r = target.getBoundingClientRect ? target.getBoundingClientRect() : target;
  const tw = t.offsetWidth;
  const th = t.offsetHeight;
  let x = r.left + r.width / 2 - tw / 2;
  x = Math.max(8, Math.min(window.innerWidth - tw - 8, x));
  let y = r.top - th - 8;
  if (y < 8) y = r.bottom + 8;
  t.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

export function hideTip() {
  tipEl?.classList.remove('on');
}

export function installTooltips() {
  const over = (e) => {
    const el = e.target.closest?.('[data-tip]');
    if (el) showTip(el, el.dataset.tip, el.dataset.tipLabel);
  };
  const out = (e) => {
    if (e.target.closest?.('[data-tip]')) hideTip();
  };
  document.addEventListener('pointerover', over);
  document.addEventListener('pointerout', out);
  document.addEventListener('focusin', over);
  document.addEventListener('focusout', out);
  window.addEventListener('scroll', hideTip, { passive: true });
}
