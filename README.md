# Claude Provider Kit

A local Anthropic-compatible proxy and profile manager for Claude Code. CPK is provider-agnostic: it lets Claude Code talk to custom upstream models through local, reversible, observable profiles.

## Status

MVP. The current transport targets providers that expose an OpenAI-compatible `/v1/chat/completions` API. Other custom-provider transports can be added behind the same profile/proxy shape.

## Prerequisites

- Node.js 20+
- npm
- Claude Code CLI available as `claude`
- A provider endpoint and API key, usually OpenAI-compatible Chat Completions

## Quick start with any OpenAI-compatible provider

```bash
git clone https://github.com/seilk/claude-provider-kit.git
cd claude-provider-kit
npm install -g .

cpk init
# Put CUSTOM_PROVIDER_API_KEY=*** in ~/.config/claude-provider-kit/secrets.env
cpk profile create my-provider-gpt-4.1 \
  --base-url https://api.example.com/v1 \
  --model gpt-4.1 \
  --key-env CUSTOM_PROVIDER_API_KEY \
  --format yaml \
  --visible-model claude-opus-4-7

cpk doctor my-provider-gpt-4.1
cpk route-test my-provider-gpt-4.1 --prompt 'Reply exactly CPK_ROUTE_OK'
cpk my-provider-gpt-4.1
```

`my-provider-gpt-4.1` is only an example profile name. Prefer profile names in the form `<provider>-<upstream-model>`, preserving provider-recognized model names when valid, for example `openrouter-gpt-4.1`, `gateway-gemini-3-flash-preview`, or `local-qwen3-coder`.

For multiple models on the same provider, create one profile per upstream model:

```bash
cpk profile create gateway-gpt-4.1 --base-url https://api.example.com/v1 --model gpt-4.1 --key-env CUSTOM_PROVIDER_API_KEY --format yaml
cpk profile create gateway-gemini-3-flash-preview --base-url https://api.example.com/v1 --model gemini-3-flash-preview --key-env CUSTOM_PROVIDER_API_KEY --format yaml

cpk gateway-gpt-4.1
cpk gateway-gemini-3-flash-preview
```

The direct `cpk <profile>` form is native CPK behavior, not a shell alias. Claude Code flags are forwarded as-is, so this works without a `--` separator:

```bash
cpk gateway-gpt-4.1 -p "hi" --max-turns 1
```

## Built-in provider presets

`cpk providers` lists optional presets that fill in known base URLs, key env names, and capability defaults. Presets are convenience only; CPK does not require a preset.

```bash
cpk providers
cpk profile create some-preset-model --provider <preset-id> --model <upstream-model> --format yaml
```

The generic path is always available:

```bash
cpk profile create <profile> --base-url <provider-v1-url> --model <upstream-model> --key-env <ENV_NAME>
```

## What this changes on your machine

Creates local user files only:

```text
~/.config/claude-provider-kit/secrets.env
~/.config/claude-provider-kit/profiles/*.json
~/.local/state/claude-provider-kit/state.json
~/.local/state/claude-provider-kit/events.jsonl
```

`cpk run` and `cpk <profile>` create a temporary Claude Code settings file for that process and point Claude Code at a local proxy. They do not require putting provider API keys in `~/.claude/settings.json`.

## Commands

```text
cpk init                    Create config and secrets file
cpk providers               List built-in provider presets
cpk profile create          Create a provider profile
cpk profile list            List profiles
cpk profile show            Show a profile with inline secrets redacted
cpk profile export          Export a profile as JSON or YAML
cpk profile import          Import a profile from JSON or YAML
cpk serve                   Start a local proxy for manual integration
cpk run                     Launch Claude Code through a profile
cpk <profile>               Launch a profile directly, forwarding Claude Code flags
cpk doctor                  Validate profile/config basics
cpk route-test              Send a real request through the local proxy
cpk status                  Show last observed proxy state
```

`cpk serve` hides the local bearer token by default. Use `--show-token` only for manual debugging.

## Managing profiles as JSON or YAML

Profiles are plain files under:

