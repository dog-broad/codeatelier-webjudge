// Functions evaluated IN the rendered page (serialized to page context by
// Playwright). They mirror the practice tier's in-frame harness exactly, so a
// given assertion produces the same verdict on both tiers. Each is fully
// self-contained (no closures over the Node scope) because it runs in the browser.

/**
 * Evaluate one declarative DOM assertion against the current document.
 * Returns {pass, actual, missing?, error?}.
 */
export const evalAssertion = (t) => {
  function q(s) { try { return document.querySelector(s); } catch (e) { return null; } }
  function qa(s) { try { return Array.prototype.slice.call(document.querySelectorAll(s)); } catch (e) { return []; } }
  function getProp(el, prop) {
    if (prop === 'text') { return (el.textContent || '').trim(); }
    if (prop.indexOf('attr:') === 0) { return el.getAttribute(prop.slice(5)); }
    if (prop.indexOf('style:') === 0) { return getComputedStyle(el)[prop.slice(6)]; }
    return null;
  }
  function cmp(actual, matcher, expected) {
    var a = String(actual === null || actual === undefined ? '' : actual);
    var e = String(expected === null || expected === undefined ? '' : expected);
    if (matcher === 'contains') { return a.indexOf(e) !== -1; }
    if (matcher === 'regex') { try { return new RegExp(e).test(a); } catch (x) { return false; } }
    return a === e;
  }
  var prop = (t.property || 'text');
  var matcher = (t.matcher || 'equals');
  try {
    if (prop === 'exists') {
      var present = !!q(t.selector);
      var expectPresent = !/^(false|0|no)$/i.test(String(t.expected || '').trim());
      return { actual: present ? 'present' : 'absent', pass: present === expectPresent };
    }
    if (prop === 'count') {
      var n = qa(t.selector).length;
      return { actual: n, pass: cmp(n, matcher, t.expected) };
    }
    var el = q(t.selector);
    if (!el) { return { actual: null, pass: false, missing: true }; }
    var actual = getProp(el, prop);
    return { actual: actual, pass: cmp(actual, matcher, t.expected) };
  } catch (err) {
    return { actual: null, pass: false, error: String((err && err.message) || err) };
  }
};

/**
 * Run one interaction action ({type:'click'|'type', selector, value?}) in the page.
 */
export const runAction = (a) => {
  function q(s) { try { return document.querySelector(s); } catch (e) { return null; } }
  var el = q(a.selector);
  if (!el) { return; }
  if (a.type === 'click') {
    el.click();
  } else if (a.type === 'type') {
    el.value = a.value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
};
