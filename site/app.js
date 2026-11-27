const $ = (id) => document.getElementById(id);
const decimal = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 4 });
const timestamp = new Intl.DateTimeFormat('zh-TW', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Taipei',
});
const pageSize = 30;
const headings = [...document.querySelectorAll('[data-sort]')];
const form = $('quotes');
const controls = form.elements;
let snapshot;
let sort = 'volume';
let ascending = false;
let page = 0;

function format(value, unit = '') {
  return Number.isFinite(value) ? `${decimal.format(value)}${unit}` : '—';
}

function option(value, label) {
  return new Option(label, value);
}

function cell(row, value) {
  const td = row.insertCell();
  td.textContent = value;
  return td;
}

function renderRows() {
  const query = $('search').value.trim().toLowerCase();
  const category = $('category').value;
  const minimum = Math.max(0, $('min-listings').valueAsNumber || 0);
  const target = Math.max(0, $('target').valueAsNumber || 0) / 100;
  const matches = (snapshot?.items ?? []).filter((item) =>
    (category === 'all' || category === item.category) &&
    `${item.name} ${item.variant ?? ''}`.toLowerCase().includes(query) &&
    (!minimum || item.listings >= minimum));

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
    const name = cell(row, item.name);
    if (item.variant) {
      const variant = document.createElement('small');
      variant.textContent = item.variant;
      name.append(variant);
    }
    cell(row, snapshot.categories[item.category]);
    cell(row, format(item.chaos));
    cell(row, format(item.divine ?? item.chaos / snapshot.divine));
    cell(row, format(item.chaos / (1 + target)));
    cell(row, format(item.spread)).className = tone(item.spread);
    cell(row, format(item.listings));
    cell(row, format(item.volume));
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '試算';
    button.setAttribute('aria-label', `試算 ${item.name}`);
    button.addEventListener('click', () => selectItem(item));
    row.insertCell().append(button);
  }
  if (!matches.length) {
    cell($('rows').insertRow(), snapshot ? '沒有符合篩選的品項。' : '尚未取得行情。').colSpan = 9;
  }
  $('page').textContent = `${pages ? page + 1 : 0} / ${pages} 頁 · ${format(matches.length)} 項`;
  $('prev').disabled = page === 0;
  $('next').disabled = page + 1 >= pages;
}

function selectItem(item) {
  $('selected').textContent = [item.name, item.variant, `參考賣出價 ${format(item.chaos, ' C')}`].filter(Boolean).join(' · ');
  controls.buy.value = '';
  controls.buyUnit.value = 'chaos';
  controls.sell.value = item.chaos;
  controls.sellUnit.value = 'chaos';
  controls.quantity.value = 1;
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
  const buy = controls.buy.valueAsNumber * valueInChaos(controls.buyUnit.value);
  const sell = controls.sell.valueAsNumber * valueInChaos(controls.sellUnit.value);
  const quantity = controls.quantity.valueAsNumber;
  const fee = controls.fee.value === '' ? 0 : controls.fee.valueAsNumber;
  const gold = controls.gold.valueAsNumber;
  const valid = form.checkValidity() && buy > 0 && sell >= 0 && Number.isInteger(quantity) && quantity > 0;
  const gross = valid ? (sell - buy) * quantity : NaN;
  const cost = buy * quantity + fee;
  const net = gross - fee;
  const outputs = [
    ['gross', gross, ' C'], ['net', net, ' C'], ['roi', net / cost * 100, '%'],
    ['gold-yield', gold > 0 ? gross * 1000 / gold : NaN, ' C'],
  ];
  for (const [id, value, unit] of outputs) {
    $(id).textContent = format(value, unit);
    $(id).className = tone(value);
  }
}

function setUnits() {
  const extra = (snapshot?.currency ?? []).filter(({ id }) => id !== 'chaos' && id !== 'divine');
  for (const select of [controls.buyUnit, controls.sellUnit]) {
    const previous = select.value;
    select.replaceChildren(option('chaos', 'Chaos (C)'), option('divine', 'Divine (D)'),
      ...extra.map(({ id, name }) => option(id, name)));
    select.value = [...select.options].some(({ value }) => value === previous) ? previous : 'chaos';
  }
}

async function refresh() {
  const button = $('refresh');
  button.disabled = true;
  try {
    const response = await fetch('./data/market.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    snapshot = await response.json();
    const picked = $('category').value;
    $('category').replaceChildren(option('all', '全部'), ...Object.entries(snapshot.categories)
      .map(([id, label]) => option(id, label)));
    $('category').value = snapshot.categories[picked] ? picked : 'all';
    $('league').textContent = snapshot.league.name;
    $('rate').textContent = format(snapshot.divine);
    $('trade').href = `https://www.pathofexile.com/trade/search/${encodeURIComponent(snapshot.league.id)}`;
    $('history').textContent = format(snapshot.history?.rate);
    $('history-time').textContent = snapshot.history ? `${timestamp.format(snapshot.history.hour * 1000)} 台灣時間` : '';
    const partial = snapshot.unavailable.length ? ` · 暫缺：${snapshot.unavailable.join('、')}` : '';
    $('status').textContent = `抓取時間 ${timestamp.format(new Date(snapshot.fetchedAt))} 台灣時間${partial}`;
    setUnits();
    calculate();
  } catch {
    $('status').textContent = snapshot ? '更新失敗，保留上一份快照。' : '目前無行情快照，仍可手動試算。';
  } finally {
    button.disabled = false;
    renderRows();
  }
}

for (const field of ['category', 'search', 'min-listings', 'target']) {
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
