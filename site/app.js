const $ = (id) => document.getElementById(id);
const decimal = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 });
const smallDecimal = new Intl.NumberFormat('zh-TW', { maximumSignificantDigits: 4 });
const timestamp = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Taipei',
});
const pageSize = 30;
const headings = [...document.querySelectorAll('[data-sort]')];
const form = $('quotes');
const controls = form.elements;
let snapshot;
let selectedItem;
const unitLabel = { chaos: 'C', divine: 'D' };
let sort = 'spread';
let ascending = false;
let page = 0;
let limitTimer;

function format(value, unit = '') {
  if (!Number.isFinite(value)) return '—';
  const formatter = value !== 0 && Math.abs(value) < 0.01 ? smallDecimal : decimal;
  return `${formatter.format(value)}${unit}`;
}

function option(value, label) {
  return new Option(label, value);
}

function cell(row, value, label) {
  const td = row.insertCell();
  td.setAttribute('role', 'cell');
  td.textContent = value;
  if (label) td.dataset.label = label;
  return td;
}

function detail(td, value) {
  const small = document.createElement('small');
  small.textContent = value;
  td.append(small);
  return small;
}

function batchRoute(quantity, buyPrice, sellPrice, buyRate, sellRate, buyUnit, sellUnit) {
  const buyTotal = buyPrice * quantity;
  const sellTotal = sellPrice * quantity;
  // Avoid rounding a floating-point approximation of an integer twice.
  const tolerance = (total) => Number.EPSILON * Math.max(1, total) * 4;
  const buy = Math.ceil(buyTotal - tolerance(buyTotal));
  const sell = Math.floor(sellTotal + tolerance(sellTotal));
  if (!Number.isSafeInteger(buy) || !Number.isSafeInteger(sell) || buy < 1 || sell < 1) return null;
  const cost = buy * buyRate;
  const gross = sell * sellRate - cost;
  return { buy, sell, buyUnit, sellUnit, gross, roi: gross / cost * 100 };
}

function estimateGold(route, quantity, itemRate, goldRates) {
  const saleRate = goldRates?.[route?.sellUnit];
  if (!route || !(itemRate > 0 && saleRate > 0)) return route;
  const goldCost = Math.ceil(quantity * itemRate) + Math.ceil(route.sell * saleRate);
  return { ...route, goldCost, goldEfficiency: route.gross * 1000 / goldCost };
}

function withQuotes(item, { divine: divineRate, goldRates }, requestedQuantity, minimumVolume, maxQuantity) {
  const { chaosPerItem: chaos, divinePerItem: divine } = item;
  if (!(chaos > 0 && divine > 0 && divineRate > 0)) return { ...item, quantity: requestedQuantity ?? 1 };
  const minimumBatch = Math.ceil(1 / Math.min(chaos, divine));
  const quantity = requestedQuantity ?? minimumBatch;
  if (quantity > maxQuantity) return { ...item, minimumBatch };
  const minimum = Math.max(quantity, minimumVolume);
  const batch = { ...item, quantity, minimumBatch };
  if (!(item.chaosVolume >= minimum && item.divineVolume >= minimum)) return { ...batch, requiredVolume: minimum };
  const chaosRoute = estimateGold(batchRoute(quantity, chaos, divine, 1, divineRate, 'chaos', 'divine'),
    quantity, item.goldPerItem, goldRates);
  const divineRoute = estimateGold(batchRoute(quantity, divine, chaos, divineRate, 1, 'divine', 'chaos'),
    quantity, item.goldPerItem, goldRates);
  const bestRoute = (chaosRoute?.gross ?? -Infinity) >= (divineRoute?.gross ?? -Infinity) ? chaosRoute : divineRoute;
  const bestGoldRoute = (chaosRoute?.goldEfficiency ?? -Infinity) >= (divineRoute?.goldEfficiency ?? -Infinity) ? chaosRoute : divineRoute;
  return { ...batch, chaosRoute, divineRoute, bestRoute, bestGoldRoute, spread: bestRoute?.gross, goldEfficiency: bestGoldRoute?.goldEfficiency };
}

