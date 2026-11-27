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

function cell(row, value) {
  const td = row.insertCell();
  td.textContent = value;
  return td;
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

function withQuotes(item, divineRate, requestedQuantity, minimumVolume, maxQuantity) {
  const { chaosPerItem: chaos, divinePerItem: divine } = item;
  if (!(chaos > 0 && divine > 0 && divineRate > 0)) return { ...item, quantity: requestedQuantity ?? 1 };
  const minimumBatch = Math.ceil(1 / Math.min(chaos, divine));
  const quantity = requestedQuantity ?? minimumBatch;
  if (quantity > maxQuantity) return { ...item, minimumBatch };
  const minimum = Math.max(quantity, minimumVolume);
  const batch = { ...item, quantity, minimumBatch };
  if (!(item.chaosVolume >= minimum && item.divineVolume >= minimum)) return { ...batch, requiredVolume: minimum };
  const chaosRoute = batchRoute(quantity, chaos, divine, 1, divineRate, 'chaos', 'divine');
  const divineRoute = batchRoute(quantity, divine, chaos, divineRate, 1, 'divine', 'chaos');
  const bestRoute = (chaosRoute?.gross ?? -Infinity) >= (divineRoute?.gross ?? -Infinity) ? chaosRoute : divineRoute;
  return { ...batch, chaosRoute, divineRoute, bestRoute, spread: bestRoute?.gross };
}

function quoteCell(row, route, buyUnit, sellUnit) {
  const td = cell(row, route ? `${format(route.buy, ` ${buyUnit}`)} 買 → ${format(route.sell, ` ${sellUnit}`)} 賣` : '');
  if (!route) return;
  const profit = document.createElement('small');
  profit.textContent = `歷史試算 ${format(route.gross, ' C')} · ${format(route.roi, '%')}`;
  profit.className = tone(route.gross);
  td.append(profit);
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
    .map((item) => validBatch ? withQuotes(item, snapshot.divine, automatic ? null : quantity, minimum, Number(batchInput.max)) : item);

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

  const pages = Math.ceil(matches.length / pageSize);
  page = Math.max(0, Math.min(page, pages - 1));
  $('rows').replaceChildren();
  for (const item of matches.slice(page * pageSize, (page + 1) * pageSize)) {
    const row = $('rows').insertRow();
    const name = cell(row, item.nameZh ?? item.name);
    if (item.nameZh) name.title = item.name;
    const group = cell(row, item.category);
    if (item.subcategory) {
      const subgroup = document.createElement('small');
      subgroup.textContent = item.subcategory;
      group.append(subgroup);
    }
    cell(row, format(item.chaos));
    cell(row, format(item.divine ?? item.chaos / snapshot.divine));
    const batch = cell(row, format(item.quantity));
    if (item.minimumBatch && !(item.quantity >= item.minimumBatch)) {
      const note = document.createElement('small');
      note.textContent = `兩方向至少 ${format(item.minimumBatch)} 件`;
      batch.append(note);
    }
    const buyLimit = Math.floor(item.chaos * item.quantity / (1 + target));
    cell(row, format(buyLimit > 0 ? buyLimit : NaN));
    quoteCell(row, item.chaosRoute, 'C', 'D');
    quoteCell(row, item.divineRoute, 'D', 'C');
    cell(row, Number.isFinite(item.spread) ? format(item.spread) : '').className = tone(item.spread);
    const hasVolumes = item.chaosVolume > 0 || item.divineVolume > 0;
    const volumes = cell(row, hasVolumes ? `${format(item.chaosVolume)} / ${format(item.divineVolume)}` : '');
    if (item.requiredVolume) {
      const note = document.createElement('small');
      note.textContent = `未達 ${format(item.requiredVolume)} 件`;
      volumes.append(note);
    }
    cell(row, format(item.volume));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '試算';
    button.setAttribute('aria-label', `試算 ${item.nameZh ?? item.name}`);
    button.addEventListener('click', () => selectItem(item, item.quantity ?? 1));
    row.insertCell().append(button);
  }
  if (!matches.length) {
    cell($('rows').insertRow(), snapshot ? '沒有符合篩選的品項。' : '尚未取得行情。').colSpan = 12;
  }
  $('page').textContent = `${pages ? page + 1 : 0} / ${pages} 頁 · ${format(matches.length)} 項`;
  $('prev').disabled = page === 0;
  $('next').disabled = page + 1 >= pages;
}

function selectItem(item, quantity) {
  const route = item.bestRoute;
  const note = '填入弗斯特目前的整批買賣總價';
  $('selected').textContent = [item.nameZh ?? item.name, note].join(' · ');
  controls.buy.value = '';
  controls.buyUnit.value = route?.buyUnit ?? 'chaos';
  controls.sell.value = '';
  controls.sellUnit.value = route?.sellUnit ?? 'chaos';
  controls.quantity.value = quantity;
  controls.fee.value = 0;
  controls.gold.value = '';
  calculate();
  controls.buy.focus();
}

function tone(value) {
  if (value > 0) return 'positive';
  if (value < 0) return 'negative';
  return '';
}

function calculate() {
  const override = controls.rate.valueAsNumber;
  const rate = override > 0 ? override : snapshot?.divine;
  const valueInChaos = (unit) => {
    if (unit === 'chaos') return 1;
    if (unit === 'divine') return rate;
    return snapshot?.currency.find((currency) => currency.id === unit)?.chaos;
  };
  const buyTotal = controls.buy.valueAsNumber;
  const sellTotal = controls.sell.valueAsNumber;
  const buy = buyTotal * valueInChaos(controls.buyUnit.value);
  const sell = sellTotal * valueInChaos(controls.sellUnit.value);
  const quantity = controls.quantity.valueAsNumber;
  const fee = controls.fee.value === '' ? 0 : controls.fee.valueAsNumber;
  const gold = controls.gold.valueAsNumber;
  const valid = form.checkValidity() && Number.isSafeInteger(buyTotal) && Number.isSafeInteger(sellTotal) && buy > 0 && sell > 0 && Number.isSafeInteger(quantity) && quantity > 0;
  const gross = valid ? sell - buy : NaN;
  const cost = buy + fee;
  const net = gross - fee;
  const outputs = [
    ['gross', gross, ' C'], ['net', net, ' C'], ['roi', net / cost * 100, '%'],
    ['gold-yield', gold > 0 ? gross * 1000 / gold : NaN, ' C'],
  ];
  for (const [id, value, unit] of outputs) {
    $(id).textContent = format(value, unit);
    $(id).className = tone(value);
  }
  $('gross-per-item').textContent = valid ? `每件 ${format(gross / quantity, ' C')}` : '';
}

function setUnits() {
  const extra = (snapshot?.currency ?? []).filter(({ id }) => id !== 'chaos' && id !== 'divine')
    .sort((a, b) => (a.nameZh ?? a.name).localeCompare(b.nameZh ?? b.name, 'zh-TW'));
  for (const select of [controls.buyUnit, controls.sellUnit]) {
    const previous = select.value;
    select.replaceChildren(option('chaos', '混沌石 (C)'), option('divine', '神聖石 (D)'),
      ...extra.map(({ id, name, nameZh }) => option(id, nameZh ?? name)));
    select.value = [...select.options].some(({ value }) => value === previous) ? previous : 'chaos';
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
    const response = await fetch('./data/market.json?v=trade-volume', { cache: 'no-cache' });
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
    renderSources();
    setUnits();
    calculate();
  } catch {
    $('status').textContent = snapshot ? '更新失敗，保留上一份快照。' : '目前無行情快照，仍可手動試算。';
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
$('prev').addEventListener('click', () => { page -= 1; renderRows(); });
$('next').addEventListener('click', () => { page += 1; renderRows(); });
$('refresh').addEventListener('click', refresh);
form.addEventListener('input', calculate);
form.addEventListener('submit', (event) => event.preventDefault());
setUnits();
renderRows();
refresh();