```text
~/.config/claude-provider-kit/profiles/
```

CPK reads either `.json`, `.yaml`, or `.yml` profiles. JSON is the default, but YAML is often nicer for hand-editing:

```bash
cpk profile create gateway-gpt-4.1 --base-url https://api.example.com/v1 --model gpt-4.1 --key-env CUSTOM_PROVIDER_API_KEY --format yaml
cpk profile show gateway-gpt-4.1 --format yaml
cpk profile export gateway-gpt-4.1 --format yaml --output gateway-gpt-4.1.yaml
cpk profile import gateway-gpt-4.1.yaml --name gateway-gpt-4.1-copy --format json
```

Example YAML profile:

```yaml
name: gateway-gpt-4.1
provider: openai-compatible
visible_model: claude-opus-4-7
client_model: opus
context_window: 200000
max_output_tokens: 8192
upstream:
  type: openai-chat-completions
  base_url: https://api.example.com/v1
  model: gpt-4.1
  api_key_env: CUSTOM_PROVIDER_API_KEY
capabilities:
  streaming: true
  tools: true
  images: false
  thinking: false
  prompt_cache: false
retry:
  max_retries: 0
  base_delay_ms: 250
```

The built-in YAML reader intentionally supports a small safe subset: nested mappings and scalar strings/numbers/booleans/null. It rejects arrays, anchors, aliases, and flow-style YAML instead of guessing. Secrets should still live in `secrets.env`; `profile show` and `profile export` redact inline `api_key` values.

`visible_model` is the model ID CPK returns in Anthropic-compatible responses. `client_model` is the Claude Code selector passed to the Claude Code CLI, normally `opus`, so Claude Code accepts the launch while CPK routes to the real upstream model.

## Claude Code display behavior

Claude Code owns the top welcome-box model/billing text. CPK does not try to rewrite that header. CPK's source of truth is the status line, which shows the real route, for example `CPK gateway-gpt-4.1 → gpt-4.1 as claude-opus-4-7`.

`cpk run` passes only `ANTHROPIC_AUTH_TOKEN` for the local proxy token, not `ANTHROPIC_API_KEY`, to avoid Claude Code's custom API-key confirmation prompt.

To verify the interactive TUI path with tmux against any configured profile:

```bash
npm run test:tui -- <profile>
```

This launches a real Claude Code TUI in a temporary tmux session, checks that the CPK route statusline appears, sends a prompt, verifies the expected reply, writes the final capture to `/tmp`, and closes the tmux session.

## Supported MVP API subset

- `POST /v1/messages`
- `GET /v1/models`
- `HEAD /v1/messages` / `OPTIONS /v1/messages` compatibility probes
- text input/output
- non-streaming text
- basic streaming text, tested only for text deltas
- URL images in `tool_result` are redacted to placeholders

Not yet stable:

- image forwarding
- prompt caching
- extended thinking
- server tools
- fallback chains
- complete streaming tool-call deltas
- web dashboard

Unsupported features should fail loudly as the project matures. Current MVP is intentionally narrow.

## Security model

- Proxy binds to `127.0.0.1` by default.
- Local proxy requests require a bearer token.
- Local token uses cryptographic randomness.
- Upstream API keys live in `secrets.env` or process env, not in repo files.
- Logs are metadata-only and redacted.
- `profile show` redacts inline API keys.

## Troubleshooting

### Claude Code still seems to use the wrong provider

Run:

```bash
cpk route-test <profile>
cpk status
```

The `upstream_model` in state/logs is the real provider model. Claude Code may still display its client compatibility model.

### API key missing

Set the env var named by `--key-env` in either your shell or:

```text
~/.config/claude-provider-kit/secrets.env
```

### Statusline is blank or stale

If you wrap an existing statusline, set:

```bash
CPK_BASE_STATUSLINE_COMMAND='<your original statusline command>'
```

`cpk run` passes this through to its generated settings.

## Development

```bash
npm test
npm run lint
npm run test:tui -- <profile>   # optional live TUI test, requires tmux/claude/provider credentials
```
