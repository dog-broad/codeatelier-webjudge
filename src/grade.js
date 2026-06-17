// The grading core: render a file set and evaluate each assertion in a fresh
// page. Kept separate from the HTTP layer so it can be tested directly.

import { chromium } from 'playwright';
import { compose, parseActions } from './compose.js';
import { evalAssertion, runAction } from './page-eval.js';

const DEFAULT_NAV_TIMEOUT = 5000;
const MAX_NAV_TIMEOUT = 15000;
const MAX_ASSERTIONS = 200;

let browser = null;
let launching = null;

/** Launch (once) and reuse a single headless Chromium. */
export async function getBrowser() {
  if (browser && browser.isConnected()) {
    return browser;
  }
  if (!launching) {
    launching = chromium.launch({
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    }).then((b) => { browser = b; launching = null; return b; });
  }
  return launching;
}

/** Close the shared browser (used on shutdown and by tests). */
export async function closeBrowser() {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}

/**
 * Grade one submission: per-assertion fresh render → actions → evaluate.
 *
 * @param {{files:Array, assertions:Array, timeoutMs?:number}} payload
 * @returns {Promise<{results:Array<{pass:boolean, actual:*, error:?string}>}>}
 */
export async function grade(payload) {
  const files = Array.isArray(payload.files) ? payload.files : [];
  const assertions = (Array.isArray(payload.assertions) ? payload.assertions : []).slice(0, MAX_ASSERTIONS);
  const navTimeout = Math.min(Number(payload.timeoutMs) || DEFAULT_NAV_TIMEOUT, MAX_NAV_TIMEOUT);
  const doc = compose(files);

  const b = await getBrowser();
  // offline:true kills all network — the composed document is self-contained, so
  // student code cannot fetch or phone home from the grading sandbox.
  const context = await b.newContext({ offline: true });
  const results = [];
  try {
    for (const a of assertions) {
      const page = await context.newPage();
      let r;
      try {
        await page.setContent(doc, { waitUntil: 'load', timeout: navTimeout });
        for (const act of parseActions(a.actions)) {
          // runAction returns a promise for wait/wait-for; page.evaluate awaits it.
          await page.evaluate(runAction, act);
        }
        // A compound check carries its tree on `assertion`; else the flat leaf is
        // the single node. evalAssertion handles either.
        r = await page.evaluate(evalAssertion, a.assertion || a);
      } catch (e) {
        r = { pass: false, actual: null, error: String((e && e.message) || e) };
      } finally {
        await page.close();
      }
      results.push({
        pass: !!r.pass,
        actual: r.actual === undefined ? null : r.actual,
        error: r.error || null,
      });
    }
  } finally {
    await context.close();
  }
  return { results };
}
