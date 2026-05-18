#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BANKR_WALLET = '0x2a16625fad3b0d840ac02c7c59edea3781e340ae';
const VAULTLINE_UPLOAD_URL = `https://x402.bankr.bot/${BANKR_WALLET}/vaultline-upload`;

function parseArgs(argv) {
  const args = {
    target: '.',
    out: '.agent-pack',
    task: '',
    maxFiles: 80,
    includeUntracked: false,
    vaultline: false,
    vaultlinePath: '',
    yes: false
  };

  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = requiredValue(argv, ++i, arg);
    else if (arg === '--task') args.task = requiredValue(argv, ++i, arg);
    else if (arg === '--max-files') args.maxFiles = Number(requiredValue(argv, ++i, arg));
    else if (arg === '--include-untracked') args.includeUntracked = true;
    else if (arg === '--vaultline') args.vaultline = true;
    else if (arg === '--vaultline-path') args.vaultlinePath = requiredValue(argv, ++i, arg);
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      rest.push(arg);
    }
  }

  if (rest[0]) args.target = rest[0];
  if (!Number.isFinite(args.maxFiles) || args.maxFiles < 1) {
    throw new Error('--max-files must be a positive number');
  }
  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function printHelp() {
  console.log(`Agent Pack

Usage:
  agent-pack [target] --task "what changed"

Options:
  --out <dir>             Output directory. Default: .agent-pack
  --task <text>           Task or delivery summary
  --max-files <n>         Max files to include in manifest. Default: 80
  --include-untracked     Include untracked files in inventory
  --vaultline             Upload bundle through Bankr x402 Vaultline endpoint
  --vaultline-path <path> Vaultline object path
  --yes, -y               Skip Bankr confirmation when uploading
`);
}

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    return '';
  }
}

function getGitRoot(target) {
  const root = run('git', ['rev-parse', '--show-toplevel'], target);
  if (root && resolve(root) === resolve(target)) return root;
  return target;
}

function readPackage(target) {
  const path = join(target, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function gitFiles(root, includeUntracked, maxFiles) {
  const ownsGitRepo = existsSync(join(root, '.git'));
  if (!ownsGitRepo) return localFiles(root, maxFiles).map((file) => fileInfo(root, file));

  const porcelain = run('git', ['status', '--short'], root);
  const changed = porcelain
    .split('\n')
    .filter(Boolean)
    .filter((line) => includeUntracked || !line.startsWith('??'))
    .map((line) => line.slice(3).trim())
    .filter(Boolean);

  const tracked = run('git', ['ls-files'], root)
    .split('\n')
    .filter(Boolean);

  const seen = new Set();
  return [...changed, ...tracked]
    .filter((file) => {
      if (seen.has(file)) return false;
      seen.add(file);
      return !isIgnoredForPack(file);
    })
    .slice(0, maxFiles)
    .map((file) => fileInfo(root, file));
}

function localFiles(root, maxFiles) {
  const found = [];
  function walk(dir) {
    if (found.length >= maxFiles) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (found.length >= maxFiles) return;
      const absolute = join(dir, entry.name);
      const file = relative(root, absolute);
      if (isIgnoredForPack(file) || entry.name === '.git' || entry.name === 'node_modules') continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) found.push(file);
    }
  }
  walk(root);
  return found;
}

function isIgnoredForPack(file) {
  return file.includes('node_modules/')
    || file.includes('.git/')
    || file.startsWith('.agent-pack/')
    || file.endsWith('.tgz')
    || file === '.DS_Store';
}

function fileInfo(root, file) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) return { path: file, exists: false };
  const stats = statSync(absolute);
  if (!stats.isFile()) return { path: file, type: 'non-file' };
  const content = readFileSync(absolute);
  return {
    path: file,
    size: stats.size,
    sha256: createHash('sha256').update(content).digest('hex')
  };
}

function detectChecks(pkg) {
  if (!pkg?.scripts) return [];
  const preferred = ['test', 'lint', 'build', 'typecheck'];
  return preferred
    .filter((name) => pkg.scripts[name])
    .map((name) => ({ name, command: `npm run ${name}`, status: 'not_run' }));
}

