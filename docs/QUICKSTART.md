# Agent Pack Quickstart

Agent Pack creates a portable handoff bundle from an agent run. Use it when you
want the work, logs, checks, artifacts, and receipt in one inspectable archive.

## Run Without Installing

```bash
npx @builtbyecho/agent-pack . --task "agent finished the release candidate"
```

## Install Globally

```bash
npm install -g @builtbyecho/agent-pack
agent-pack . --task "agent finished the release candidate"
```

## Create a Local Bundle

```bash
agent-pack . \
  --task "agent fixed the API route" \
  --run-checks \
  --out .agent-pack
```

The output directory contains:

```text
.agent-pack/
  manifest.json
  receipt.json
  summary.md
  files.txt
  checks.txt
  files/
  artifacts/
  checks/
  bundle.tgz
```

## Add Artifacts

Attach screenshots, logs, exports, or other delivery files:

```bash
agent-pack . \
  --task "agent completed the UI pass" \
  --artifact archive/screenshots/release.png \
  --artifact output/report.json
```

## Run Checks

Agent Pack can run detected package checks and store the logs:

```bash
agent-pack . --task "agent finished the patch" --run-checks
```

Add explicit checks with repeatable `--check` flags:

```bash
agent-pack . \
  --task "agent finished the patch" \
  --check "npm test" \
  --check "npm run lint"
```

## Upload to Vaultline

```bash
agent-pack . \
  --task "agent shipped proof bundle" \
  --run-checks \
  --vaultline \
  --yes
```

Vaultline upload uses the live BuiltByEcho Bankr x402 endpoint. The first release
uses the Bankr CLI under the hood, so make sure `bankr` is installed and funded
before using `--vaultline`.

## Inspect Before Sharing

Before posting or uploading publicly, inspect:

- `manifest.json`
- `receipt.json`
- `files/`
- `artifacts/`
- `checks/`

Agent Pack skips common secret-like files by default, but public handoffs should
still be reviewed.
