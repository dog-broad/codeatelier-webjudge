// Pure-logic tests for the composer and the actions parser. These run without a
// browser (`node --test test/compose.test.mjs`) and guard that the service
// composes a file set the same way the practice tier does.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, parseActions } from '../src/compose.js';

const FILES = [
  { name: 'index.html', content: '<!doctype html><html><head><link rel="stylesheet" href="style.css"></head><body><h1 id="t">Hi</h1><script src="script.js"></script></body></html>' },
  { name: 'style.css', content: '#t{color:red}' },
  { name: 'script.js', content: 'document.title="x";' },
];

test('inlines css and js, strips local refs', () => {
  const doc = compose(FILES);
  assert.match(doc, /<style>#t\{color:red\}<\/style>/);
  assert.match(doc, /<script>document\.title="x";<\/script>/);
  assert.ok(!/<link[^>]*stylesheet/i.test(doc), 'stylesheet link stripped');
  assert.ok(!/<script[^>]*src=/i.test(doc), 'local script src stripped');
  assert.match(doc, /<h1 id="t">Hi<\/h1>/);
});

test('synthesises a document when no html file is present', () => {
  const doc = compose([{ name: 'style.css', content: 'body{margin:0}' }]);
  assert.match(doc, /<style>body\{margin:0\}<\/style>/);
  assert.match(doc, /<\/head>/i);
});

test('parses the actions DSL', () => {
  assert.deepEqual(parseActions('click #go'), [{ type: 'click', selector: '#go' }]);
  assert.deepEqual(parseActions('type #name Ada Lovelace'),
    [{ type: 'type', selector: '#name', value: 'Ada Lovelace' }]);
  assert.deepEqual(parseActions('click #a\nclick #b'),
    [{ type: 'click', selector: '#a' }, { type: 'click', selector: '#b' }]);
  assert.deepEqual(parseActions(''), []);
});
