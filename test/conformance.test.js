// Conformance corpus for the judge evaluator.
//
// Each case renders a file set and grades a list of assertions, asserting the
// verdict each must produce. This is the contract the judge MUST match the
// practice tier on (qtype_codeatelier/webruntime.js WEB_EVAL_SOURCE). The two
// evaluators are hand-kept mirrors; this corpus is the guard against drift —
// if the judge diverges from the documented contract, a case here fails.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { grade, closeBrowser } from '../src/grade.js';

// grade() reuses a single headless browser; close it so the test process exits.
after(async () => { await closeBrowser(); });

const html = (body) => [{ name: 'index.html', content: '<!doctype html><html><body>' + body + '</body></html>' }];

// A flat leaf assertion in the service wire shape.
const leaf = (selector, property, matcher, expected, actions) =>
  ({ selector, property, matcher, expected, actions: actions || '' });
// A compound assertion (tree on `assertion`).
const tree = (node, actions) => ({ actions: actions || '', assertion: node });

const CASES = [
  {
    name: 'leaf properties and matchers',
    files: html('<h1 id="t">Welcome</h1><button id="b" disabled>Go</button>'
      + '<input id="i" value="hi"><div class="alert error">x</div><span>a</span><span>b</span>'),
    checks: [
      [leaf('#t', 'text', 'equals', 'Welcome'), true],
      [leaf('#t', 'text', 'contains', 'elc'), true],
      [leaf('#t', 'text', 'not-equals', 'Bye'), true],
      [leaf('#b', 'disabled', 'equals', 'true'), true],
      [leaf('#i', 'value', 'equals', 'hi'), true],
      [leaf('.alert', 'classlist', 'has-class', 'error'), true],
      [leaf('span', 'count', 'gt', '1'), true],
      [leaf('span', 'count', 'lt', '1'), false],
      [leaf('#missing', 'exists', 'equals', 'true'), false],
      [leaf('#i', 'visible', 'equals', 'true'), true],
    ],
  },
  {
    name: 'compound all / any / not',
    files: html('<h1 id="t">Welcome</h1><button id="b" disabled>Go</button>'),
    checks: [
      [tree({ all: [
        { selector: '#t', property: 'text', matcher: 'contains', expected: 'Wel' },
        { selector: '#b', property: 'disabled', matcher: 'equals', expected: 'true' },
        { not: { selector: '#x', property: 'exists', matcher: 'equals', expected: 'true' } },
      ] }), true],
      [tree({ any: [
        { selector: '#t', property: 'text', matcher: 'equals', expected: 'NOPE' },
        { selector: '#b', property: 'exists', matcher: 'equals', expected: 'true' },
      ] }), true],
      [tree({ all: [
        { selector: '#t', property: 'text', matcher: 'equals', expected: 'Welcome' },
        { selector: '#t', property: 'text', matcher: 'equals', expected: 'NOPE' },
      ] }), false],
    ],
  },
  {
    name: 'actions: type, click and wait-for an async update',
    files: html('<input id="a"><button id="go">go</button><div id="out"></div>'
      + '<script>document.getElementById("go").onclick=function(){'
      + 'var v=document.getElementById("a").value;'
      + 'setTimeout(function(){var p=document.createElement("p");p.id="res";p.textContent="="+v;'
      + 'document.getElementById("out").appendChild(p);},120);};</script>'),
    checks: [
      [leaf('#res', 'text', 'equals', '=42', 'type #a 42\nclick #go\nwait-for #res 2000'), true],
    ],
  },
];

for (const c of CASES) {
  test(c.name, { timeout: 30000 }, async () => {
    const assertions = c.checks.map(([a]) => a);
    const out = await grade({ files: c.files, assertions });
    c.checks.forEach(([a, expected], i) => {
      assert.equal(!!out.results[i].pass, expected,
        c.name + ' #' + i + ' → ' + JSON.stringify(a.assertion || a));
    });
  });
}