function writeBundle({ args, root, outDir, files, pkg, checks }) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const git = {
    root,
    branch: run('git', ['branch', '--show-current'], root),
    commit: run('git', ['rev-parse', 'HEAD'], root),
    status: run('git', ['status', '--short'], root)
  };

  const manifest = {
    schema: 'builtbyecho.agent-pack.v1',
    createdAt: new Date().toISOString(),
    task: args.task || 'unspecified agent work',
    target: root,
    package: pkg ? { name: pkg.name, version: pkg.version, private: Boolean(pkg.private) } : null,
    git,
    files,
    checks,
    vaultline: {
      uploadUrl: VAULTLINE_UPLOAD_URL,
      suggestedPath: args.vaultlinePath || defaultVaultlinePath(root)
    }
  };

  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outDir, 'files.txt'), files.map((file) => `${file.path} ${file.size ?? '-'} ${file.sha256 ?? ''}`.trim()).join('\n') + '\n');
  writeFileSync(join(outDir, 'checks.txt'), checks.map((check) => `${check.status} ${check.command}`).join('\n') + '\n');
  writeFileSync(join(outDir, 'summary.md'), summaryMarkdown(manifest));

  const archive = join(outDir, 'bundle.tgz');
  const archiveResult = spawnSync('tar', ['-czf', archive, '-C', outDir, 'manifest.json', 'summary.md', 'files.txt', 'checks.txt'], {
    encoding: 'utf8'
  });
  if (archiveResult.status !== 0) {
    throw new Error(`Failed to create archive: ${archiveResult.stderr || archiveResult.stdout}`);
  }

  return { manifest, archive };
}

function summaryMarkdown(manifest) {
  return `# Agent Pack Delivery

${manifest.task}

## Target

- Package: ${manifest.package?.name || 'unknown'}
- Git branch: ${manifest.git.branch || 'unknown'}
- Git commit: ${manifest.git.commit || 'unknown'}
- Files indexed: ${manifest.files.length}

## Vaultline

- Upload endpoint: ${manifest.vaultline.uploadUrl}
- Suggested path: ${manifest.vaultline.suggestedPath}

## Checks

${manifest.checks.length ? manifest.checks.map((check) => `- ${check.command}: ${check.status}`).join('\n') : '- No package checks detected'}
`;
}

function defaultVaultlinePath(root) {
  const name = basename(root).replace(/[^a-zA-Z0-9._-]/g, '-');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+$/, 'Z');
  return `agent-pack/${name}-${stamp}.tgz`;
}

function uploadToVaultline(archive, path, yes) {
  const content = readFileSync(archive).toString('base64');
  const body = JSON.stringify({
    path,
    content,
    encoding: 'base64',
    contentType: 'application/gzip'
  });

  const command = ['x402', 'call', '-X', 'POST', '-d', body, '--max-payment', '0.01'];
  if (yes) command.push('-y');
  command.push('--raw', VAULTLINE_UPLOAD_URL);

  const result = spawnSync('bankr', command, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`Vaultline upload failed:\n${result.stderr || result.stdout}`);
  }
  return result.stdout.trim();
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const target = resolve(args.target);
  if (!existsSync(target)) throw new Error(`Target does not exist: ${target}`);

  const root = getGitRoot(target);
  const outDir = resolve(root, args.out);
  const pkg = readPackage(root);
  const checks = detectChecks(pkg);
  const files = gitFiles(root, args.includeUntracked, args.maxFiles);
  const { manifest, archive } = writeBundle({ args, root, outDir, files, pkg, checks });

  let vaultlineResult = null;
  if (args.vaultline) {
    const vaultlinePath = args.vaultlinePath || manifest.vaultline.suggestedPath;
    vaultlineResult = uploadToVaultline(archive, vaultlinePath, args.yes);
    writeFileSync(join(outDir, 'vaultline.json'), `${vaultlineResult}\n`);
  }

  console.log(`Agent Pack created: ${relative(process.cwd(), outDir) || outDir}`);
  console.log(`Files indexed: ${files.length}`);
  console.log(`Archive: ${relative(process.cwd(), archive) || archive}`);
  console.log(`Vaultline path: ${args.vaultlinePath || manifest.vaultline.suggestedPath}`);
  if (vaultlineResult) console.log('Vaultline upload: complete');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
