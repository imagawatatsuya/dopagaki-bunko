import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AOZORA_CATALOG_SOURCE_URL,
  buildAozoraCatalogMeta,
  buildAozoraCatalogRecords
} from '../src/aozora-catalog.js';
import { extractAozoraCsvFromZip } from '../src/aozora-zip-importer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const defaultOutPath = path.join(repoRoot, 'data', 'aozora-catalog.json');

function parseArgs(argv) {
  const options = {
    zipPath: '',
    outPath: defaultOutPath,
    fetchedAt: '',
    sourceUrl: AOZORA_CATALOG_SOURCE_URL,
    write: false,
    statusOnly: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--zip') {
      options.zipPath = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--out') {
      options.outPath = argv[index + 1] ?? defaultOutPath;
      index += 1;
      continue;
    }
    if (arg === '--fetched-at') {
      options.fetchedAt = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (arg === '--source-url') {
      options.sourceUrl = argv[index + 1] ?? AOZORA_CATALOG_SOURCE_URL;
      index += 1;
      continue;
    }
    if (arg === '--write') {
      options.write = true;
      continue;
    }
    if (arg === '--status-only') {
      options.statusOnly = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelp() {
  console.log([
    'Usage:',
    '  node scripts/update-aozora-catalog.mjs --status-only',
    '  node scripts/update-aozora-catalog.mjs --zip <path-to-zip> [--write] [--out <path>] [--fetched-at <iso8601>]',
    '',
    'Options:',
    '  --zip         Local path to list_person_all_extended_utf8.zip',
    '  --out         Output path for aozora-catalog.json',
    '  --write       Write the rebuilt catalog JSON to disk',
    '  --status-only Show current bundled catalog metadata only',
    '  --fetched-at  Override payload fetchedAt timestamp',
    '  --source-url  Override payload sourceUrl'
  ].join('\n'));
}

function resolveRepoPath(targetPath) {
  if (!targetPath) {
    return defaultOutPath;
  }
  return path.isAbsolute(targetPath) ? targetPath : path.resolve(repoRoot, targetPath);
}

async function readJsonIfPresent(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function summarizeCurrentCatalog(payload, label) {
  if (!payload) {
    return `${label}: まだ存在しません。`;
  }

  const recordCount = payload.recordCount ?? (Array.isArray(payload.records) ? payload.records.length : 0);
  return [
    `${label}:`,
    `  fetchedAt   ${String(payload.fetchedAt ?? '')}`,
    `  recordCount ${String(recordCount)}`,
    `  sourceUrl   ${String(payload.sourceUrl ?? '')}`
  ].join('\n');
}

function buildPayload(records, fetchedAt, sourceUrl) {
  return {
    version: 1,
    fetchedAt,
    sourceUrl,
    recordCount: records.length,
    records
  };
}

function buildRecordMap(records) {
  return new Map(records.map((record) => [String(record.id), record]));
}

function summarizeDiff(currentPayload, nextPayload) {
  const currentRecords = Array.isArray(currentPayload?.records) ? currentPayload.records : [];
  const nextRecords = Array.isArray(nextPayload?.records) ? nextPayload.records : [];
  const currentMap = buildRecordMap(currentRecords);
  const nextMap = buildRecordMap(nextRecords);

  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const [id, nextRecord] of nextMap.entries()) {
    const currentRecord = currentMap.get(id);
    if (!currentRecord) {
      added += 1;
      continue;
    }
    if (JSON.stringify(currentRecord) !== JSON.stringify(nextRecord)) {
      changed += 1;
    }
  }

  for (const id of currentMap.keys()) {
    if (!nextMap.has(id)) {
      removed += 1;
    }
  }

  return [
    '差分概要:',
    `  追加 ${added}件`,
    `  削除 ${removed}件`,
    `  変更 ${changed}件`,
    `  件数差 ${nextRecords.length - currentRecords.length}`
  ].join('\n');
}

function resolveFetchedAt(optionValue, zipStat) {
  if (optionValue) {
    return optionValue;
  }
  if (zipStat?.mtime instanceof Date && !Number.isNaN(zipStat.mtime.valueOf())) {
    return zipStat.mtime.toISOString();
  }
  return new Date().toISOString();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const outPath = resolveRepoPath(options.outPath);
  const currentPayload = await readJsonIfPresent(outPath);
  console.log(summarizeCurrentCatalog(currentPayload, '現在の同梱カタログ'));

  if (options.statusOnly) {
    return;
  }

  if (!options.zipPath) {
    throw new Error('--zip を指定してください。--status-only なら ZIP は不要です。');
  }

  const zipPath = path.resolve(repoRoot, options.zipPath);
  const zipStat = await fs.stat(zipPath);
  const zipBuffer = await fs.readFile(zipPath);
  const extracted = await extractAozoraCsvFromZip(zipBuffer.buffer.slice(zipBuffer.byteOffset, zipBuffer.byteOffset + zipBuffer.byteLength));
  const csvText = new TextDecoder('utf-8').decode(extracted.bytes);
  const records = buildAozoraCatalogRecords(csvText);
  const fetchedAt = resolveFetchedAt(options.fetchedAt, zipStat);
  const meta = buildAozoraCatalogMeta(records, options.sourceUrl, fetchedAt);
  const nextPayload = buildPayload(records, meta.fetchedAt, meta.sourceUrl);

  console.log(summarizeCurrentCatalog(nextPayload, '再生成後のカタログ'));
  console.log(summarizeDiff(currentPayload, nextPayload));

  if (!options.write) {
    console.log('書き込みは行っていません。--write を付けると data/aozora-catalog.json を更新します。');
    return;
  }

  await fs.writeFile(outPath, JSON.stringify(nextPayload));
  console.log(`更新しました: ${outPath}`);
}

await main();
