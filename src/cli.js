#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const BANKR_WALLET = '0x2a16625fad3b0d840ac02c7c59edea3781e340ae';
const VAULTLINE_UPLOAD_URL = `https://x402.bankr.bot/${BANKR_WALLET}/vaultline-upload`;
const DEFAULT_MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_CHECK_TIMEOUT_MS = 120_000;
const PACKAGE_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const SECRET_PATTERNS = [
  /^\.env(\.|$)/,
  /(^|\/)\.env(\.|$)/,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(^|\/)id_rsa$/i,
  /(^|\/)id_ed25519$/i,
  /secret/i,
  /private[-_]?key/i,
  /token/i,
  /credential/i
];

function parseArgs(argv) {
  const args = {
    target: '.',
    out: '.agent-pack',
    task: '',
    maxFiles: 80,
    maxFileBytes: DEFAULT_MAX_FILE_BYTES,
    includeUntracked: false,
    copyFiles: true,
    runChecks: false,
    checks: [],
    artifacts: [],
    vaultline: false,
    vaultlinePath: '',
    yes: false,
    json: false
  };

  const rest = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = requiredValue(argv, ++i, arg);
    else if (arg === '--task') args.task = requiredValue(argv, ++i, arg);
    else if (arg === '--max-files') args.maxFiles = parsePositiveInt(requiredValue(argv, ++i, arg), arg);
    else if (arg === '--max-file-bytes') args.maxFileBytes = parsePositiveInt(requiredValue(argv, ++i, arg), arg);
    else if (arg === '--include-untracked') args.includeUntracked = true;
    else if (arg === '--no-file-copies') args.copyFiles = false;
    else if (arg === '--run-checks') args.runChecks = true;
    else if (arg === '--check') args.checks.push(requiredValue(argv, ++i, arg));
    else if (arg === '--artifact') args.artifacts.push(requiredValue(argv, ++i, arg));
    else if (arg === '--vaultline') args.vaultline = true;
    else if (arg === '--vaultline-path') args.vaultlinePath = requiredValue(argv, ++i, arg);
    else if (arg === '--yes' || arg === '-y') args.yes = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg === '--version' || arg === '-v') {
      console.log(PACKAGE_VERSION);
      process.exit(0);
    } else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      rest.push(arg);
    }
  }

  if (rest[0]) args.target = rest[0];
  return args;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function parsePositiveInt(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${flag} must be a positive integer`);
  return parsed;
}

function printHelp() {
  console.log(`Agent Pack

Usage:
  agent-pack [target] --task "what changed"

Options:
  --out <dir>             Output directory. Default: .agent-pack
  --task <text>           Task or delivery summary
  --max-files <n>         Max project files to index. Default: 80
  --max-file-bytes <n>    Max bytes per copied source file. Default: 262144
  --include-untracked     Include untracked files in inventory
  --no-file-copies        Only write metadata, not source file copies
  --run-checks            Run detected package checks
  --check <command>       Add a custom check command. Repeatable
  --artifact <path>       Attach an artifact file/directory. Repeatable
  --vaultline             Upload bundle through Bankr x402 Vaultline endpoint
  --vaultline-path <path> Vaultline object path
  --yes, -y               Skip Bankr confirmation when uploading
  --json                  Print machine-readable result JSON
  --version, -v           Print Agent Pack version
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

function runRaw(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
  } catch {
    return '';
  }
}

function getProjectRoot(target) {
  const absolute = resolve(target);
  const gitRoot = run('git', ['rev-parse', '--show-toplevel'], absolute);
  if (gitRoot && resolve(gitRoot) === absolute) return absolute;
  return absolute;
}

function readPackage(root) {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function collectFiles(root, includeUntracked, maxFiles) {
  const ownsGitRepo = existsSync(join(root, '.git'));
  const candidates = ownsGitRepo
    ? gitCandidateFiles(root, includeUntracked)
    : localCandidateFiles(root);

  const seen = new Set();
  const files = [];
  for (const file of candidates) {
    if (files.length >= maxFiles) break;
    if (seen.has(file)) continue;
    seen.add(file);
    if (isIgnoredForPack(file)) continue;
    files.push(fileInfo(root, file));
  }
  return files;
}

function gitCandidateFiles(root, includeUntracked) {
  const porcelain = runRaw('git', ['status', '--short'], root);
  const changed = porcelain
    .split('\n')
    .filter(Boolean)
    .filter((line) => includeUntracked || !line.startsWith('??'))
    .map(parseGitStatusPath)
    .filter(Boolean);

  const tracked = run('git', ['ls-files'], root)
    .split('\n')
    .filter(Boolean);

  return [...changed, ...tracked];
}

function parseGitStatusPath(line) {
  const path = line.replace(/^.. /, '').trim();
  const renameMarker = ' -> ';
  return path.includes(renameMarker) ? path.split(renameMarker).pop().trim() : path;
}

function localCandidateFiles(root) {
  const found = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
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
    || file.startsWith('.agent-pack')
    || file.endsWith('.tgz')
    || file === '.DS_Store';
}

function isSecretLike(file) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(file));
}

