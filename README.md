# Agent Pack

Agent Pack turns an agent run into a portable delivery bundle.

Agents produce useful work, but the proof usually gets scattered across chat logs,
temp folders, screenshots, diffs, and terminal output. Agent Pack creates one
handoff crate with a manifest, file inventory, git state, checks, and an archive
that can be stored on Vaultline.

```bash
npx @builtbyecho/agent-pack ./project --task "ship the feature"
```

Output:

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

## Why it exists

Agents do not need more chat. They need delivery rails.

Agent Pack is the packaging layer. Vaultline is the storage/payment rail.
Together they create a clean loop:

```text
agent ships work -> Agent Pack bundles proof -> Vaultline stores the artifact
```

## Usage

```bash
agent-pack [target] --task "what the agent did"
```

Options:

- `--out <dir>`: output directory, default `.agent-pack`
- `--task <text>`: task or delivery summary
- `--max-files <n>`: max changed/tracked files to include in the manifest
- `--max-file-bytes <n>`: max size for copied source files, default `262144`
- `--include-untracked`: include untracked files in the inventory
- `--no-file-copies`: write metadata only, without copying source files
- `--run-checks`: run detected package checks and store logs
- `--check <command>`: add a custom check command, repeatable
- `--artifact <path>`: attach a file or directory, repeatable
- `--vaultline`: upload the generated bundle through the Bankr Vaultline endpoint
- `--vaultline-path <path>`: Vaultline path for the uploaded bundle
- `--yes`: skip Bankr payment confirmation when using `--vaultline`
- `--json`: print a machine-readable result

Example with checks and artifacts:

```bash
agent-pack . \
  --task "agent finished the release candidate" \
  --run-checks \
  --artifact archive/screenshots/release.png \
  --vaultline \
  --yes
```

Vaultline upload currently shells out to the Bankr CLI:

```bash
bankr x402 call -X POST ... https://x402.bankr.bot/0x2a16625fad3b0d840ac02c7c59edea3781e340ae/vaultline-upload
```

That keeps the first version small while still using the live x402 payment path.

## First version scope

This is the groundwork release:

- local bundle generation
- git-aware file inventory
- safe file copies inside the bundle
- secret-like path exclusion by default
- artifact attachments
- command/check capture from package scripts
- check execution logs with `--run-checks`
- `receipt.json` for downstream automation
- manifest for downstream automation
- optional paid Vaultline upload through Bankr x402

Next steps:

- private wallet-gated Vaultline bundles
- hosted receipt page
- CI action that publishes a pack after agent work completes
