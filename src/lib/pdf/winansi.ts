// pdf-lib con fuentes estándar usa WinAnsi (CP1252). Cualquier carácter fuera de
// ese conjunto hace fallar la generación del PDF; se reemplaza por un equivalente
// ASCII o "?" para que los formatos siempre se puedan descargar.
const cp1252Extras = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d,
  0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const replacements: Record<string, string> = {
  "≥": ">=", "≤": "<=", "≠": "!=", "≈": "~", "→": "->", "←": "<-", "↑": "^", "↓": "v",
  "✓": "OK", "✔": "OK", "✗": "X", "✘": "X", "□": "", "☐": "", "■": "", "▪": "-",
  "★": "*", "☆": "*", "♦": "<>", "⋯": "...", "″": '"', "′": "'", "₀": "0", "₁": "1", "₂": "2",
};

function isWinAnsi(code: number) {
  return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || cp1252Extras.has(code);
}

export function sanitizeWinAnsi(value: string) {
  let result = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (isWinAnsi(code)) result += char;
    else if (code === 0x0a || code === 0x0d || code === 0x09) result += " ";
    else result += replacements[char] ?? "?";
  }
  return result;
}
