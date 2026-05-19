import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const cli = new URL('../src/cli.js', import.meta.url).pathname;

test('creates an agent delivery bundle with safe file copies', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pack-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo', version: '1.0.0', scripts: { test: 'node --version' } }));
  writeFileSync(join(dir, 'index.js'), 'console.log("demo");\n');
  writeFileSync(join(dir, '.env'), 'SECRET=do-not-copy\n');
  execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, stdio: 'ignore' });

  execFileSync(process.execPath, [cli, dir, '--task', 'test bundle', '--out', '.pack', '--include-untracked'], { cwd: dir });

  const manifest = JSON.parse(readFileSync(join(dir, '.pack', 'manifest.json'), 'utf8'));
  const receipt = JSON.parse(readFileSync(join(dir, '.pack', 'receipt.json'), 'utf8'));
  assert.equal(manifest.schema, 'builtbyecho.agent-pack.v1');
  assert.equal(manifest.task, 'test bundle');
  assert.equal(manifest.target.directory.startsWith('/'), false);
  assert.equal(manifest.package.name, 'demo');
  assert.ok(manifest.files.some((file) => file.path === 'index.js' && file.included));
  assert.ok(manifest.files.some((file) => file.path === '.env' && file.reason === 'secret_like_path'));
  assert.equal(receipt.filesIncluded > 0, true);
  assert.equal(existsSync(join(dir, '.pack', 'files', 'index.js')), true);
  assert.equal(existsSync(join(dir, '.pack', 'files', '.env')), false);
  assert.equal(existsSync(join(dir, '.pack', 'bundle.tgz')), true);
  assert.ok(readFileSync(join(dir, '.pack', 'summary.md'), 'utf8').includes('Agent Pack Delivery'));
  assert.equal(readFileSync(join(dir, '.pack', 'manifest.json'), 'utf8').includes(dir), false);
});

test('runs checks and writes logs when requested', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pack-check-'));
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'demo-checks', version: '1.0.0', scripts: { test: 'node --version' } }));
  writeFileSync(join(dir, 'index.js'), 'console.log("demo");\n');

  execFileSync(process.execPath, [cli, dir, '--task', 'check bundle', '--out', '.pack', '--run-checks'], { cwd: dir });

  const manifest = JSON.parse(readFileSync(join(dir, '.pack', 'manifest.json'), 'utf8'));
  assert.equal(manifest.checks[0].status, 'passed');
  assert.equal(existsSync(join(dir, '.pack', manifest.checks[0].log)), true);
});

test('prints the package version', () => {
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const output = execFileSync(process.execPath, [cli, '--version'], { encoding: 'utf8' }).trim();
  assert.equal(output, version);
});

test('runs through an npm-style bin symlink', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-pack-bin-'));
  const bin = join(dir, 'agent-pack');
  symlinkSync(cli, bin);

  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  const output = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  assert.equal(output, version);
});