function quoteCell(row, route, buyUnit, sellUnit) {
  const td = cell(row, route ? `${format(route.buy, ` ${buyUnit}`)} 買 → ${format(route.sell, ` ${sellUnit}`)} 賣` : '', `${buyUnit} 買・${sellUnit} 賣`);
  if (!route) return;
  detail(td, `歷史試算 ${format(route.gross, ' C')} · ${format(route.roi, '%')}`).className = tone(route.gross);
}

function renderRows() {
  const query = $('search').value.trim().toLowerCase();
  const category = $('category').value;
  const target = Math.max(0, $('target').valueAsNumber || 0) / 100;
  const batchInput = $('batch-size');
  const quantity = batchInput.valueAsNumber;
  const automatic = batchInput.value === '' && !batchInput.validity.badInput;
  const inputMinimum = $('min-volume').valueAsNumber;
  const minimum = Number.isSafeInteger(inputMinimum) && inputMinimum >= 1 ? inputMinimum : 5;
  const validBatch = automatic || (Number.isSafeInteger(quantity) && batchInput.validity.valid);
  const matches = (snapshot?.items ?? []).filter((item) =>
    (category === 'all' || category === item.category) &&
    [item.name, item.nameZh].some((name) => name?.toLowerCase().includes(query)))
    .map((item) => validBatch ? withQuotes(item, snapshot, automatic ? null : quantity, minimum, Number(batchInput.max)) : item);

  renderCandidates(matches);
  matches.sort((a, b) => {
    const left = a[sort];
    const right = b[sort];
    if (left == null && right == null) return a.name.localeCompare(b.name);
    if (left == null) return 1;
    if (right == null) return -1;
    return ascending ? left - right : right - left;
  });
  for (const heading of headings) {
    heading.removeAttribute('aria-sort');
    if (heading.dataset.sort === sort) heading.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
  }
  $('market-sort').value = `${sort}:${ascending ? 'asc' : 'desc'}`;

  const pages = Math.ceil(matches.length / pageSize);
  page = Math.max(0, Math.min(page, pages - 1));
  $('rows').replaceChildren();
  for (const item of matches.slice(page * pageSize, (page + 1) * pageSize)) {
    const row = $('rows').insertRow();
    row.setAttribute('role', 'row');
    const name = cell(row, item.nameZh ?? item.name);
    name.className = 'market-item';
    if (item.nameZh) name.title = item.name;
    detail(name, [item.category, item.subcategory].filter(Boolean).join('／'));
    const reference = cell(row, format(item.chaos, ' C'), '單件參考價');
    detail(reference, format(item.divine ?? item.chaos / snapshot.divine, ' D'));
    const batch = cell(row, format(item.quantity, ' 件'), '試算批量');
    const buyLimit = Math.floor(item.chaos * item.quantity / (1 + target));
    if (buyLimit > 0) detail(batch, `上限 ${format(buyLimit, ' C')}`).className = 'buy-limit';
    if (item.minimumBatch && !(item.quantity >= item.minimumBatch)) {
      detail(batch, `兩方向至少 ${format(item.minimumBatch)} 件`);
    }
    quoteCell(row, item.chaosRoute, 'C', 'D');
    quoteCell(row, item.divineRoute, 'D', 'C');
    cell(row, Number.isFinite(item.spread) ? format(item.spread, ' C') : '', '歷史毛利').className = tone(item.spread);
    const gold = cell(row, Number.isFinite(item.goldEfficiency) ? format(item.goldEfficiency, ' C') : '', '毛利／1k 金幣');
    gold.className = tone(item.goldEfficiency);
    if (item.bestGoldRoute?.goldCost) {
      detail(gold, `${routeLabel(item.bestGoldRoute)} · 約 ${format(item.bestGoldRoute.goldCost)} 金幣`);
    }
    const hasVolumes = item.chaosVolume > 0 || item.divineVolume > 0;
    const volumes = cell(row, format(item.volume, ' C'), '交易額與成交量');
    if (hasVolumes) detail(volumes, `GGG ${format(item.chaosVolume)} / ${format(item.divineVolume)} 件（C / D）`);
    if (item.requiredVolume) {
      detail(volumes, `未達 ${format(item.requiredVolume)} 件`);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '試算';
    button.setAttribute('aria-label', `試算 ${item.nameZh ?? item.name}`);
    button.addEventListener('click', () => selectItem(item, item.quantity ?? 1));
    const action = cell(row, '');
    action.className = 'market-action';
    action.append(button);
  }
  if (!matches.length) {
    const empty = cell($('rows').insertRow(), snapshot ? '沒有符合篩選的品項。' : '尚未取得行情。');
    empty.colSpan = 9;
    empty.className = 'market-empty';
  }
  $('page').textContent = `${pages ? page + 1 : 0} / ${pages} 頁 · ${format(matches.length)} 項`;
  $('prev').disabled = page === 0;
  $('next').disabled = page + 1 >= pages;
}

function routeLabel({ buyUnit, sellUnit }) {
  return `${unitLabel[buyUnit]} 買・${unitLabel[sellUnit]} 賣`;
}

function renderCandidates(items) {
  const budget = $('gold-budget').valueAsNumber;
  const lists = [
    ['gross-candidates', 'gross', (item) => item.bestRoute],
    ['gold-candidates', 'goldEfficiency', (item) => [item.chaosRoute, item.divineRoute]
      .filter((route) => route?.goldEfficiency > 0 && (!Number.isFinite(budget) || route.goldCost <= budget))
      .sort((a, b) => b.goldEfficiency - a.goldEfficiency)[0]],
  ];
  for (const [id, metric, pick] of lists) {
    const list = $(id);
    list.replaceChildren();
    const candidates = items.map((item) => ({ item, route: pick(item) }))
      .filter(({ route }) => route?.[metric] > 0)
      .sort((a, b) => b.route[metric] - a.route[metric]).slice(0, 5);
    if (!candidates.length) {
      const empty = document.createElement('li');
      empty.textContent = snapshot ? '目前條件下沒有正毛利候選。' : '等待行情快照。';
      list.append(empty);
    }
    for (const { item, route } of candidates) {
      const entry = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = item.nameZh ?? item.name;
      button.addEventListener('click', () => selectItem(item, item.quantity));
      const category = document.createElement('span');
      category.className = 'candidate-category';
      category.textContent = item.category;
      entry.append(button, category);
      detail(entry, `${format(item.quantity)} 件 · ${routeLabel(route)} · ${format(route.buy)} ${unitLabel[route.buyUnit]} 買 → ${format(route.sell)} ${unitLabel[route.sellUnit]} 賣`);
      const gold = route.goldCost ? ` · 約 ${format(route.goldCost)} 金幣` : '';
      const efficiency = Number.isFinite(route.goldEfficiency) ? ` · ${format(route.goldEfficiency, ' C')}／1k 金幣` : '';
      detail(entry, `歷史毛利 ${format(route.gross, ' C')}${gold}${efficiency}`).className = 'positive';
      detail(entry, `GGG 成交 ${format(item.chaosVolume)}／${format(item.divineVolume)} 件（C／D）`);
      list.append(entry);
    }
  }
}

function selectItem(item, quantity) {
  selectedItem = item;
  form.reset();
  controls.quantity.value = quantity;
  $('selected').textContent = `${item.nameZh ?? item.name} · 核對當前掛單，再填整批總價`;
  calculate();
  controls.buyChaos.focus();
}

function tone(value) {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return '';
}

function calculate() {
  const rate = controls.rate.valueAsNumber || snapshot?.divine;
  const rates = { chaos: 1, divine: rate };
  const quantity = controls.quantity.valueAsNumber;
  const fee = controls.fee.valueAsNumber || 0;
  const readInteger = (input, min) => {
    const value = input.valueAsNumber;
    return Number.isSafeInteger(value) && value >= min ? value : undefined;
  };
  const overrides = [controls.buyGold, controls.sellChaosGold, controls.sellDivineGold];
  const goldOverridesValid = overrides.every((input) => input.validity.valid && (input.value === '' || readInteger(input, 0) != null));
  const quoteFields = { chaos: [controls.buyChaos, controls.sellChaos], divine: [controls.buyDivine, controls.sellDivine] };
  const buyGold = readInteger(controls.buyGold, 0) ??
    (selectedItem?.goldPerItem > 0 && Number.isSafeInteger(quantity) ? Math.ceil(quantity * selectedItem.goldPerItem) : undefined);
  const valid = controls.quantity.validity.valid && Number.isSafeInteger(quantity) && quantity > 0 &&
    controls.rate.validity.valid && controls.fee.validity.valid;
  const routes = [];
  for (const [buyUnit, [buyInput]] of Object.entries(quoteFields)) {
    for (const [sellUnit, [, sellInput]] of Object.entries(quoteFields)) {
      const buy = readInteger(buyInput, 1);
      const sell = readInteger(sellInput, 1);
      const cost = buy * rates[buyUnit];
      const gross = sell * rates[sellUnit] - cost;
      if (!(valid && Number.isFinite(gross))) continue;
      const saleRate = snapshot?.goldRates?.[sellUnit];
      const sellGoldInput = sellUnit === 'chaos' ? controls.sellChaosGold : controls.sellDivineGold;
      const sellGold = readInteger(sellGoldInput, 0) ?? (saleRate > 0 ? Math.ceil(sell * saleRate) : undefined);
      const goldCost = goldOverridesValid ? buyGold + sellGold : NaN;
      const net = gross - fee;
      const goldEfficiency = goldCost > 0 ? net * 1000 / goldCost : NaN;
      routes.push({ buyUnit, sellUnit, gross, net, roi: net / (cost + fee) * 100, goldCost, goldEfficiency,
        estimated: controls.buyGold.value === '' || sellGoldInput.value === '' });
    }
  }
  routes.sort((a, b) => b.net - a.net);
  const best = routes[0];
  const goldBest = routes.filter((route) => route.goldEfficiency > 0).sort((a, b) => b.goldEfficiency - a.goldEfficiency)[0];
  $('quote-summary').textContent = !best ? '請填有效的件數、至少一種買入和一種賣出報價。'
    : best.net <= 0 ? '目前填入的報價沒有正淨利。'
    : `淨利最高：${routeLabel(best)}${goldBest ? `。金幣效率最高：${routeLabel(goldBest)}。` : '。'}`;
  const results = $('quote-results');
  results.replaceChildren();
  for (const route of routes) {
    const article = document.createElement('article');
    const title = document.createElement('h3');
    title.textContent = routeLabel(route);
    article.append(title);
    detail(article, `毛利 ${format(route.gross, ' C')} · 淨利 ${format(route.net, ' C')} · ${format(route.roi, '%')}`).className = tone(route.net);
    detail(article, Number.isFinite(route.goldCost)
      ? `${route.estimated ? '估算 ' : ''}${format(route.goldCost)} 金幣 · 淨利 ${format(route.goldEfficiency, ' C')}／1k 金幣`
      : '金幣費未填，或缺少估算資料');
    results.append(article);
  }
}

function renderSources() {
  clearInterval(limitTimer);
  const { sources, history, items } = snapshot;
  const paired = items.filter((item) => item.chaosPerItem > 0 && item.divinePerItem > 0).length;
  const show = () => {
    const status = Object.entries(sources).map(([name, source]) => {
      if (source.limited) {
        if (!source.retryAt) return `${name} 限流（HTTP 429，未提供等待時間）`;
        const seconds = Math.ceil((source.retryAt - Date.now()) / 1000);
        return seconds > 0 ? `${name} 限流（HTTP 429，剩 ${seconds} 秒）` : `${name} 限流等待已結束，待下次快照`;
      }
      if (source.failed) return `${name} ${source.ok ? '部分請求失敗' : '請求失敗'}（${source.lastError}）`;
      if (!source.ok) return `${name} 未查詢`;
      return name === 'GGG' && !history ? 'GGG 已回應，暫無成交摘要' : `${name} 已取得資料`;
    });
    $('api-status').textContent = [...status, `同時有 C、D 成交 ${paired}／${items.length} 項`].join(' · ');
    if (!Object.values(sources).some(({ limited, retryAt }) => limited && retryAt > Date.now())) clearInterval(limitTimer);
  };
  if (Object.values(sources).some(({ limited, retryAt }) => limited && retryAt > Date.now())) limitTimer = setInterval(show, 1000);
  show();
}

async function refresh() {
  const button = $('refresh');
  button.disabled = true;
  try {
    const response = await fetch('./data/market.json?v=gold-efficiency', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!data.sources || !Array.isArray(data.categories)) throw new Error('Stale market snapshot');
    snapshot = data;
    const picked = $('category').value;
    $('category').replaceChildren(option('all', '全部'), ...snapshot.categories.map((category) => option(category, category)));
    $('category').value = snapshot.categories.includes(picked) ? picked : 'all';
    $('league').textContent = snapshot.league?.name ?? '—';
    $('rate').textContent = format(snapshot.divine);
    $('rate-source').textContent = snapshot.fxSource ?? '';
    $('trade').href = `https://www.pathofexile.com/trade/search/${encodeURIComponent(snapshot.league?.id ?? '')}`;
    $('history').textContent = format(snapshot.history?.rate);
    $('history-time').textContent = snapshot.history ? `${timestamp.format(snapshot.history.hour * 1000)} 台灣時間` : '';
    $('status').textContent = `抓取時間 ${timestamp.format(new Date(snapshot.fetchedAt))} 台灣時間${snapshot.leagueCached ? ' · 沿用上次聯盟' : ''}`;
    const age = Math.max(0, Math.floor((Date.now() - Date.parse(snapshot.fetchedAt)) / 60000));
    const hour = snapshot.history ? timestamp.format(snapshot.history.hour * 1000) : '無資料';
    $('candidate-time').textContent = `歷史估算 · GGG 成交時段 ${hour}（台灣時間） · 快照距今 ${format(age)} 分鐘`;
    renderSources();
    calculate();
  } catch {
    $('status').textContent = snapshot ? '更新失敗，保留上一份快照。' : '目前無行情快照，仍可手動試算。';
    if (!snapshot) $('candidate-time').textContent = '目前無行情快照。';
  } finally {
    button.disabled = false;
    renderRows();
  }
}

for (const field of ['category', 'search', 'target', 'batch-size', 'min-volume']) {
  $(field).addEventListener('input', () => { page = 0; renderRows(); });
}
for (const heading of headings) {
  heading.querySelector('button').addEventListener('click', () => {
    ascending = sort === heading.dataset.sort && !ascending;
    sort = heading.dataset.sort;
    page = 0;
    renderRows();
  });
}
$('market-sort').addEventListener('change', (event) => {
  const [field, direction] = event.currentTarget.value.split(':');
  sort = field;
  ascending = direction === 'asc';
  page = 0;
  renderRows();
});
$('prev').addEventListener('click', () => { page -= 1; renderRows(); });
$('next').addEventListener('click', () => { page += 1; renderRows(); });
$('refresh').addEventListener('click', refresh);
$('gold-budget').addEventListener('input', renderRows);
form.addEventListener('input', calculate);
form.addEventListener('submit', (event) => event.preventDefault());
renderRows();
refresh();
