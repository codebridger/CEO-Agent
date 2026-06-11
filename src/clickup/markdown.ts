/**
 * Markdown → ClickUp comment segments. ClickUp task comments do NOT render
 * markdown from `comment_text` (verified: `## H`, `**bold**`, `- item` all show
 * literally). The only way to get formatting is the rich `comment` segment array,
 * which is a Quill/delta shape:
 *   - inline marks ride on the text span:  {text:"x", attributes:{bold|italic|code:true}} / {link:url}
 *   - block formats ride on the line's terminating "\n":  {text:"\n", attributes:{header:1-3 | list:"bullet"|"ordered"}}
 *
 * This is a focused converter for the markdown the agent actually writes (headings,
 * bold/italic/code/strike, links, bullet/numbered lists, paragraphs). Anything it
 * doesn't recognize is left as plain text — it degrades, it never throws.
 */

export interface Segment {
  text: string;
  attributes?: Record<string, unknown>;
}

// One inline token, in precedence order: code first (so marks inside code are inert),
// then links, then ***bold-italic***, **bold**/__bold__, ~~strike~~, *italic*/_italic_.
const INLINE =
  /(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\s]+\))|(\*\*\*[^*\n]+\*\*\*)|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(~~[^~\n]+~~)|(\*[^*\n]+\*)|(_[^_\n]+_)/;

function inlineToken(tok: string): Segment {
  if (tok.startsWith("`")) return { text: tok.slice(1, -1), attributes: { code: true } };
  if (tok.startsWith("[")) {
    const m = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(tok);
    if (m) return { text: m[1] ?? "", attributes: { link: m[2] ?? "" } };
  }
  if (tok.startsWith("***")) return { text: tok.slice(3, -3), attributes: { bold: true, italic: true } };
  if (tok.startsWith("**")) return { text: tok.slice(2, -2), attributes: { bold: true } };
  if (tok.startsWith("__")) return { text: tok.slice(2, -2), attributes: { bold: true } };
  if (tok.startsWith("~~")) return { text: tok.slice(2, -2), attributes: { strike: true } };
  return { text: tok.slice(1, -1), attributes: { italic: true } }; // *x* or _x_
}

/** Split one line's text into inline-formatted segments. */
function parseInline(s: string): Segment[] {
  const out: Segment[] = [];
  let rest = s;
  for (;;) {
    const m = INLINE.exec(rest);
    if (!m) {
      if (rest) out.push({ text: rest });
      return out;
    }
    if (m.index > 0) out.push({ text: rest.slice(0, m.index) });
    out.push(inlineToken(m[0]));
    rest = rest.slice(m.index + m[0].length);
  }
}

/** Strip a line's block marker, returning the inner text plus the newline attributes it implies. */
function blockOf(line: string): { content: string; attrs?: Record<string, unknown> } {
  let m: RegExpExecArray | null;
  if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) return { content: m[2] ?? "", attrs: { header: (m[1] ?? "").length } };
  if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) return { content: m[1] ?? "", attrs: { list: "bullet" } };
  if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) return { content: m[1] ?? "", attrs: { list: "ordered" } };
  return { content: line };
}

/** Convert markdown to ClickUp comment segments. Always returns at least one segment. */
export function markdownToSegments(md: string): Segment[] {
  const segs: Segment[] = [];
  for (const line of md.replace(/\r\n/g, "\n").split("\n")) {
    const { content, attrs } = blockOf(line);
    if (content) for (const s of parseInline(content)) segs.push(s);
    segs.push(attrs ? { text: "\n", attributes: attrs } : { text: "\n" });
  }
  // Drop one trailing plain newline (cosmetic); keep block-formatted trailing newlines
  // (a heading/list needs its "\n" to carry the block format).
  const last = segs[segs.length - 1];
  if (last && last.text === "\n" && !last.attributes) segs.pop();
  if (segs.length === 0) segs.push({ text: md });
  return segs;
}
