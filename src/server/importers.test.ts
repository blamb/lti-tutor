import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, detectLicense, decodeEntities, assertPublicHttpUrl, ImportError } from './importers.js';

const PAGE = `<!doctype html><html><head><title>Cells &amp; Membranes | Open Bio</title>
<script>window.x = 1;</script><style>.a{}</style></head>
<body>
<nav><a href="/">Home</a><a href="/toc">Contents</a></nav>
<header><h1>Site header</h1></header>
<main>
  <h1>Chapter 3: Cell membranes</h1>
  <p>The membrane is <em>selectively</em> permeable.&nbsp;It regulates what enters.</p>
  <h2>Key terms</h2>
  <ul><li>Osmosis</li><li>Diffusion &ndash; passive</li></ul>
  <table><tr><th>Term</th><th>Meaning</th></tr><tr><td>Lipid</td><td>Fat</td></tr></table>
  <a rel="license" href="https://creativecommons.org/licenses/by-nc-sa/4.0/">CC BY-NC-SA</a>
</main>
<footer>© 2026 Someone</footer>
</body></html>`;

test('htmlToText keeps the main content, headings and lists, drops chrome', () => {
  const { title, text } = htmlToText(PAGE);
  assert.equal(title, 'Chapter 3: Cell membranes');
  assert.match(text, /^# Chapter 3: Cell membranes/);
  assert.match(text, /The membrane is selectively permeable\. It regulates what enters\./);
  assert.match(text, /## Key terms\n\n- Osmosis\n- Diffusion – passive/);
  assert.match(text, /Term\tMeaning\nLipid\tFat\n/);
  assert.doesNotMatch(text, /Home|Contents|Site header|window\.x|Someone/);
});

test('htmlToText on a fragment does not look for <main>', () => {
  const { text } = htmlToText('<p>Only <b>this</b>.</p><p>And this.</p>', { fragment: true });
  assert.equal(text, 'Only this.\n\nAnd this.');
});

test('detectLicense reads Creative Commons links', () => {
  assert.equal(detectLicense(PAGE), 'CC BY-NC-SA 4.0');
  assert.equal(detectLicense('<a href="https://creativecommons.org/licenses/by/4.0/">x</a>'), 'CC BY 4.0');
  assert.equal(detectLicense('<a href="https://creativecommons.org/publicdomain/zero/1.0/">x</a>'), 'CC0 1.0');
  assert.equal(detectLicense('<p>All rights reserved</p>'), '');
});

test('decodeEntities handles named, decimal and hex entities', () => {
  assert.equal(decodeEntities('a &amp; b &#169; &#x2014; &rsquo; &unknown;'), 'a & b © — ’ &unknown;');
});

test('assertPublicHttpUrl rejects private, local and non-http targets', () => {
  assert.equal(assertPublicHttpUrl('https://opentextbc.ca/biology/chapter/1/').hostname, 'opentextbc.ca');
  for (const bad of ['ftp://example.com/x', 'http://localhost:3000/', 'http://127.0.0.1/', 'http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.20.0.1/', 'http://169.254.169.254/latest', 'http://[::1]/', 'http://db.internal/', 'not a url']) {
    assert.throws(() => assertPublicHttpUrl(bad), ImportError, bad);
  }
});
