import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import { parsePlatformHttpHosts, rewriteRequestArgs, installPlatformHttpRouting } from './outbound.js';

test('parsePlatformHttpHosts accepts hosts with optional ports and ignores junk', () => {
  const m = parsePlatformHttpHosts(' Moodle.example.ca, lms.local:8080 ,, https://bad/x ');
  assert.deepEqual([...m.entries()], [['moodle.example.ca', { port: 80 }], ['lms.local', { port: 8080 }]]);
  assert.equal(parsePlatformHttpHosts('').size, 0);
});

test('rewriteRequestArgs rewrites only listed hosts, keeping path, headers and the hostname', () => {
  const hosts = parsePlatformHttpHosts('moodle.example.ca');
  const cb = () => {};
  const r1 = rewriteRequestArgs([new URL('https://moodle.example.ca/mod/lti/certs.php?x=1'), { method: 'GET', headers: { accept: 'application/json' }, agent: {} as never }, cb], hosts);
  assert.ok(r1);
  assert.equal(r1![0].protocol, 'http:');
  assert.equal(r1![0].hostname, 'moodle.example.ca');
  assert.equal(r1![0].port, 80);
  assert.equal(r1![0].path, '/mod/lti/certs.php?x=1');
  assert.deepEqual(r1![0].headers, { accept: 'application/json' });
  assert.equal(r1![0].agent, undefined);
  assert.equal(r1![1], cb);

  const r2 = rewriteRequestArgs([{ hostname: 'moodle.example.ca', path: '/mod/lti/token.php', method: 'POST' }, cb], hosts);
  assert.ok(r2);
  assert.equal(r2![0].path, '/mod/lti/token.php');
  assert.equal(r2![0].method, 'POST');

  assert.equal(rewriteRequestArgs([new URL('https://api.anthropic.com/v1/messages')], hosts), null);
  assert.equal(rewriteRequestArgs(['https://github.com/', cb], hosts), null);
});

test('installed routing sends an https.request for a listed host over plain HTTP to the mapped port', async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ host: req.headers.host, url: req.url, method: req.method }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const origRequest = https.request;
  const origGet = https.get;
  try {
    installPlatformHttpRouting(parsePlatformHttpHosts(`localhost:${port}`));
    const body = await new Promise<string>((resolve, reject) => {
      const req = https.request(new URL('https://localhost/mod/lti/openid-configuration.php?a=b'), { method: 'GET' }, (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.end();
    });
    const parsed = JSON.parse(body) as { host: string; url: string; method: string };
    assert.equal(parsed.url, '/mod/lti/openid-configuration.php?a=b');
    assert.equal(parsed.method, 'GET');
    assert.match(parsed.host, /^localhost(:\d+)?$/);
    const viaGet = await new Promise<string>((resolve, reject) => {
      https.get('https://localhost/keys', (res) => { let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => resolve(d)); }).on('error', reject);
    });
    assert.equal((JSON.parse(viaGet) as { url: string }).url, '/keys');
  } finally {
    (https as unknown as { request: unknown }).request = origRequest;
    (https as unknown as { get: unknown }).get = origGet;
    server.close();
  }
});
