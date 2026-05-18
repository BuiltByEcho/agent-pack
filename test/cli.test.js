import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const cli = new URL('../src/cli.js', import.meta.url).pathname;

test('creates an agent delivery bundle', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pack-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0', scripts: { test: 'node --version' } }));
  writeFileSync(join(dir, 'index.js'), 'console.log("demo");\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

  execFileSync(process.execPath, [cli, dir, '--task', 'test bundle', '--out', '.pack'], { cwd: dir });

  const manifest = JSON.parse(readFileSync(join(dir, '.pack', 'manifest.json'), 'utf8'));
  assert.equal(manifest.schema, 'builtbyecho.agent-pack.v1');
  assert.equal(manifest.task, 'test bundle');
  assert.equal(manifest.package.name, 'demo');
  assert.ok(manifest.files.some((file) => file.path === 'index.js'));
  assert.ok(readFileSync(join(dir, '.pack', 'summary.md'), 'utf8').includes('Agent Pack Delivery'));
});