function fileInfo(root, file) {
  const absolute = join(root, file);
  if (!existsSync(absolute)) return { path: file, exists: false, included: false, reason: 'missing' };
  const stats = statSync(absolute);
  if (!stats.isFile()) return { path: file, type: 'non-file', included: false, reason: 'not_file' };
  const content = readFileSync(absolute);
  return {
    path: file,
    size: stats.size,
    sha256: createHash('sha256').update(content).digest('hex'),
    included: false,
    reason: 'pending'
  };
}

function plannedChecks(pkg, customChecks) {
  const checks = [];
  if (pkg?.scripts) {
    for (const name of ['test', 'lint', 'build', 'typecheck']) {
      if (pkg.scripts[name]) checks.push({ name, command: `npm run ${name}`, source: 'package', status: 'not_run' });
    }
  }
  for (const [index, command] of customChecks.entries()) {
    checks.push({ name: `custom-${index + 1}`, command, source: 'custom', status: 'not_run' });
  }
  return checks;
}

function executeChecks(root, outDir, checks, shouldRun) {
  const checksDir = join(outDir, 'checks');
  mkdirSync(checksDir, { recursive: true });

  return checks.map((check) => {
    if (!shouldRun) return check;
    const startedAt = new Date().toISOString();
    const result = spawnSync(check.command, {
      cwd: root,
      shell: true,
      encoding: 'utf8',
      timeout: DEFAULT_CHECK_TIMEOUT_MS,
      maxBuffer: 1024 * 1024
    });
    const finishedAt = new Date().toISOString();
    const logName = `${safeName(check.name)}.log`;
    const timedOut = Boolean(result.error && result.error.code === 'ETIMEDOUT');
    const output = [
      `$ ${check.command}`,
      '',
      result.stdout || '',
      result.stderr ? `\n[stderr]\n${result.stderr}` : ''
    ].join('\n');
    writeFileSync(join(checksDir, logName), output);
    return {
      ...check,
      status: result.status === 0 ? 'passed' : timedOut ? 'timed_out' : 'failed',
      exitCode: result.status,
      startedAt,
      finishedAt,
      log: `checks/${logName}`
    };
  });
}

function copySelectedFiles(root, outDir, files, maxFileBytes, enabled) {
  const filesDir = join(outDir, 'files');
  mkdirSync(filesDir, { recursive: true });

  return files.map((file) => {
    if (!enabled) return { ...file, included: false, reason: 'file_copies_disabled' };
    if (!file.exists && file.reason === 'missing') return file;
    if (isSecretLike(file.path)) return { ...file, included: false, reason: 'secret_like_path' };
    if ((file.size ?? 0) > maxFileBytes) return { ...file, included: false, reason: 'too_large' };

    const source = join(root, file.path);
    const destination = join(filesDir, file.path);
    mkdirSync(dirname(destination), { recursive: true });
    copyFileSync(source, destination);
    return { ...file, included: true, bundlePath: `files/${file.path}`, reason: 'included' };
  });
}

function copyArtifacts(root, outDir, artifactPaths) {
  const artifactsDir = join(outDir, 'artifacts');
  mkdirSync(artifactsDir, { recursive: true });
  const copied = [];

  for (const artifactPath of artifactPaths) {
    const absolute = resolve(root, artifactPath);
    if (!existsSync(absolute)) {
      copied.push({ path: artifactPath, included: false, reason: 'missing' });
      continue;
    }
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      const files = localCandidateFiles(absolute);
      for (const file of files) {
        const source = join(absolute, file);
        const relativeSource = relative(root, source);
        if (isSecretLike(relativeSource)) {
          copied.push({ path: relativeSource, included: false, reason: 'secret_like_path' });
          continue;
        }
        const destination = join(artifactsDir, basename(absolute), file);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(source, destination);
        copied.push({ path: relativeSource, included: true, bundlePath: relative(outDir, destination), size: statSync(source).size });
      }
    } else if (stats.isFile()) {
      const relativeSource = relative(root, absolute);
      if (isSecretLike(relativeSource)) {
        copied.push({ path: relativeSource, included: false, reason: 'secret_like_path' });
        continue;
      }
      const destination = join(artifactsDir, basename(absolute));
      copyFileSync(absolute, destination);
      copied.push({ path: relativeSource, included: true, bundlePath: relative(outDir, destination), size: stats.size });
    }
  }
  return copied;
}

