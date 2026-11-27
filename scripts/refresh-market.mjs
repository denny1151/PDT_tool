import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ninja = 'https://poe.ninja/poe1/api/economy';
const cdn = 'https://web.poecdn.com/api/currency-exchange';
const userAgent = 'PDT_tool/0.1 (https://github.com/denny1151/PDT_tool/issues)';
const cacheDir = '.cache';
const dataDir = join('site', 'data');
const chaosId = 'Metadata/Items/Currency/CurrencyRerollRare';
const divineId = 'Metadata/Items/Currency/CurrencyModValues';
const exchangeTypes = [
  'Currency', 'Fragment', 'Runegraft', 'AllflameEmber', 'Tattoo', 'Omen', 'DjinnCoin',
  'Ducat', 'EnshroudingCrystal', 'DivinationCard', 'Artifact', 'Oil', 'DeliriumOrb',
  'Scarab', 'Astrolabe', 'Thread', 'Fossil', 'Resonator', 'Essence',
];
const sources = { 'poe.ninja': { ok: 0, failed: 0 }, 'GGG': { ok: 0, failed: 0 } };
const limitsPath = join(cacheDir, 'api-cooldowns.json');
const leaguePath = join(cacheDir, 'market-league.json');
const nameKey = (name) => name.normalize('NFC').replaceAll('’', "'").trim().toLowerCase();

function retryAt(headers) {
  const retryAfter = headers.get('retry-after');
  const now = Date.now();
  const date = retryAfter && (/^\d+$/.test(retryAfter) ? now + Number(retryAfter) * 1000 : Date.parse(retryAfter));
  const cooldowns = (headers.get('x-rate-limit-rules') ?? '').split(',').flatMap((rule) =>
    (headers.get(`x-rate-limit-${rule.trim()}-state`) ?? '').split(',').map((state) => Number(state.split(':')[2]) || 0));
  const delay = Math.max(0, ...cooldowns);
  return Math.max(date || 0, delay ? now + delay * 1000 : 0) || null;
}

async function getJson(url) {
  const source = sources[url.startsWith(ninja) ? 'poe.ninja' : 'GGG'];
  if (source.limited) return null;
  const key = Buffer.from(url).toString('base64url');
  const path = join(cacheDir, `${key}.json`);
  const previous = await readFile(path, 'utf8').then(JSON.parse).catch(() => null);
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' };
  if (previous?.etag) headers['If-None-Match'] = previous.etag;
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
    if (response.status === 429) {
      source.limited = true;
      source.retryAt = retryAt(response.headers);
    }
    const notModified = response.status === 304 && previous;
    if (!response.ok && !notModified) throw new Error(`HTTP ${response.status}`);
    const data = notModified ? previous.data : await response.json();
    const etag = response.headers.get('etag');
    if (etag && !notModified && url.startsWith(ninja)) await writeFile(path, JSON.stringify({ etag, data }));
    source.ok += 1;
    return data;
  } catch (error) {
    source.failed += 1;
    source.lastError = error.message;
    console.warn(`${url}: ${error.message}`);
    return null;
  }
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

function overview(league, type) {
  return getJson(`${ninja}/exchange/current/overview?${new URLSearchParams({ league, type })}`);
}

async function exchangeHistory(league) {
  const currentHour = Math.floor(Date.now() / 3_600_000) * 3600;
  for (const hoursAgo of [1, 2]) {
    const hour = currentHour - hoursAgo * 3600;
    const data = await getJson(`${cdn}/${hour}`);
    if (!Array.isArray(data?.markets)) continue;
    const prices = new Map();
    for (const { league: name, market_pair: pair, volume_traded: volume } of data.markets) {
      if (name !== league) continue;
      for (const [index, item] of pair.entries()) {
        const payment = pair[1 - index];
        if (payment !== chaosId && payment !== divineId) continue;
        if (!positive(volume[item]) || !positive(volume[payment])) continue;
        const quote = prices.get(item) ?? {};
        const unit = payment === chaosId ? 'chaos' : 'divine';
        quote[unit] = volume[payment] / volume[item];
        quote[`${unit}Volume`] = volume[item];
        prices.set(item, quote);
      }
    }
    const rate = prices.get(divineId)?.chaos;
    if (prices.size) return { hour, rate, prices };
  }
  return null;
}

