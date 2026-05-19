# Vaultline Upload Flow

Agent Pack can upload the generated `bundle.tgz` to Vaultline through the live
BuiltByEcho Bankr x402 endpoint.

## What Happens

```text
agent run -> Agent Pack bundle -> Bankr x402 payment -> Vaultline object
```

The first release keeps this path small and explicit by shelling out to the
Bankr CLI. That gives Agent Pack a live paid storage path without adding a large
client dependency yet.

## Requirements

- Node.js 20+
- Bankr CLI installed
- Funded Bankr wallet capable of paying the x402 request
- Network access to the BuiltByEcho Vaultline Bankr endpoint

## Upload

```bash
agent-pack . \
  --task "agent shipped the release candidate" \
  --run-checks \
  --vaultline \
  --yes
```

Set a stable object path:

```bash
agent-pack . \
  --task "agent shipped the release candidate" \
  --run-checks \
  --vaultline-path agent-pack/release-candidate-0.1.0.tgz \
  --vaultline \
  --yes
```

## Result

When upload succeeds, Agent Pack writes Vaultline metadata into the generated
manifest and receipt. If the Bankr call returns a structured response, Agent Pack
also stores it as `vaultline.json` in the output directory.

## Pricing

Pricing is controlled by the live Bankr x402 Vaultline endpoint, not by the
Agent Pack package. Inspect the Bankr payment challenge before confirming payment
unless you pass `--yes`.

## Public Sharing

Vaultline makes the delivery bundle durable. Agent Pack makes it inspectable.
Before sharing a Vaultline object publicly, inspect the generated local bundle:

- confirm `manifest.json` has no private local paths
- confirm `files/` does not contain secrets
- confirm `artifacts/` are intentional
- confirm check logs are safe to publish

The CLI has safety defaults, but final public release review is still a human
decision.
