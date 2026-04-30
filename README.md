# Claude Provider Kit

A local Anthropic-compatible proxy and profile manager for Claude Code. It helps you use custom upstream models while keeping Claude Code configuration reversible, observable, and safe.

## Status

MVP. The first target is OpenAI-compatible `/v1/chat/completions` upstreams.

## Why

Claude Code can point at a custom Anthropic-compatible endpoint, but real custom-provider use is messy:

- existing `~/.claude/settings.json` can silently override env
- statusline can lie about the real upstream
- users need proof that traffic reached the intended model
- secrets can leak through logs or dotfiles

Claude Provider Kit focuses on safe setup, local routing, and diagnostics.

## Install from source

```bash
git clone https://github.com/seilk/claude-provider-kit.git
cd claude-provider-kit
npm install -g .
```

## Quick start

```bash
cpk init
# Put LETSUR_API_KEY=... in ~/.config/claude-provider-kit/secrets.env
cpk profile create letsur \
  --base-url https://gw.letsur.ai/v1 \
  --model gpt-5.5 \
  --key-env LETSUR_API_KEY \
  --visible-model claude-opus-4-7

cpk doctor letsur
cpk route-test letsur --prompt 'Reply exactly ROUTE_OK'
cpk run letsur -- -p 'Reply exactly OK' --max-turns 1
```

## Design principles

- Localhost only by default.
- No prompt body logging by default.
- Secrets stay outside the repo.
- Route diagnostics must prove observed traffic, not just print config.
- Unsupported features should fail loudly rather than corrupt a coding session.

## Supported MVP API subset

- `POST /v1/messages`
- text input/output
- non-streaming text
- basic streaming text
- basic client tool-call conversion
- URL images in `tool_result` are redacted to placeholders

Not yet supported as stable features:

- image forwarding
- prompt caching
- server tools
- provider fallback chains
- web dashboard

## Commands

```text
cpk init
cpk profile create <name> --base-url URL --model MODEL --key-env ENV [--visible-model MODEL]
cpk profile list
cpk profile show <name>
cpk serve <profile>
cpk run <profile> [-- ...claude args]
cpk doctor <profile>
cpk route-test <profile> [--prompt TEXT]
cpk status
```

## Security notes

`~/.config/claude-provider-kit/secrets.env` is created with mode `0600`. Do not commit it. Logs are metadata-only and redacted.

## Development

```bash
npm test
npm run lint
```
