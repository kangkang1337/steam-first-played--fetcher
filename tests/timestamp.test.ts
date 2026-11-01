import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  classifyTimestamp,
  toShanghaiDate,
  MIN_STEAM_EPOCH_SECONDS,
} from '../src/parser/timestamp.ts';

const NOW = 1_800_000_000;

test('toShanghaiDate converts Unix seconds with UTC+8', () => {
  assert.equal(toShanghaiDate(1_700_000_000), '2023-11-15');
  assert.equal(toShanghaiDate(0), '1970-01-01');
});

test('valid first_playtime is accepted and rendered in Asia/Shanghai', () => {
  const result = classifyTimestamp(1_700_000_000, { nowUnix: NOW });
  assert.equal(result.status, 'valid');
  assert.equal(result.unix, 1_700_000_000);
  assert.equal(result.date, '2023-11-15');
});

test('missing field is reported as missing, not 0', () => {
  assert.equal(classifyTimestamp(undefined, { nowUnix: NOW }).status, 'missing');
  assert.equal(classifyTimestamp(null, { nowUnix: NOW }).status, 'missing');
});

test('zero is reported as zero', () => {
  assert.equal(classifyTimestamp(0, { nowUnix: NOW }).status, 'zero');
});

test('string timestamps are rejected as non-numeric', () => {
  assert.equal(classifyTimestamp('1700000000', { nowUnix: NOW }).status, 'not-a-number');
});

test('non-integer and negative timestamps are rejected', () => {
  assert.equal(classifyTimestamp(1_700_000_000.5, { nowUnix: NOW }).status, 'not-integer');
  assert.equal(classifyTimestamp(-1, { nowUnix: NOW }).status, 'negative');
});

test('millisecond-sized values are flagged as unit anomalies', () => {
  assert.equal(classifyTimestamp(1_700_000_000_000, { nowUnix: NOW }).status, 'unit-anomaly');
});

test('too-small values are flagged as unit anomalies', () => {
  assert.equal(classifyTimestamp(17_000_000, { nowUnix: NOW }).status, 'unit-anomaly');
});

test('dates before Steam launch or in the future are implausible', () => {
  assert.equal(classifyTimestamp(900_000_000, { nowUnix: NOW }).status, 'implausible-date');
  assert.equal(classifyTimestamp(NOW + 86_401, { nowUnix: NOW }).status, 'implausible-date');
});

test('Steam launch date itself is plausible', () => {
  const result = classifyTimestamp(MIN_STEAM_EPOCH_SECONDS, { nowUnix: NOW });
  assert.equal(result.status, 'valid');
  assert.equal(result.date, '2003-09-12');
});