function writeBundle({ args, root, outDir, files, pkg, checks }) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const copiedFiles = copySelectedFiles(root, outDir, files, args.maxFileBytes, args.copyFiles);
  const artifacts = copyArtifacts(root, outDir, args.artifacts);
  const executedChecks = executeChecks(root, outDir, checks, args.runChecks);

  const git = {
    branch: run('git', ['branch', '--show-current'], root),
    commit: run('git', ['rev-parse', 'HEAD'], root),
    status: run('git', ['status', '--short'], root),
    diffStat: run('git', ['diff', '--stat'], root)
  };

  const manifest = {
    schema: 'builtbyecho.agent-pack.v1',
    createdAt: new Date().toISOString(),
    task: args.task || 'unspecified agent work',
    target: {
      name: pkg?.name || basename(root),
      directory: basename(root)
    },
    package: pkg ? { name: pkg.name, version: pkg.version, private: Boolean(pkg.private) } : null,
    git,
    files: copiedFiles,
    artifacts,
    checks: executedChecks,
    vaultline: {
      uploadUrl: VAULTLINE_UPLOAD_URL,
      suggestedPath: args.vaultlinePath || defaultVaultlinePath(root)
    }
  };

  const receipt = {
    ok: true,
    task: manifest.task,
    createdAt: manifest.createdAt,
    filesIndexed: copiedFiles.length,
    filesIncluded: copiedFiles.filter((file) => file.included).length,
    artifactsIncluded: artifacts.filter((artifact) => artifact.included).length,
    checksPassed: executedChecks.filter((check) => check.status === 'passed').length,
    checksFailed: executedChecks.filter((check) => ['failed', 'timed_out'].includes(check.status)).length,
    vaultlinePath: manifest.vaultline.suggestedPath
  };

  writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(join(outDir, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(join(outDir, 'files.txt'), fileListText(copiedFiles));
  writeFileSync(join(outDir, 'checks.txt'), checkListText(executedChecks));
  writeFileSync(join(outDir, 'summary.md'), summaryMarkdown(manifest, receipt));

  const archive = join(outDir, 'bundle.tgz');
  const archiveResult = spawnSync('tar', ['--exclude', 'bundle.tgz', '-czf', archive, '-C', outDir, '.'], {
    encoding: 'utf8'
  });
  if (archiveResult.status !== 0) {
    throw new Error(`Failed to create archive: ${archiveResult.stderr || archiveResult.stdout}`);
  }

  return { manifest, receipt, archive };
}

function fileListText(files) {
  return files
    .map((file) => `${file.included ? 'included' : 'skipped'} ${file.path} ${file.size ?? '-'} ${file.sha256 ?? ''} ${file.reason ?? ''}`.trim())
    .join('\n') + '\n';
}

function checkListText(checks) {
  return checks.map((check) => `${check.status} ${check.command}${check.log ? ` (${check.log})` : ''}`).join('\n') + '\n';
}

function summaryMarkdown(manifest, receipt) {
  return `# Agent Pack Delivery

${manifest.task}

## Target

- Package: ${manifest.package?.name || 'unknown'}
- Git branch: ${manifest.git.branch || 'unknown'}
- Git commit: ${manifest.git.commit || 'unknown'}
- Files indexed: ${receipt.filesIndexed}
- Files included: ${receipt.filesIncluded}
- Artifacts included: ${receipt.artifactsIncluded}

## Vaultline

- Upload endpoint: ${manifest.vaultline.uploadUrl}
- Suggested path: ${manifest.vaultline.suggestedPath}

## Checks

${manifest.checks.length ? manifest.checks.map((check) => `- ${check.command}: ${check.status}`).join('\n') : '- No checks detected'}

## Safety

Secret-like paths and oversized files are skipped by default.
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

function safeName(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const target = resolve(args.target);
  if (!existsSync(target)) throw new Error(`Target does not exist: ${target}`);

  const root = getProjectRoot(target);
  const outDir = resolve(root, args.out);
  const pkg = readPackage(root);
  const checks = plannedChecks(pkg, args.checks);
  const files = collectFiles(root, args.includeUntracked, args.maxFiles);
  const { manifest, receipt, archive } = writeBundle({ args, root, outDir, files, pkg, checks });

  let vaultlineResult = null;
  if (args.vaultline) {
    const vaultlinePath = args.vaultlinePath || manifest.vaultline.suggestedPath;
    vaultlineResult = uploadToVaultline(archive, vaultlinePath, args.yes);
    writeFileSync(join(outDir, 'vaultline.json'), `${vaultlineResult}\n`);
  }

  const result = {
    ok: true,
    outDir,
    archive,
    manifest: join(outDir, 'manifest.json'),
    receipt: join(outDir, 'receipt.json'),
    filesIndexed: receipt.filesIndexed,
    filesIncluded: receipt.filesIncluded,
    checksPassed: receipt.checksPassed,
    checksFailed: receipt.checksFailed,
    vaultlinePath: args.vaultlinePath || manifest.vaultline.suggestedPath,
    vaultlineUploaded: Boolean(vaultlineResult)
  };

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Agent Pack created: ${relative(process.cwd(), outDir) || outDir}`);
    console.log(`Files indexed: ${receipt.filesIndexed}`);
    console.log(`Files included: ${receipt.filesIncluded}`);
    console.log(`Checks: ${receipt.checksPassed} passed, ${receipt.checksFailed} failed`);
    console.log(`Archive: ${relative(process.cwd(), archive) || archive}`);
    console.log(`Vaultline path: ${result.vaultlinePath}`);
    if (vaultlineResult) console.log('Vaultline upload: complete');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
