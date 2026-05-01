import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { listenProxy, preflightUpstream } from '../src/proxy.js';

function fakeUpstream({ status = 200, body } = {}) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let bodyText = ''; req.setEncoding('utf8'); req.on('data', c => bodyText += c); req.on('end', () => {
      seen.push(JSON.parse(bodyText || '{}'));
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body || { id: 'x', choices: [{ message: { content: 'UP_OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 4 } }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })));
}

test('proxy authenticates and sends upstream model', async () => {
  const upstream = await fakeUpstream();
  const env = { TEST_KEY: 'abc', CGB_STATE_DIR: await import('node:fs/promises').then(fs => fs.mkdtemp('/tmp/cgb-state-')) };
  const profile = { name: 'test', visible_model: 'claude-opus-4-7', max_output_tokens: 64, upstream: { base_url: upstream.url, model: 'gpt-4.1', api_key_env: 'TEST_KEY' }, capabilities: {} };
  const proxy = await listenProxy(profile, { env, token: 'local' });
  try {
    const resp = await fetch(`${proxy.url}/v1/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': 'local' }, body: JSON.stringify({ model: 'claude-opus-4-7', messages: [{ role: 'user', content: 'hi' }] }) });
    const data = await resp.json();
    assert.equal(resp.status, 200);
    assert.equal(data.content[0].text, 'UP_OK');
    assert.equal(upstream.seen[0].model, 'gpt-4.1');
  } finally { proxy.server.close(); upstream.server.close(); }
});

test('preflight fails fast on invalid upstream credentials before Claude Code can retry', async () => {
  const upstream = await fakeUpstream({ status: 401, body: { type: 'invalid_credentials', title: 'Invalid Credentials', status: 401, detail: 'Invalid API key' } });
  const profile = { name: 'bad-key', visible_model: 'claude-opus-4-7', max_output_tokens: 64, upstream: { base_url: upstream.url, model: 'gpt-4.1', api_key_env: 'TEST_KEY' }, capabilities: {} };
  try {
    await assert.rejects(() => preflightUpstream(profile, { TEST_KEY: 'bad' }), /upstream credential check failed.*401.*Invalid API key/i);
    assert.equal(upstream.seen.length, 1);
    assert.equal(upstream.seen[0].model, 'gpt-4.1');
    assert.equal(upstream.seen[0].stream, false);
  } finally { upstream.server.close(); }
});
