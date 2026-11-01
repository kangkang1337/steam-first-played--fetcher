import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadConfig, parseEnvFile, validateConfig } from '../src/config.ts';
import { AppError } from '../src/errors.ts';

const OWNER = '76561198000000000';
const KEY = 'a'.repeat(32);

function expectConfigError(fn: () => unknown): void {
  assert.throws(fn, (err: unknown) => err instanceof AppError && err.category === 'config');
}

function makeTmpDir(prefix: string): string {
  const base = join(process.cwd(), '.tmp');
  mkdirSync(base, { recursive: true });
  return mkdtempSync(join(base, prefix));
}

test('validateConfig accepts a complete config', () => {
  const config = validateConfig({ ownerId: OWNER, apiKey: KEY });
  assert.equal(config.ownerId, OWNER);
  assert.equal(config.apiKey, KEY);
  assert.equal(config.proxyUrl, null);
});

test('validateConfig rejects a non-17-digit owner id', () => {
  expectConfigError(() => validateConfig({ ownerId: '123', apiKey: KEY }));
});

test('validateConfig rejects a non-hex API key', () => {
  expectConfigError(() => validateConfig({ ownerId: OWNER, apiKey: 'zzzz' }));
});

test('validateConfig rejects ftp proxies', () => {
  expectConfigError(() => validateConfig({ ownerId: OWNER, apiKey: KEY, proxyUrl: 'ftp://127.0.0.1:21' }));
});

test('validateConfig accepts http and https proxies', () => {
  assert.equal(
    validateConfig({ ownerId: OWNER, apiKey: KEY, proxyUrl: 'http://127.0.0.1:7890' }).proxyUrl,
    'http://127.0.0.1:7890',
  );
  assert.equal(
    validateConfig({ ownerId: OWNER, apiKey: KEY, proxyUrl: 'https://proxy.example:443' }).proxyUrl,
    'https://proxy.example:443',
  );
});

test('parseEnvFile handles comments, blanks and quotes', () => {
  const values = parseEnvFile('# comment\nA=1\nB="two words"\nC=\'three\'\n\nD = 4\nBAD LINE\n');
  assert.equal(values.A, '1');
  assert.equal(values.B, 'two words');
  assert.equal(values.C, 'three');
  assert.equal(values.D, '4');
  assert.equal(values.BAD, undefined);
});

test('loadConfig reads values from the injected environment', () => {
  const dir = makeTmpDir('cfg-env-');
  try {
    const config = loadConfig({
      cwd: dir,
      env: { STEAM_OWNER_ID: OWNER, STEAM_WEB_API_KEY: KEY },
    });
    assert.equal(config.ownerId, OWNER);
    assert.equal(config.proxyUrl, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig reads .env.local from cwd', () => {
  const dir = makeTmpDir('cfg-file-');
  try {
    writeFileSync(
      join(dir, '.env.local'),
      `STEAM_OWNER_ID=${OWNER}\nSTEAM_WEB_API_KEY=${KEY}\nSTEAM_HTTPS_PROXY=http://127.0.0.1:7890\n`,
    );
    const config = loadConfig({ cwd: dir, env: {} });
    assert.equal(config.ownerId, OWNER);
    assert.equal(config.proxyUrl, 'http://127.0.0.1:7890');
    assert.ok(config.envFilePath?.endsWith('.env.local'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig fails cleanly when nothing is configured', () => {
  const dir = makeTmpDir('cfg-empty-');
  try {
    expectConfigError(() => loadConfig({ cwd: dir, env: {} }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
