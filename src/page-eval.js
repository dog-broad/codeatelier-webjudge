// Functions evaluated IN the rendered page (serialized to page context by
// Playwright). They mirror the practice tier's in-frame evaluator exactly
// (qtype_codeatelier/webruntime.js WEB_EVAL_SOURCE), so a given assertion produces
// the same verdict on both tiers — kept in lockstep by hand and guarded by the
// conformance corpus in test/. Each function is fully self-contained (no closures
// over the Node scope) because it runs in the browser.

/**
 * Evaluate one declarative DOM assertion node against the current document.
 * A node is a leaf {selector, property, matcher, expected} or a compound
 * {all:[…]} / {any:[…]} / {not: node}. Returns {pass, actual?, op?, children?}.
 */
export const evalAssertion = (node) => {
  function caQ(s) { try { return document.querySelector(s); } catch (e) { return null; } }
  function caQa(s) { try { return Array.prototype.slice.call(document.querySelectorAll(s)); } catch (e) { return []; } }
  function caVisible(el) {
    if (!el || el.hidden) { return false; }
    var st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) { return false; }
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
  function caGetProp(el, prop) {
    if (prop === 'text') { return (el.textContent || '').trim(); }
    if (prop === 'html') { return el.innerHTML; }
    if (prop === 'value') { return ('value' in el) ? el.value : ''; }
    if (prop === 'checked') { return !!el.checked; }
    if (prop === 'disabled') { return !!el.disabled; }
    if (prop === 'visible') { return caVisible(el); }
    if (prop === 'classlist') { return Array.prototype.slice.call(el.classList || []).join(' '); }
    if (prop.indexOf('attr:') === 0) { return el.getAttribute(prop.slice(5)); }
    if (prop.indexOf('style:') === 0) { return getComputedStyle(el)[prop.slice(6)]; }
    return null;
  }
  function caCmp(actual, matcher, expected) {
    if (matcher === 'gt' || matcher === 'lt' || matcher === 'gte' || matcher === 'lte') {
      var na = parseFloat(actual), ne = parseFloat(expected);
      if (isNaN(na) || isNaN(ne)) { return false; }
      if (matcher === 'gt') { return na > ne; }
      if (matcher === 'lt') { return na < ne; }
      if (matcher === 'gte') { return na >= ne; }
      return na <= ne;
    }
    var a = String(actual === null || actual === undefined ? '' : actual);
    var e = String(expected === null || expected === undefined ? '' : expected);
    if (matcher === 'contains') { return a.indexOf(e) !== -1; }
    if (matcher === 'not-contains') { return a.indexOf(e) === -1; }
    if (matcher === 'not-equals') { return a !== e; }
    if (matcher === 'has-class') { return (' ' + a + ' ').indexOf(' ' + e + ' ') !== -1; }
    if (matcher === 'regex') { try { return new RegExp(e).test(a); } catch (x) { return false; } }
    return a === e;
  }
  function caEvalLeaf(t) {
    var prop = (t.property || 'text');
    var matcher = (t.matcher || 'equals');
    try {
      if (prop === 'exists') {
        var present = !!caQ(t.selector);
        var expectPresent = !/^(false|0|no)$/i.test(String(t.expected == null ? '' : t.expected).trim());
        return { actual: present ? 'present' : 'absent', pass: present === expectPresent };
      }
      if (prop === 'count') {
        var n = caQa(t.selector).length;
        return { actual: n, pass: caCmp(n, matcher, t.expected) };
      }
      var el = caQ(t.selector);
      if (!el) { return { actual: null, pass: false, missing: true }; }
      var actual = caGetProp(el, prop);
      return { actual: actual, pass: caCmp(actual, matcher, t.expected) };
    } catch (err) {
      return { actual: null, pass: false, error: String((err && err.message) || err) };
    }
  }
  function caEvalNode(n) {
    if (n && Array.isArray(n.all)) {
      var rall = n.all.map(caEvalNode);
      return { op: 'all', pass: rall.every(function (r) { return r.pass; }), children: rall };
    }
    if (n && Array.isArray(n.any)) {
      var rany = n.any.map(caEvalNode);
      return { op: 'any', pass: rany.some(function (r) { return r.pass; }), children: rany };
    }
    if (n && n.not) {
      var rnot = caEvalNode(n.not);
      return { op: 'not', pass: !rnot.pass, children: [rnot] };
    }
    return caEvalLeaf(n || {});
  }
  return caEvalNode(node);
};

/**
 * Run one interaction action in the page. Returns a promise for wait/wait-for so
 * the caller (page.evaluate) awaits it; resolves immediately otherwise.
 */
export const runAction = (a) => {
  function caQ(s) { try { return document.querySelector(s); } catch (e) { return null; } }
  if (a.type === 'wait') {
    return new Promise(function (res) { setTimeout(res, Math.max(0, parseInt(a.ms, 10) || 0)); });
  }
  if (a.type === 'wait-for') {
    return new Promise(function (res) {
      var t0 = Date.now();
      var timeout = Math.max(0, parseInt(a.ms, 10) || 3000);
      (function poll() {
        if (caQ(a.selector)) { return res(true); }
        if (Date.now() - t0 >= timeout) { return res(false); }
        setTimeout(poll, 50);
      })();
    });
  }
  var el = caQ(a.selector);
  if (!el) { return Promise.resolve(); }
  if (a.type === 'click') { el.click(); } else if (a.type === 'type') {
    el.value = a.value; el.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (a.type === 'select') {
    el.value = a.value; el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (a.type === 'check') {
    el.checked = (a.value !== 'false'); el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (a.type === 'submit') {
    if (el.requestSubmit) { el.requestSubmit(); } else if (el.submit) { el.submit(); }
  } else if (a.type === 'key') {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: a.value, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent('keyup', { key: a.value, bubbles: true }));
  }
  return Promise.resolve();
};
