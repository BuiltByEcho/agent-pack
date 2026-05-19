# Agent Pack CLI Reference

```bash
agent-pack [target] --task "what the agent did"
```

`target` defaults to the current directory.

## Core Options

- `--out <dir>`: output directory. Defaults to `.agent-pack`.
- `--task <text>`: task or delivery summary.
- `--json`: print a machine-readable result.
- `--version`, `-v`: print the package version.
- `--help`, `-h`: print help.

## File Inventory Options

- `--max-files <n>`: max changed or tracked files to include in the manifest.
- `--max-file-bytes <n>`: max size for copied source files. Defaults to
  `262144`.
- `--include-untracked`: include untracked files in the inventory.
- `--no-file-copies`: write metadata only, without copying source files.

Agent Pack ignores `node_modules`, `.git`, previous `.agent-pack*` outputs, and
`.tgz` archives. It also skips common secret-like paths such as `.env`, private
keys, tokens, credentials, and auth files.

## Checks

- `--run-checks`: run detected package checks and store logs.
- `--check <command>`: add a custom check command. Repeat for multiple checks.

Detected package checks are intentionally conservative. Custom `--check` commands
are the best way to make a release bundle prove exactly what matters.

Example:

```bash
agent-pack . \
  --task "agent finished checkout fix" \
  --check "npm test" \
  --check "npm run lint"
```

## Artifacts

- `--artifact <path>`: attach a file or directory. Repeat for multiple
  artifacts.

Artifacts are copied into `artifacts/` and included in `bundle.tgz`.

Example:

```bash
agent-pack . \
  --task "agent finished UI polish" \
  --artifact archive/screenshots/mobile.png \
  --artifact archive/screenshots/desktop.png
```

## Vaultline

- `--vaultline`: upload the generated bundle through the Bankr Vaultline
  endpoint.
- `--vaultline-path <path>`: Vaultline object path for the uploaded bundle.
- `--yes`: skip Bankr payment confirmation when using `--vaultline`.

Example:

```bash
agent-pack . \
  --task "agent shipped launch candidate" \
  --run-checks \
  --vaultline-path agent-pack/launch-candidate.tgz \
  --vaultline \
  --yes
```

## Output Contract

Every bundle includes:

- `manifest.json`: target metadata, git state, file inventory, checks, artifacts,
  and archive metadata.
- `receipt.json`: compact downstream automation receipt.
- `summary.md`: human-readable handoff summary.
- `files.txt`: file inventory.
- `checks.txt`: check status summary.
- `files/`: copied source files, unless disabled.
- `artifacts/`: attached artifacts.
- `checks/`: check logs.
- `bundle.tgz`: portable archive containing the delivery bundle.
