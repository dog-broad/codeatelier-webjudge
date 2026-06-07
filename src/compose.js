// Composes a student file set into one self-contained HTML document.
//
// This MUST stay identical in behaviour to the in-browser composer the practice
// tier uses, so a given answer renders the same way whether it is previewed in
// the browser or graded here. Every .css is inlined into a <style>, every .js
// into a <script>, and local <link>/<script src> references to those files are
// stripped (a document set via setContent has no server to resolve them).

/**
 * The HTML file that is the page root: index.html if present, else the first
 * .html/.htm file.
 *
 * @param {Array<{name:string,content:string}>} files
 * @returns {{name:string,content:string}|null}
 */
function rootHtml(files) {
  const index = files.find((f) => f.name.toLowerCase() === 'index.html');
  if (index) {
    return index;
  }
  return files.find((f) => /\.html?$/i.test(f.name)) || null;
}

/**
 * Insert markup before a closing tag, or fall back to a position if absent.
 */
function injectBefore(doc, closing, markup, fallback) {
  if (!markup) {
    return doc;
  }
  const re = new RegExp(closing, 'i');
  if (re.test(doc)) {
    return doc.replace(re, markup + closing);
  }
  return fallback === 'prepend' ? markup + doc : doc + markup;
}

/**
 * Compose the file set into one document for headless rendering.
 *
 * @param {Array<{name:string,content:string}>} files
 * @returns {string}
 */
export function compose(files) {
  const list = Array.isArray(files) ? files : [];
  const root = rootHtml(list);
  let doc = root ? root.content : '<!doctype html><html><head></head><body></body></html>';

  const css = list.filter((f) => /\.css$/i.test(f.name)).map((f) => f.content).join('\n');
  const js = list.filter((f) => /\.m?js$/i.test(f.name)).map((f) => f.content).join('\n');

  doc = doc.replace(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi, '');
  doc = doc.replace(/<script\b[^>]*\bsrc=["'][^"']*\.m?js["'][^>]*>\s*<\/script>/gi, '');

  const styleTag = css ? '<style>' + css.replace(/<\/style>/gi, '<\\/style>') + '</style>' : '';
  doc = injectBefore(doc, '</head>', styleTag, 'prepend');

  const scriptTag = js ? '<script>' + js.replace(/<\/script>/gi, '<\\/script>') + '</script>' : '';
  doc = injectBefore(doc, '</body>', scriptTag, 'append');

  return doc;
}

/**
 * Parse the actions DSL (one per line): `click <selector>` or
 * `type <selector> <value>`. Lines may also be separated by ';'.
 *
 * @param {string} text
 * @returns {Array<{type:string,selector:string,value?:string}>}
 */
export function parseActions(text) {
  if (!text) {
    return [];
  }
  return String(text).split(/[\n;]+/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const space = line.indexOf(' ');
    const verb = (space === -1 ? line : line.slice(0, space)).toLowerCase();
    const rest = space === -1 ? '' : line.slice(space + 1).trim();
    if (verb === 'click') {
      return { type: 'click', selector: rest };
    }
    if (verb === 'type') {
      const sp2 = rest.indexOf(' ');
      return (sp2 === -1)
        ? { type: 'type', selector: rest, value: '' }
        : { type: 'type', selector: rest.slice(0, sp2), value: rest.slice(sp2 + 1) };
    }
    return null;
  }).filter(Boolean);
}
