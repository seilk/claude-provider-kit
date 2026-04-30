import { spawnSync } from 'node:child_process';
import { readState } from './state.js';
import { stripControls } from './redact.js';

export async function renderStatusline(input, env = process.env) {
  const display = env.CPK_DISPLAY_MODEL || env.CCS_DISPLAY_MODEL || await observedModel(env);
  let forwarded = input;
  if (display) {
    try {
      const data = JSON.parse(input || '{}');
      data.model = { ...(data.model && typeof data.model === 'object' ? data.model : {}), display_name: stripControls(display), id: stripControls(display) };
      forwarded = JSON.stringify(data);
    } catch {}
  }
  const base = env.CPK_BASE_STATUSLINE_COMMAND || env.CCS_BASE_STATUSLINE_COMMAND;
  if (base) {
    const result = spawnSync('/bin/bash', ['-lc', base], { input: forwarded, encoding: 'utf8', env: { ...process.env, ...env }, maxBuffer: 1024 * 1024 });
    return { stdout: result.stdout || '', stderr: result.stderr || '', status: result.status || 0 };
  }
  const model = display || 'cpk: no route observed';
  return { stdout: `[${model}]\n`, stderr: '', status: 0 };
}

async function observedModel(env) {
  try {
    const state = await readState(env);
    return state.upstream_model ? `${state.active_profile || 'upstream'}/${state.upstream_model}` : '';
  } catch { return ''; }
}

export async function statuslineMain() {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', c => input += c);
  process.stdin.on('end', async () => {
    const out = await renderStatusline(input, process.env);
    if (out.stdout) process.stdout.write(out.stdout);
    if (out.stderr) process.stderr.write(out.stderr);
    process.exit(out.status);
  });
}
