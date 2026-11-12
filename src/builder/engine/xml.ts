/**
 * A small ordered XML reader for the parts of a .docx the builder reads.
 *
 * It keeps what Python's ElementTree keeps and the draft reader relies on:
 * children in document order, tag and attribute names with their namespace
 * resolved to "{uri}local", and the text that comes before an element's first
 * child. It is not a validating parser: DTDs, processing instructions and
 * comments are skipped, and only the five named entities plus numeric
 * character references are decoded.
 */

export interface XEl {
  /** "{namespace-uri}local", or just "local" when the element has no namespace. */
  tag: string;
  attrs: Record<string, string>;
  children: XEl[];
  /** Text before the first child element (ElementTree's .text; '' when there is none). */
  text: string;
}

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s: string): string {
  if (!s.includes('&')) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[A-Za-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body] ?? whole;
  });
}

/** Index of the '>' that closes the tag starting at `lt`, skipping quoted attribute values. */
function tagEnd(src: string, lt: number): number {
  let quote = '';
  for (let i = lt + 1; i < src.length; i++) {
    const c = src[i]!;
    if (quote) { if (c === quote) quote = ''; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i;
  }
  return src.length;
}

const ATTR = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

export function parseXml(input: string | Uint8Array): XEl {
  let src = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input);
  if (src.charCodeAt(0) === 0xfeff) src = src.slice(1);
  if (src.includes('\r')) src = src.replace(/\r\n?/g, '\n');      // XML line-end normalisation

  const holder: XEl = { tag: '#document', attrs: {}, children: [], text: '' };
  const stack: XEl[] = [holder];
  const scopes: Record<string, string>[] = [{ xml: XML_NS }];
  const n = src.length;
  let i = 0;

  const addText = (t: string) => {
    const top = stack[stack.length - 1]!;
    if (top.children.length === 0) top.text += t;
  };
  const resolve = (name: string, ns: Record<string, string>, isAttr: boolean): string => {
    const c = name.indexOf(':');
    if (c < 0) {
      const d = isAttr ? undefined : ns[''];
      return d ? `{${d}}${name}` : name;
    }
    const uri = ns[name.slice(0, c)];
    if (uri === undefined) throw new Error(`XML: unbound prefix in "${name}"`);
    return `{${uri}}${name.slice(c + 1)}`;
  };

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { addText(decode(src.slice(i))); break; }
    if (lt > i) addText(decode(src.slice(i, lt)));
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', lt)) { const e = src.indexOf(']]>', lt); addText(src.slice(lt + 9, e < 0 ? n : e)); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<?', lt)) { const e = src.indexOf('?>', lt); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', lt)) { const e = src.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    const gt = tagEnd(src, lt);
    i = gt + 1;
    if (src[lt + 1] === '/') {
      if (stack.length > 1) { stack.pop(); scopes.pop(); }
      continue;
    }
    let inner = src.slice(lt + 1, gt);
    const selfClosing = inner.endsWith('/');
    if (selfClosing) inner = inner.slice(0, -1);
    const sp = inner.search(/\s/);
    const rawName = sp < 0 ? inner : inner.slice(0, sp);
    const rawAttrs: [string, string][] = [];
    let ns = scopes[scopes.length - 1]!;
    if (sp >= 0) {
      ATTR.lastIndex = 0;
      const rest = inner.slice(sp);
      let m: RegExpExecArray | null;
      let own: Record<string, string> | null = null;
      while ((m = ATTR.exec(rest))) {
        // Attribute-value normalisation: a literal tab or newline is a space.
        const value = decode((m[2] ?? m[3] ?? '').replace(/[\t\n]/g, ' '));
        const name = m[1]!;
        if (name === 'xmlns') { own ??= { ...ns }; own[''] = value; }
        else if (name.startsWith('xmlns:')) { own ??= { ...ns }; own[name.slice(6)] = value; }
        else rawAttrs.push([name, value]);
      }
      if (own) ns = own;
    }
    const el: XEl = { tag: resolve(rawName, ns, false), attrs: {}, children: [], text: '' };
    for (const [k, v] of rawAttrs) el.attrs[resolve(k, ns, true)] = v;
    stack[stack.length - 1]!.children.push(el);
    if (!selfClosing) { stack.push(el); scopes.push(ns); }
  }
  const root = holder.children[0];
  if (!root) throw new Error('XML: no root element');
  return root;
}

/** First direct child with this tag (ElementTree's find). */
export function child(el: XEl, tag: string): XEl | undefined {
  for (const c of el.children) if (c.tag === tag) return c;
  return undefined;
}

/** All direct children with this tag (findall). */
export function childrenOf(el: XEl, tag: string): XEl[] {
  return el.children.filter((c) => c.tag === tag);
}

/** The element and everything under it with this tag, in document order (iter). */
export function iter(el: XEl, tag: string, out: XEl[] = []): XEl[] {
  if (el.tag === tag) out.push(el);
  for (const c of el.children) iter(c, tag, out);
  return out;
}

/** First element under `el` (not `el` itself) with this tag (find('.//tag')). */
export function descendant(el: XEl, tag: string): XEl | undefined {
  for (const c of el.children) {
    if (c.tag === tag) return c;
    const d = descendant(c, tag);
    if (d) return d;
  }
  return undefined;
}
