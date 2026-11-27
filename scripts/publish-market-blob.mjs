import { readFile } from 'node:fs/promises';
import { put } from '@vercel/blob';

const snapshotUrl = process.env.PDT_MARKET_SNAPSHOT_URL;
const token = process.env.BLOB_READ_WRITE_TOKEN;
if (!/^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/market\.json$/.test(snapshotUrl ?? '') || !token) {
  throw new Error('The Blob URL and its matching read-write token are required.');
}

const snapshot = await readFile(new URL('../site/data/market.json', import.meta.url));
const data = JSON.parse(snapshot);
if (!Number.isFinite(Date.parse(data.fetchedAt)) || !Array.isArray(data.items) || !data.items.length) {
  throw new Error('Refusing to upload an invalid market snapshot.');
}

const blob = await put('market.json', snapshot, {
  access: 'public',
  token,
  allowOverwrite: true,
  contentType: 'application/json',
  cacheControlMaxAge: 60,
  abortSignal: AbortSignal.timeout(30_000),
});
if (new URL(blob.url).href !== snapshotUrl) throw new Error('Unexpected market Blob URL.');
console.log(`Updated market snapshot for ${data.items.length} items.`);
