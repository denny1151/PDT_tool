import { readFile, writeFile } from 'node:fs/promises';

const [twPath, enPath, basePath, output = 'scripts/faustus-catalog.json'] = process.argv.slice(2);
if (!basePath) throw new Error('Usage: node scripts/export-faustus-catalog.mjs <tw.html> <en.html> <base_items.json> [output]');

const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const decode = (value) => value.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (full, key) => {
  if (!key.startsWith('#')) return entities[key] ?? full;
  return String.fromCodePoint(key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)));
}).trim();
const nameKey = (name) => name.normalize('NFC').replaceAll('’', "'").trim().toLowerCase();
const imageKey = (path) => path?.split('/').at(-1).replace(/\.[a-z]+$/i, '').toLowerCase();

function readCatalog(html, title) {
  const start = html.indexOf(`<h4>${title}</h4>`);
  if (start < 0) throw new Error(`Cannot find PoEDB catalog: ${title}`);
  const catalogHtml = html.slice(start);
  const imageBySlug = new Map([...catalogHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>\s*<img[^>]*\balt="([^"]*)"/g)]
    .map(([, href, alt]) => [decode(href), decode(alt)]));
  const block = /<h5>([^<]+)<\/h5>|<div class="currency-exchange-subtitle">([^<]+)<\/div>|<div class="flex-grow-1 ms-2 d-flex justify-content-between align-items-center">\s*<a class="([^"]+)"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<span>([\d/,]+)<\/span>/g;
  const items = new Map();
  let category;
  let subcategory;
  for (const [, main, sub, classes, href, name, gold] of catalogHtml.matchAll(block)) {
    if (main) {
      category = decode(main);
      subcategory = undefined;
    } else if (sub) {
      subcategory = decode(sub);
    } else if (category) {
      const slug = decode(href);
      const [numerator, denominator = 1] = gold.replaceAll(',', '').split('/').map(Number);
      const goldPerItem = numerator / denominator;
      items.set(slug, { category, subcategory, image: imageBySlug.get(slug), itemClass: classes.split(' ').at(-1), name: decode(name),
        goldPerItem: Number.isFinite(goldPerItem) && goldPerItem > 0 ? goldPerItem : undefined });
    }
  }
  if (items.size < 500) throw new Error(`Unexpected PoEDB catalog size: ${items.size}`);
  return items;
}

const [twHtml, enHtml, baseJson] = await Promise.all([twPath, enPath, basePath].map((path) => readFile(path, 'utf8')));
const localized = readCatalog(twHtml, '通貨交換');
const english = readCatalog(enHtml, 'Currency Exchange');
const baseByName = new Map();
for (const [id, base] of Object.entries(JSON.parse(baseJson))) {
  if (!base.name) continue;
  const key = nameKey(base.name);
  if (!baseByName.has(key)) baseByName.set(key, []);
  baseByName.get(key).push({ id, ...base });
}

const items = [];
for (const [slug, item] of localized) {
  const name = english.get(slug)?.name;
  const candidates = name ? baseByName.get(nameKey(name)) ?? [] : [];
  const sameClass = candidates.filter((base) => base.item_class === item.itemClass);
  const sameIcon = item.image ? sameClass.filter((base) => imageKey(base.visual_identity?.dds_file) === imageKey(item.image)) : [];
  const matches = sameIcon.length ? sameIcon : sameClass;
  items.push({
    name: name ?? item.name, nameZh: item.name, category: item.category,
    subcategory: item.subcategory === item.category ? undefined : item.subcategory,
    goldPerItem: item.goldPerItem,
    marketId: matches.length === 1 ? matches[0].id : undefined,
    alternativeIds: matches.length > 1 ? matches.map(({ id }) => id) : undefined,
  });
}

await writeFile(output, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
console.log(`PoEDB catalog: ${items.length} items; ${items.filter((item) => item.marketId).length} matched GGG base IDs`);
