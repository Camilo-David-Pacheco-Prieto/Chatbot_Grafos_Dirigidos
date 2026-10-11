// Fórmulas con KaTeX. Se protegen antes de Markdown/DOMPurify y se restituyen después:
// el HTML de KaTeX lo genera la librería (trust: false), no el texto del modelo.
import katex from 'katex';
import 'katex/dist/katex.min.css';

const CODE = /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`/g;
const MATH =
  /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|(?<![\\$\w])\$(?!\s)((?:[^$\n\\]|\\.)+?)(?<!\s)\$(?![\d$])/g;

export function extractMath(text) {
  const store = [];
  const protect = (seg) =>
    seg.replace(MATH, (whole, a, b, c, d) => {
      const tex = (a ?? b ?? c ?? d).trim();
      try {
        store.push(
          katex.renderToString(tex, {
            displayMode: a != null || b != null,
            throwOnError: false,
            output: 'html',
            trust: false,
            strict: 'ignore',
          }),
        );
      } catch {
        return whole;
      }
      return `MATHPH${store.length - 1}X`;
    });

  let out = '';
  let last = 0;
  for (const m of text.matchAll(CODE)) {
    out += protect(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  out += protect(text.slice(last));

  return {
    text: out,
    restore: (html) => html.replace(/MATHPH(\d+)X/g, (whole, i) => store[Number(i)] ?? whole),
  };
}