await mkdir(cacheDir, { recursive: true });
await mkdir(dataDir, { recursive: true });
const cooldowns = await readFile(limitsPath, 'utf8').then(JSON.parse).catch(() => ({}));
for (const [name, source] of Object.entries(sources)) {
  if (cooldowns[name] > Date.now()) Object.assign(source, { limited: true, retryAt: cooldowns[name] });
}
const leagueList = await getJson(`${ninja}/leagues`);
const currentLeague = Array.isArray(leagueList) ? leagueList[0] : null;
if (currentLeague?.id) await writeFile(leaguePath, JSON.stringify(currentLeague));
const league = currentLeague?.id ? currentLeague : await readFile(leaguePath, 'utf8').then(JSON.parse).catch(() => null);
const [basis, history] = await Promise.all(league?.id ? [overview(league.id, 'Currency'), exchangeHistory(league.id)] : []);
const chaos = basis?.lines?.find(({ id }) => id === 'chaos')?.primaryValue;
const ninjaRate = basis?.lines?.find(({ id }) => id === 'divine')?.primaryValue / chaos;
const divine = positive(ninjaRate) ? ninjaRate : history?.rate;

const catalog = JSON.parse(await readFile(new URL('./faustus-catalog.json', import.meta.url), 'utf8'));
const reference = new Map();
for (const type of league?.id ? exchangeTypes : []) {
  const data = type === 'Currency' ? basis : await overview(league.id, type);
  if (!data) continue;
  const metadata = new Map((data.items ?? []).map((item) => [item.id, item]));
  const chaosInPrimary = data.core.primary === 'chaos' ? 1 :
    data.lines.find(({ id }) => id === 'chaos')?.primaryValue ?? 1 / data.core.rates?.chaos;
  const conversion = positive(chaosInPrimary) ? 1 / chaosInPrimary :
    data.core.primary === basis?.core.primary ? 1 / chaos : NaN;
  for (const line of data.lines) {
    const info = metadata.get(line.id);
    if (!info || !positive(line.primaryValue) || !positive(conversion)) continue;
    const price = line.primaryValue * conversion;
    const key = nameKey(info.name);
    if (reference.has(key)) continue;
    reference.set(key, {
      currencyId: line.id, chaos: price,
      volume: positive(line.volumePrimaryValue) ? line.volumePrimaryValue * conversion : null,
    });
  }
}

const items = catalog.map(({ marketId, alternativeIds, ...item }) => {
  const activeIds = alternativeIds?.filter((id) => history?.prices.has(id));
  const id = marketId ?? (activeIds?.length === 1 ? activeIds[0] : undefined);
  const pair = history?.prices.get(id);
  return { ...item, ...reference.get(nameKey(item.name)),
    chaosPerItem: pair?.chaos, divinePerItem: pair?.divine,
    chaosVolume: pair?.chaosVolume, divineVolume: pair?.divineVolume };
});
await writeFile(limitsPath, JSON.stringify(Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, source.retryAt]))));
const snapshot = {
  league, leagueCached: !!league && !currentLeague?.id, divine, fxSource: positive(ninjaRate) ? 'poe.ninja' : divine ? 'GGG' : undefined,
  history: history && { hour: history.hour, rate: history.rate }, sources, fetchedAt: new Date().toISOString(),
  categories: [...new Set(items.map((item) => item.category))], items,
  currency: items.filter((item) => item.currencyId && positive(item.chaos))
    .map(({ currencyId: id, name, nameZh, chaos: value }) => ({ id, name, nameZh, chaos: value })),
};
const output = join(dataDir, 'market.json');
await writeFile(`${output}.tmp`, JSON.stringify(snapshot));
await rename(`${output}.tmp`, output);
console.log(`Published ${items.length} market rows for ${league?.name ?? 'unknown league'}`);
