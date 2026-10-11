// Detecta un dígrafo en la respuesta del tutor (matriz de adyacencia, conjunto de pares
// o flechas a → b) y lo dibuja como SVG. Si no hay nada reconocible devuelve null y la
// interfaz no muestra la opción «Ver grafo».
const MAX_NODES = 24;
const NAME = String.raw`[A-Za-z]\d{0,2}'?|\d{1,2}`;

const clean = (s) =>
  s
    .replace(/[\\$]/g, '')
    .replace(/_\{?([^}\s]*)\}?/g, '$1')
    .replace(/[{}]/g, '')
    .trim();

// Matriz cuadrada de enteros con las mismas etiquetas en filas y columnas: fila → columna.
function fromTables(root) {
  for (const t of root.querySelectorAll('table')) {
    const rows = [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((c) => c.textContent.trim()));
    const head = rows[0];
    const body = rows.slice(1);
    const n = body.length;
    if (!head || n < 2 || n > MAX_NODES || head.length !== n + 1) continue;
    if (!body.every((r) => r.length === n + 1 && r.slice(1).every((v) => /^\d+$/.test(v)))) continue;
    const cols = head.slice(1).map(clean);
    const names = body.map((r) => clean(r[0]));
    if (cols.join('|') !== names.join('|') || new Set(names).size !== n || names.some((x) => !x)) continue;
    const edges = [];
    body.forEach((r, i) => r.slice(1).forEach((v, j) => Number(v) > 0 && edges.push([i, j])));
    if (edges.length) return { nodes: names, edges };
  }
  return null;
}

function build(pairs, vertices = []) {
  const nodes = [...vertices];
  const idx = (x) => {
    let i = nodes.indexOf(x);
    if (i < 0) i = nodes.push(x) - 1;
    return i;
  };
  const seen = new Set();
  const edges = [];
  for (const [a, b] of pairs) {
    const e = [idx(a), idx(b)];
    const k = e.join('>');
    if (!seen.has(k)) {
      seen.add(k);
      edges.push(e);
    }
  }
  if (nodes.length < 2 || nodes.length > MAX_NODES || edges.length < 2) return null;
  return { nodes, edges };
}

// Conjuntos de pares «A = {(a,b), (b,c)}» o flechas «a → b». Con V = {…} se respeta el orden de vértices.
function fromText(raw) {
  const text = raw
    .replace(/\\[{}]/g, (m) => m[1])
    .replace(/\\(?:longrightarrow|rightarrow|to)\b/g, '->')
    .replace(/_\{([^}]*)\}/g, '$1')
    .replace(/_(\w)/g, '$1')
    .replace(/[$\\]/g, '');

  const vm = text.match(/\bV\s*(?:\([^)]*\))?\s*=\s*\{([^{}]*)\}/);
  const isName = new RegExp(`^(?:${NAME})$`);
  const vertices = vm ? vm[1].split(/[,;]/).map((x) => x.trim()).filter((x) => isName.test(x)) : [];

  const pair = new RegExp(String.raw`\(\s*(${NAME})\s*,\s*(${NAME})\s*\)`, 'g');
  for (const blk of text.matchAll(/\{([^{}]*)\}/g)) {
    const found = [...blk[1].matchAll(pair)].map((m) => [m[1], m[2]]);
    if (found.length >= 2 && blk[1].replace(pair, '').replace(/[\s,;]/g, '') === '') {
      const g = build(found, vertices);
      if (g) return g;
    }
  }

  const arrow = new RegExp(String.raw`(${NAME})\s*(?:->|→|⟶)\s*(?=(${NAME}))`, 'g');
  return build([...text.matchAll(arrow)].map((m) => [m[1], m[2]]), vertices);
}

export function findGraph(text, root) {
  return fromTables(root) ?? fromText(text);
}

export function degrees({ nodes, edges }) {
  const out = nodes.map(() => 0);
  const inn = nodes.map(() => 0);
  for (const [a, b] of edges) {
    out[a]++;
    inn[b]++;
  }
  return nodes.map((name, i) => ({ name, out: out[i], in: inn[i] }));
}

const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const unit = (x, y) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};
const rot = ([x, y], t) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];

// Vértices en círculo; los arcos opuestos (a→b y b→a) se curvan para no solaparse.
export function drawGraph({ nodes, edges }) {
  const W = 560;
  const H = 440;
  const r = 21;
  const n = nodes.length;
  const cx = W / 2;
  const cy = H / 2;
  const ring = n === 1 ? 0 : Math.min(W, H) / 2 - 56;
  const pos = nodes.map((_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return [cx + ring * Math.cos(a), cy + ring * Math.sin(a)];
  });
  const has = new Set(edges.map((e) => e.join('>')));

  const arcs = edges
    .map(([i, j]) => {
      const [px, py] = pos[i];
      if (i === j) {
        const out = n === 1 ? [0, -1] : unit(px - cx, py - cy);
        const a = rot(out, -0.55);
        const b = rot(out, 0.55);
        return `<path d="M${px + a[0] * r} ${py + a[1] * r} C${px + a[0] * r * 3.4} ${py + a[1] * r * 3.4} ${px + b[0] * r * 3.4} ${py + b[1] * r * 3.4} ${px + b[0] * (r + 5)} ${py + b[1] * (r + 5)}" marker-end="url(#gv-arrow)"/>`;
      }
      const [qx, qy] = pos[j];
      const [ux, uy] = unit(qx - px, qy - py);
      const bow = has.has(`${j}>${i}`) ? 52 : 0;
      const c = [(px + qx) / 2 - uy * bow, (py + qy) / 2 + ux * bow];
      const [sx, sy] = unit(c[0] - px, c[1] - py);
      const [tx, ty] = unit(c[0] - qx, c[1] - qy);
      return `<path d="M${px + sx * r} ${py + sy * r} Q${c[0]} ${c[1]} ${qx + tx * (r + 5)} ${qy + ty * (r + 5)}" marker-end="url(#gv-arrow)"/>`;
    })
    .join('');

  const dots = pos.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
  const labels = nodes.map((name, i) => `<text x="${pos[i][0]}" y="${pos[i][1]}">${esc(name)}</text>`).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Dígrafo de ${n} vértices y ${edges.length} arcos" font-family="ui-sans-serif, system-ui, sans-serif">` +
    `<defs><marker id="gv-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="var(--text)"/></marker></defs>` +
    `<g fill="none" stroke="var(--text)" stroke-width="1.8" stroke-linecap="round">${arcs}</g>` +
    `<g fill="var(--surface)" stroke="var(--accent)" stroke-width="2.2">${dots}</g>` +
    `<g fill="var(--text)" font-size="14" font-weight="600" text-anchor="middle" dominant-baseline="central">${labels}</g>` +
    `</svg>`
  );
}
