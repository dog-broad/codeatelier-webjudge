// End-to-end grading tests against real headless Chromium. Run where a browser
// is available: `npm test` inside the Docker image, or after
// `npx playwright install chromium`. These pin the assertion semantics (text,
// style, exists, count, attr, and a click action) the same way the practice
// tier's corpus does, so both tiers agree on a given page + assertion.

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { grade, closeBrowser } from '../src/grade.js';

after(async () => { await closeBrowser(); });

const FILES = [
  { name: 'index.html', content:
    '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body>'
    + '<h1 id="title">Todo</h1>'
    + '<button id="add" data-action="add">Add</button>'
    + '<ul id="list"></ul><p id="count">0</p>'
    + '<script src="script.js"></script></body></html>' },
  { name: 'style.css', content: '#title{color:rgb(0,128,0);font-weight:bold}' },
  { name: 'script.js', content:
    "var n=0;document.getElementById('add').addEventListener('click',function(){n++;"
    + "var li=document.createElement('li');li.className='item';document.getElementById('list').appendChild(li);"
    + "document.getElementById('count').textContent=String(n);});" },
];

test('static assertions: text, style, attr, exists, count', async () => {
  const { results } = await grade({ files: FILES, assertions: [
    { selector: '#title', property: 'text', matcher: 'equals', expected: 'Todo' },
    { selector: '#title', property: 'style:fontWeight', matcher: 'equals', expected: '700' },
    { selector: '#title', property: 'style:color', matcher: 'equals', expected: 'rgb(0, 128, 0)' },
    { selector: '#add', property: 'attr:data-action', matcher: 'equals', expected: 'add' },
    { selector: '.item', property: 'count', matcher: 'equals', expected: '0' },
    { selector: '#missing', property: 'exists', expected: 'false' },
    { selector: '#title', property: 'text', matcher: 'equals', expected: 'Wrong' },
  ] });
  assert.deepEqual(results.map((r) => r.pass), [true, true, true, true, true, true, false]);
  assert.equal(results[6].actual, 'Todo');
});

test('actions run before the assertion (click twice then count)', async () => {
  const { results } = await grade({ files: FILES, assertions: [
    { selector: '.item', property: 'count', matcher: 'equals', expected: '2', actions: 'click #add\nclick #add' },
    { selector: '#count', property: 'text', matcher: 'equals', expected: '2', actions: 'click #add\nclick #add' },
  ] });
  assert.deepEqual(results.map((r) => r.pass), [true, true]);
});

test('a missing element fails rather than throwing', async () => {
  const { results } = await grade({ files: FILES, assertions: [
    { selector: '#nope', property: 'text', matcher: 'equals', expected: 'x' },
  ] });
  assert.equal(results[0].pass, false);
});
