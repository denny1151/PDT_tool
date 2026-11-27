import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const [dictionary, marketFile, output = 'site/data/names.zh-TW.json'] = process.argv.slice(2);
if (!dictionary || !marketFile) {
  throw new Error('Usage: node scripts/export-item-names.mjs <zh-rTW directory> <market.json> [output]');
}

const cjk = /\p{Script=Han}/u;
const key = (name) => name.trim().replaceAll('’', "'").toLowerCase();
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const files = {
  items: ['items.json'],
  uniques: ['uniques.json'],
  gems: ['gem_names.json', 'gem_names_support.json', 'gem_names_nonactive.json', 'gems.json'],
  passives: ['passives.json', 'ascendancy_by_id.json'],
};

// Exact names checked against the Traditional Chinese PoEDB item pages.
const supplemental = new Map(Object.entries({
  "Maven's Chisel of Threads": '釋界之綢帶鑿',
  'Cursed Poppet': '詛咒魔偶',
  'Allflame Ember of the Cloister': '不滅之火迴廊餘燼',
  'Allflame Ember of the Divine': '不滅之火命運餘燼',
  'Allflame Ember of the Multitude': '不滅之火增生餘燼',
  'Afarud Enshrouding Crystal': '阿法魯德壟罩晶石',
  'Feral Astrolabe': '野性星盤',
  'Immortal Astrolabe': '永生星盤',
  'Royal Astrolabe': '皇家星盤',
  'Abyss Thread': '深淵綢帶',
  'Bestiary Thread': '獸獵綢帶',
  'Betrayal Thread': '反叛綢帶',
  'Breach Thread': '裂痕綢帶',
  'Blight Thread': '凋落綢帶',
  'Expedition Thread': '探險綢帶',
  'Incursion Thread': '穿越綢帶',
  'Ritual Thread': '祭祀綢帶',
  'Ultimatum Thread': '通牒綢帶',
  'Legion Thread': '戰亂綢帶',
  'Essence of Trickery': '欺瞞精髓',
  'Corpse Rose': '屍綻血玫',
}));

async function loadNames(list) {
  const names = new Map();
  for (const file of list) {
    const data = await readJson(join(dictionary, file));
    for (const [name, translation] of Object.entries(data.entries ?? data)) {
      if (typeof translation !== 'string' || !cjk.test(translation) || translation.includes('\uFFFD')) continue;
      if (!names.has(key(name))) names.set(key(name), translation);
    }
  }
  return names;
}

const source = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([group, list]) =>
  [group, await loadNames(list)])));
const market = await readJson(marketFile);
const names = new Map();
let translated = 0;

function gemName(name) {
  const normalized = key(name);
  const lookup = (part) => source.gems.get(part) ?? source.gems.get(part.replace(/ support$/, ''));
  const full = lookup(normalized);
  if (full) return full;
  const parts = /^(vaal .+) \((.+)\)$/.exec(normalized);
  if (!parts) return;
  const main = lookup(parts[1]);
  const transfigured = lookup(parts[2]);
  return main && transfigured ? `${main}（${transfigured}）` : undefined;
}

function uniqueName(name) {
  const normalized = key(name);
  const full = source.uniques.get(normalized);
  if (full || !normalized.startsWith('foulborn ')) return full;
  const base = source.uniques.get(normalized.slice('foulborn '.length));
  return base ? `${base}（穢生）` : undefined;
}

for (const item of market.items) {
  let value;
  if (item.category === 'ForbiddenJewel') {
    value = source.passives.get(key(item.name));
    const variant = item.variant && uniqueName(item.variant);
    if (variant) names.set(item.variant, variant);
  } else if (item.category.startsWith('Unique')) {
    value = uniqueName(item.name);
  } else if (item.category === 'SkillGem' || item.category === 'ImbuedGem') {
    value = gemName(item.name);
  } else {
    value = source.items.get(key(item.name));
  }
  value ??= supplemental.get(item.name);
  if (value) {
    names.set(item.name, value);
    translated += 1;
  }
}

const sorted = Object.fromEntries([...names].sort(([a], [b]) => a.localeCompare(b, 'en')));
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
console.log(`Matched ${translated}/${market.items.length} market rows (${names.size} names)`);
