# Agent Pack Release Checklist

Use this checklist for the public `0.1.0` launch.

## Local Verification

```bash
npm test
npm run smoke
node src/cli.js --version
npm publish --dry-run --json
npm pack --json
```

Expected package surface:

- `LICENSE`
- `README.md`
- `package.json`
- `src/cli.js`
- `docs/`

## Repository

- confirm `git status --short` is clean
- confirm the repo is ready to become public
- confirm README links work after the repo is public
- confirm package metadata points to the public GitHub repo
- tag the release after publish

## NPM

- confirm package name: `@builtbyecho/agent-pack`
- confirm version: `0.1.0`
- confirm access: public
- publish only after Dustin explicitly approves public release

```bash
npm publish --access public
```

Read back after publish:

```bash
npm view @builtbyecho/agent-pack version
npm view @builtbyecho/agent-pack dist-tags --json
```

## Site

- update the live Agent Pack page from private-build copy to launch copy
- add the public GitHub repo link
- add npm/npx install command
- deploy production site
- verify the live page at `https://www.builtbyecho.xyz/agent-pack.html`

## Launch Proof Bundle

Create one fresh public proof bundle:

```bash
agent-pack . \
  --task "Agent Pack 0.1.0 public release proof" \
  --run-checks \
  --vaultline-path agent-pack/release-0.1.0.tgz \
  --vaultline \
  --yes
```

Verify:

- bundle exists locally
- Vaultline upload succeeds
- `manifest.json` and `receipt.json` include expected release details
- no private paths or secrets are present

## Launch Claim

Suggested core claim:

```text
Agent Pack is the delivery layer for agent work.

One command turns an agent run into a portable proof bundle: files, logs,
checks, artifacts, manifest, and receipt. Vaultline stores it.

Agents ship. Vaultline holds the proof.
```

## Do Not Claim Yet

- hosted receipt viewer
- private/team bundle flow
- CI action
- native Vaultline SDK upload
- audited security

Those are roadmap items after `0.1.0`.
