import type { ReactNode } from "react";

/**
 * Renders AI-written plain text beautifully:
 * - **bold** → real bold, *italic* → italics, `code` → inline code
 * - LaTeX like $\text{NADP}^+$, CO$_2$, \times → readable text with real
 *   superscripts/subscripts (NADP⁺, CO₂, ×)
 * - Headings (#) and stray markdown are stripped
 */

const GREEK: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ",
  chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ",
  Lambda: "Λ", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
};

const SYMBOLS: Array<[RegExp, string]> = [
  [/\\times\b/g, "×"], [/\\div\b/g, "÷"], [/\\pm\b/g, "±"], [/\\mp\b/g, "∓"],
  [/\\cdot\b/g, "·"], [/\\to\b|\\rightarrow\b/g, "→"], [/\\leftarrow\b/g, "←"],
  [/\\Rightarrow\b/g, "⇒"], [/\\leq\b|\\le\b/g, "≤"], [/\\geq\b|\\ge\b/g, "≥"],
  [/\\neq\b|\\ne\b/g, "≠"], [/\\approx\b/g, "≈"], [/\\infty\b/g, "∞"],
  [/\\degree\b|\\circ\b/g, "°"], [/\\sum\b/g, "Σ"], [/\\prod\b/g, "Π"],
  [/\\partial\b/g, "∂"], [/\\hbar\b/g, "ℏ"], [/\\ell\b/g, "ℓ"],
];

function decodeLatex(src: string): string {
  let s = src;
  for (let i = 0; i < 3; i++) {
    s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  }
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  s = s.replace(
    /\\(?:text|mathrm|mathit|mathbf|textbf|mathbb|texttt|operatorname|textit)\s*\{([^{}]*)\}/g,
    "$1",
  );
  s = s.replace(/\\left|\\right/g, "");
  for (const [re, rep] of SYMBOLS) s = s.replace(re, rep);
  s = s.replace(/\\([A-Za-z]+)/g, (_, name: string) => GREEK[name] ?? name);
  s = s.replace(/[{}]/g, "");
  return s.trim();
}

/** Turn every LaTeX chunk into readable plain text, keeping ^ / _ for super/sub. */
function normalizeMath(input: string): string {
  return input
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m: string) => decodeLatex(m))
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, m: string) => decodeLatex(m))
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, m: string) => decodeLatex(m))
    .replace(/\$([^$\n]*?)\$/g, (_, m: string) => decodeLatex(m))
    .replace(/\\text\s*\{([^{}]*)\}/g, "$1");
}

/** Render ^{x}/^x as <sup> and _{x}/_x as <sub>. */
function renderSuperSub(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\^|_)(?:\{([^{}]+)\}|([0-9A-Za-z±−+\-]+?))(?![0-9A-Za-z])/g;
  let last = 0;
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const content = m[2] ?? m[3];
    if (m[1] === "^") {
      out.push(<sup key={`${keyBase}-s${i++}`}>{content}</sup>);
    } else {
      out.push(<sub key={`${keyBase}-b${i++}`}>{content}</sub>);
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function inline(text: string, keyBase: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|`[^`\n]+`)/g);
  return parts.flatMap<ReactNode>((part, i) => {
    const key = `${keyBase}-${i}`;
    if (/^\*\*[\s\S]+\*\*$/.test(part) || /^__[\s\S]+__$/.test(part)) {
      return [
        <strong key={key} className="font-semibold text-foreground">
          {inline(part.slice(2, -2), `${key}b`)}
        </strong>,
      ];
    }
    if (/^\*[^*\n]+\*$/.test(part)) {
      return [<em key={key}>{inline(part.slice(1, -1), `${key}i`)}</em>];
    }
    if (/^`[^`\n]+`$/.test(part)) {
      return [
        <code key={key} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>,
      ];
    }
    return renderSuperSub(part, key);
  });
}

export function RichText({ text, className }: { text: string; className?: string }) {
  const cleaned = normalizeMath(text).replace(/^#{1,6}\s+/gm, "");
  const lines = cleaned.split("\n");
  return (
    <span className={className}>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {line ? inline(line, `l${i}`) : null}
        </span>
      ))}
    </span>
  );
}
