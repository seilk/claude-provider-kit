import test from 'node:test';
import assert from 'node:assert/strict';
import { anthropicToOpenAI, openAIToAnthropic, convertToolResultContent } from '../src/adapter.js';

const profile = { visible_model: 'claude-opus-4-7', max_output_tokens: 64, upstream: { model: 'gpt-5.5' } };

test('rewrites visible Claude model to upstream model', () => {
  const out = anthropicToOpenAI({ model: 'claude-opus-4-7', messages: [{ role: 'user', content: 'hi' }] }, profile);
  assert.equal(out.model, 'gpt-5.5');
  assert.deepEqual(out.messages, [{ role: 'user', content: 'hi' }]);
});

test('redacts tool_result image URLs', () => {
  const text = convertToolResultContent([{ type: 'text', text: 'saw' }, { type: 'image', source: { type: 'url', url: 'https://secret.example/signed?token=abc' } }]);
  assert.equal(text, 'saw\n[tool_result image omitted: url image payload]');
  assert(!text.includes('secret.example'));
  assert(!text.includes('token'));
});

test('maps OpenAI response to visible Claude model', () => {
  const out = openAIToAnthropic({ choices: [{ message: { content: 'OK' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 2 } }, profile);
  assert.equal(out.model, 'claude-opus-4-7');
  assert.equal(out.content[0].text, 'OK');
});
