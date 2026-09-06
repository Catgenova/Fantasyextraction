// Tiny DOM helpers. No framework — the screens are small enough that direct
// element construction stays readable and avoids a build step.

/**
 * el('div.hero-card', { onclick }, [children])
 * Tag string supports `tag.class.class#id`.
 */
export function el(spec, props = null, children = null) {
  const [head, ...classes] = String(spec).split('.');
  const [tag, id] = head.split('#');
  const node = document.createElement(tag || 'div');
  if (id) node.id = id;
  if (classes.length) node.className = classes.join(' ');

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = [node.className, value].filter(Boolean).join(' ');
      else if (key === 'style' && typeof value === 'object') applyStyle(node, value);
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key === 'html') node.innerHTML = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
  }

  append(node, children);
  return node;
}

/**
 * Custom properties have to go through setProperty. Object.assign onto a
 * CSSStyleDeclaration silently drops anything starting with `--`, which is how
 * every rarity colour and class accent in the game ended up unset and falling
 * back to grey.
 */
function applyStyle(node, style) {
  for (const [prop, value] of Object.entries(style)) {
    if (value == null) continue;
    if (prop.startsWith('--')) node.style.setProperty(prop, String(value));
    else node.style[prop] = value;
  }
}

export function append(node, children) {
  if (children == null || children === false) return node;
  if (Array.isArray(children)) {
    for (const child of children) append(node, child);
    return node;
  }
  node.appendChild(children instanceof Node ? children : document.createTextNode(String(children)));
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** A labelled <select> bound to a change handler. */
export function selectField(label, options, value, onChange, hint) {
  const sel = el('select', {
    onchange: (e) => onChange(e.target.value),
  }, options.map((o) => el('option', { value: o.value, selected: o.value === value }, o.label)));
  return el('div.field', null, [
    el('label', null, label),
    sel,
    hint ? el('div.hint', null, hint) : null,
  ]);
}

/** A percentage slider that reports 0..1 and shows its current value. */
export function sliderField(label, value, onChange, opts = {}) {
  const out = el('span.mono.small', null, `${Math.round(value * 100)}%`);
  const input = el('input', {
    type: 'range',
    min: String(Math.round((opts.min ?? 0) * 100)),
    max: String(Math.round((opts.max ?? 1) * 100)),
    step: String(opts.step ?? 5),
    value: String(Math.round(value * 100)),
    oninput: (e) => {
      const v = Number(e.target.value) / 100;
      out.textContent = `${e.target.value}%`;
      onChange(v);
    },
  });
  return el('div.field', null, [
    el('div.spread', null, [el('label', null, label), out]),
    input,
    opts.hint ? el('div.hint', null, opts.hint) : null,
  ]);
}

// --- Tooltip ---------------------------------------------------------------

let tip = null;

function tipNode() {
  if (!tip) {
    tip = el('div#tooltip');
    document.body.appendChild(tip);
  }
  return tip;
}

/** Attach a hover tooltip. `build` returns nodes, and is called on each hover. */
export function tooltip(node, build) {
  node.addEventListener('mouseenter', () => {
    const t = tipNode();
    clear(t);
    const content = build();
    if (!content) return;
    append(t, content);
    t.style.display = 'block';
  });
  node.addEventListener('mousemove', (e) => {
    const t = tipNode();
    if (t.style.display !== 'block') return;
    const pad = 14;
    const rect = t.getBoundingClientRect();
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;
    t.style.left = `${Math.max(4, x)}px`;
    t.style.top = `${Math.max(4, y)}px`;
  });
  node.addEventListener('mouseleave', () => { tipNode().style.display = 'none'; });
  return node;
}

export function hideTooltip() {
  if (tip) tip.style.display = 'none';
}

export function fmtTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function titleCase(s) {
  return String(s).replace(/(^|[\s_-])(\w)/g, (_, a, b) => (a === '_' || a === '-' ? ' ' : a) + b.toUpperCase());
}
