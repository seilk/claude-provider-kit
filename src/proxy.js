import http from 'node:http';
import { anthropicToOpenAI, openAIToAnthropic, openAIStreamToAnthropic } from './adapter.js';
import { resolveApiKey } from './config.js';
import { logEvent, writeState } from './state.js';

export async function createProxy(profile, options = {}) {
  const host = options.host || '127.0.0.1';
  const port = Number(options.port || 0);
  const token = options.token || randomToken();
  const env = options.env || process.env;
  const apiKey = await resolveApiKey(profile, env);
  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, profile: profile.name });
      if (req.method !== 'POST' || req.url !== '/v1/messages') return json(res, 404, { error: { type: 'not_found', message: 'not found' } });
      if (!validAuth(req, token)) return json(res, 401, { error: { type: 'authentication_error', message: 'missing or invalid local proxy token' } });
      const raw = await readBody(req);
      const anthropic = JSON.parse(raw || '{}');
      const upstreamBody = anthropicToOpenAI(anthropic, profile);
      const requestId = `cpk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      await writeState({ last_request_id: requestId, active_profile: profile.name, visible_model: profile.visible_model, upstream_model: profile.upstream.model, upstream_base_url: profile.upstream.base_url, proxy_url: `http://${host}:${server.address().port}` }, env);
      await logEvent('request.forward', { request_id: requestId, profile: profile.name, visible_model: profile.visible_model, upstream_model: profile.upstream.model, upstream_base_url: profile.upstream.base_url }, env);
      const upstream = await fetch(`${profile.upstream.base_url}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` }, body: JSON.stringify(upstreamBody) });
      await logEvent('response.received', { request_id: requestId, status: upstream.status, upstream_model: profile.upstream.model }, env);
      if (!upstream.ok) return pipeError(res, upstream);
      if (upstreamBody.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
        for await (const event of openAIStreamToAnthropic(upstream.body, profile)) res.write(event);
        res.end();
      } else {
        json(res, 200, openAIToAnthropic(await upstream.json(), profile));
      }
    } catch (error) {
      await logEvent('request.failed', { profile: profile.name, error: error.message }, options.env || process.env).catch(() => {});
      json(res, 502, { error: { type: 'api_error', message: error.message } });
    }
  });
  return { server, token, host, port };
}

export async function listenProxy(profile, options = {}) {
  const proxy = await createProxy(profile, options);
  await new Promise((resolve) => proxy.server.listen(proxy.port, proxy.host, resolve));
  const address = proxy.server.address();
  return { ...proxy, url: `http://${proxy.host}:${address.port}` };
}

function validAuth(req, token) {
  return req.headers['x-api-key'] === token || req.headers['anthropic-api-key'] === token || req.headers.authorization === `Bearer ${token}`;
}
function randomToken() { return `cpk-local-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
function readBody(req) { return new Promise((resolve, reject) => { let body=''; req.setEncoding('utf8'); req.on('data', c => { body += c; if (body.length > 10_000_000) reject(new Error('request body too large')); }); req.on('end', () => resolve(body)); req.on('error', reject); }); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(`${JSON.stringify(data)}\n`); }
async function pipeError(res, upstream) { const text = await upstream.text(); res.writeHead(upstream.status, { 'Content-Type': 'application/json' }); res.end(text); }
