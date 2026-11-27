import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ninja = 'https://poe.ninja/poe1/api/economy';
const cdn = 'https://web.poecdn.com/api/currency-exchange';
const userAgent = 'PDT_tool/0.1 (https://github.com/denny1151/PDT_tool/issues)';
const cacheDir = '.cache';
const dataDir = join('site', 'data');
const chaosId = 'Metadata/Items/Currency/CurrencyRerollRare';
const divineId = 'Metadata/Items/Currency/CurrencyModValues';
const exchange = {
  Currency: '通貨', Fragment: '碎片', Runegraft: '符文嫁接', AllflameEmber: '餘燼',
  Tattoo: '紋身', Omen: '預兆', DjinnCoin: '精靈硬幣', Ducat: '杜卡特',
  EnshroudingCrystal: '結晶', DivinationCard: '命運卡', Artifact: '古物',
  Oil: '油瓶', DeliriumOrb: '譫妄玉', Scarab: '聖甲蟲', Astrolabe: '星盤',
  Thread: '絲線', Fossil: '化石', Resonator: '共振器', Essence: '精髓',
};
const stashItems = {
  UniqueWeapon: '傳奇武器', UniqueArmour: '傳奇護甲', UniqueAccessory: '傳奇飾品',
  UniqueFlask: '傳奇藥劑', UniqueJewel: '傳奇珠寶', ForbiddenJewel: '禁忌珠寶',
  UniqueTincture: '傳奇酊劑', UniqueRelic: '傳奇聖物', UniqueMap: '傳奇地圖',
  SkillGem: '技能石', ImbuedGem: '灌注技能石',
};
const categories = { ...exchange, ...stashItems };

async function getJson(url) {
  const key = Buffer.from(url).toString('base64url');
  const path = join(cacheDir, `${key}.json`);
  const previous = await readFile(path, 'utf8').then(JSON.parse).catch(() => null);
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' };
  if (previous?.etag) headers['If-None-Match'] = previous.etag;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (response.status === 304 && previous) return previous.data;
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  const data = await response.json();
  const etag = response.headers.get('etag');
  if (etag && url.startsWith(ninja)) await writeFile(path, JSON.stringify({ etag, data }));
  return data;
}

function positive(value) {
  return Number.isFinite(value) && value > 0;
}

function overview(path, league, type) {
  return getJson(`${ninja}/${path}/overview?${new URLSearchParams({ league, type })}`);
}

async function exchangeHistory(league) {
  const currentHour = Math.floor(Date.now() / 3_600_000) * 3600;
  for (const hoursAgo of [1, 2]) {
    const hour = currentHour - hoursAgo * 3600;
    const { markets } = await getJson(`${cdn}/${hour}`);
    const market = markets.find(({ league: name, market_pair: pair }) =>
      name === league && pair.includes(chaosId) && pair.includes(divineId));
    const chaos = market?.volume_traded[chaosId];
    const divine = market?.volume_traded[divineId];
    if (positive(chaos) && positive(divine)) return { hour, rate: chaos / divine };
  }
  return null;
}

async function optional(label, request, unavailable) {
  try {
    return await request();
  } catch (error) {
    console.warn(`${label}: ${error.message}`);
    unavailable.push(label);
    return null;
  }
}

await mkdir(cacheDir, { recursive: true });
await mkdir(dataDir, { recursive: true });
const [league] = await getJson(`${ninja}/leagues`);
if (!league?.id) throw new Error('No current PoE 1 economy league');
const basis = await overview('exchange/current', league.id, 'Currency');
const chaos = basis.lines.find(({ id }) => id === 'chaos')?.primaryValue;
const divine = basis.lines.find(({ id }) => id === 'divine')?.primaryValue / chaos;
if (!positive(chaos) || !positive(divine)) throw new Error('No Chaos/Divine reference rate');

const unavailable = [];
const history = await optional('GGG 小時成交', () => exchangeHistory(league.id), unavailable);
const stashCurrency = new Map();
for (const type of ['Currency', 'Fragment']) {
  const data = await optional(`倉庫${exchange[type]}`, () => overview('stash/current/currency', league.id, type), unavailable);
  for (const line of data?.lines ?? []) {
    if (positive(line.chaosEquivalent)) stashCurrency.set(line.detailsId, line.chaosEquivalent);
  }
}

const items = [];
const currency = new Map();
for (const [type, label] of Object.entries(exchange)) {
  const data = type === 'Currency' ? basis : await optional(label, () => overview('exchange/current', league.id, type), unavailable);
  if (!data) continue;
  const metadata = new Map((data.items ?? []).map((item) => [item.id, item]));
  const chaosInPrimary = data.core.primary === 'chaos' ? 1 :
    data.lines.find(({ id }) => id === 'chaos')?.primaryValue ?? 1 / data.core.rates?.chaos;
  const conversion = positive(chaosInPrimary) ? 1 / chaosInPrimary :
    data.core.primary === basis.core.primary ? 1 / chaos : NaN;
  for (const line of data.lines) {
    const info = metadata.get(line.id);
    if (!info || !positive(line.primaryValue) || !positive(conversion)) continue;
    const price = line.primaryValue * conversion;
    const stashPrice = stashCurrency.get(info.detailsId);
    items.push({
      category: type, name: info.name, chaos: price,
      volume: positive(line.volumePrimaryValue) ? line.volumePrimaryValue * conversion : null,
      spread: stashPrice == null ? null : price - stashPrice,
    });
    if (!currency.has(line.id)) currency.set(line.id, { id: line.id, name: info.name, chaos: price });
  }
}

for (const [type, label] of Object.entries(stashItems)) {
  const data = await optional(label, () => overview('stash/current/item', league.id, type), unavailable);
  for (const line of data?.lines ?? []) {
    if (!positive(line.chaosValue)) continue;
    items.push({
      category: type, name: line.name, variant: line.variant || (line.corrupted ? '已腐化' : null),
      chaos: line.chaosValue, divine: positive(line.divineValue) ? line.divineValue : null,
      listings: Number.isFinite(line.listingCount) ? line.listingCount : null,
    });
  }
}

const snapshot = {
  league, divine, history, categories, items, unavailable, fetchedAt: new Date().toISOString(),
  currency: [...currency.values()].sort((a, b) => a.name.localeCompare(b.name)),
};
const output = join(dataDir, 'market.json');
await writeFile(`${output}.tmp`, JSON.stringify(snapshot));
await rename(`${output}.tmp`, output);
console.log(`Published ${items.length} market rows for ${league.name}`);
