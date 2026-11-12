import {accountOrder, balances, closingEntries, net, order, parent, sum} from '/ledger.mjs';

const icons = {
  plan: '<path d="M3 9h18L12 3 3 9Zm2 11h14M7 10v7m5-7v7m5-7v7M3 20h18"/>',
  book: '<path d="M6 3h13v18H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm-2 15a2 2 0 0 1 2-2h13M8 7h7"/>',
  ledger: '<path d="M3 5c4-1 7 0 9 2 2-2 5-3 9-2v14c-4-1-7 0-9 2-2-2-5-3-9-2V5Zm9 2v14M6 9l3 .5m6 0 3-.5"/>',
  balance: '<path d="M3 20h18M6 17v-6h3v6m2 0V5h3v12m2 0V8h3v9"/>',
  results: '<path d="M3 19h18M5 15l5-5 4 2 6-7m-5 0h5v5"/>',
  manual: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 9h16M4 14h16M10 4v16"/>',
  models: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
  close: '<path d="M6 3h8l4 4v14H6V3Zm8 0v5h4m-9 4h6m-6 4h6"/>',
  trash: '<path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15m-8 4v7m4-7v7"/>',
  inflation: '<path d="M5 3h10l4 4v14H5V3Zm10 0v5h4m-11 8 3-3 2 1 3-3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/>',
  folder: '<path d="M3 6h7l2 2h9v11H3V6Z"/>',
  arrow: '<path d="m9 5 7 7-7 7"/>',
  edit: '<path d="m4 16-1 5 5-1L20 8l-4-4L4 16Zm9-9 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4h16v-4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="m6 6 12 12M6 18 18 6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'
};

const pages = {
  plan: ['Plan de cuentas', 'plan', 'Organizá las cuentas que alimentan tus asientos y libros.'],
  diario: ['Libro diario', 'book', 'Consultá los movimientos en orden cronológico.'],
  mayor: ['Libro mayor', 'ledger', 'Revisá los movimientos y el saldo acumulado por cuenta.'],
  balance: ['Balance general de sumas y saldos', 'balance', 'Consultá los saldos iniciales, los movimientos y los saldos al cierre del rango.'],
  resultados: ['Estado de resultados', 'results', 'Consultá los ingresos, egresos y el resultado del período.'],
  manuales: ['Asientos manuales', 'manual', 'Registrá y consultá los asientos de tu ejercicio.'],
  modelos: ['Asientos modelo', 'models', 'Guardá plantillas para reutilizar en asientos manuales.'],
  cierre: ['Crear asiento de cierre', 'close', 'Previsualizá el cierre de resultados, el cierre patrimonial y la apertura.'],
  eliminar: ['Eliminar asiento de cierre', 'trash', 'Consultá y eliminá el último cierre junto con su apertura.'],
  inflacion: ['Ajuste por inflación', 'inflation', 'Previsualizá y registrá una hoja de trabajo de ajuste por inflación.']
};

const $ = (selector, context = document) => context.querySelector(selector);
const content = $('#content');
const dialog = $('#dialog');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[c]);
const normalize = s => String(s).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
const icon = (name, extra = '') => '<svg class="icon ' + extra + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icons[name] + '</svg>';
const button = (label, name, style = '', attrs = '') =>
  '<button class="btn ' + style + '" type="button" ' + attrs + '>' + (name ? icon(name) : '') + label + '</button>';
const iconButton = (name, label, attrs = '') =>
  '<button class="icon-button" type="button" aria-label="' + label + '" title="' + label + '" ' + attrs + '>' + icon(name) + '</button>';
const heading = (key, action = '') => '<div class="page-heading"><div><span class="eyebrow">' +
  icon(pages[key][1]) + ' Contabilidad</span><h1>' + pages[key][0] + '</h1><p>' + pages[key][2] + '</p></div>' + action + '</div>';
const field = (label, input, extra = '') => '<label class="field ' + extra + '">' + label + input + '</label>';
const format = new Intl.NumberFormat('es-AR', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const money = cents => format.format(cents / 100);
const shortDate = iso => iso.split('-').reverse().join('/');
const dates = new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Argentina/Buenos_Aires'});
const today = () => dates.format(new Date());
const dateField = (label, name, date) => field(label, '<input type="date" name="' + name + '" value="' + date + '" min="1900-01-01" max="2099-12-31" required>');
const checkbox = (label, name, checked = false) => '<label><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + '> ' + label + '</label>';

let state;
let route;
let toastTimer;
let searchTerm = '';
const expanded = new Set();
const filters = {};
const account = code => state.accounts.find(item => item.code === code);
const accountLabel = code => code + ' · ' + account(code).name;
const postings = () => state.accounts.filter(item => !item.group).sort(accountOrder);
const options = (selected = [], allow = () => true) => postings().filter(allow).map(item =>
  '<option value="' + item.code + '"' + (selected.includes(item.code) ? ' selected' : '') + '>' + escape(accountLabel(item.code)) + '</option>').join('');

function notify(message, error = false) {
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 5000);
}

async function mutate(action, data) {
  const response = await fetch('/api/action', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({action, revision: state.revision, ...data})
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  state = result;
}

function handleSubmit(form, callback) {
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = form.querySelector('[type=submit]');
    if (submit?.disabled) return;
    if (submit) submit.disabled = true;
    const error = $('.error', form);
    if (error) error.textContent = '';
    try {
      await callback(new FormData(form));
    } catch (issue) {
      if (error) error.textContent = issue.message;
      else notify(issue.message, true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

function modal(title, body) {
  dialog.innerHTML = '<div class="card-head"><h2 id="dialog-title">' + title + '</h2>' +
    iconButton('x', 'Cerrar', 'id="dismiss"') + '</div><div class="pad">' + body + '</div>';
  $('#dismiss', dialog).onclick = () => dialog.close();
  if (!dialog.open) dialog.showModal();
}

function confirmAction(title, description, action, data, success) {
  modal(title, '<form><p>' + escape(description) + '</p><p class="error" role="alert"></p>' +
    '<button class="btn danger" type="submit">Confirmar eliminación</button></form>');
  handleSubmit($('form', dialog), async () => {
    await mutate(action, data);
    dialog.close();
    render();
    notify(success);
  });
}

function navLink(key) {
  return '<a class="nav-link" href="#' + key + '"' + (key === route ? ' aria-current="page"' : '') + '>' +
    icon(pages[key][1]) + (key === 'balance' ? 'Balance general' : pages[key][0]) + '</a>';
}

function render() {
  route = location.hash.slice(1);
  if (!Object.hasOwn(pages, route)) route = 'plan';
  document.title = 'Trebolium · ' + pages[route][0];
  $('#nav').innerHTML = '<div class="nav-label">ADMINISTRACIÓN</div>' +
    ['plan', 'manuales', 'modelos'].map(navLink).join('') + '<div class="nav-label">LIBROS E INFORMES</div>' +
    ['diario', 'mayor', 'balance', 'resultados'].map(navLink).join('') + '<div class="nav-label">EJERCICIO</div>' +
    ['cierre', 'eliminar', 'inflacion'].map(navLink).join('');
  $('#crumb').innerHTML = '<span class="area">Contabilidad</span>' + icon('arrow') + '<strong>' + pages[route][0] + '</strong>';
  if (route === 'plan') renderPlan();
  else if (route === 'modelos') renderModels();
  else if (route === 'cierre' || route === 'eliminar') renderClose();
  else if (route === 'inflacion') renderInflation();
  else renderReport();
}

function cardHead(name, title, subtitle) {
  return '<header class="card-head"><span class="head-icon">' + icon(name) + '</span><div><h2>' +
    title + '</h2><p>' + subtitle + '</p></div></header>';
}

function renderPlan() {
  const shortcutNames = {balance: 'Balance general', inflacion: 'Crear ajuste por inflación'};
  const tiles = ['diario', 'mayor', 'balance', 'resultados', 'manuales', 'modelos', 'cierre', 'eliminar', 'inflacion'];
  content.innerHTML = '<section class="hero"><img src="/logo.png" alt=""><span class="eyebrow">Trebolium · Los Tréboles SRL</span>' +
    '<h1>Contando cada hoja.</h1><p>Una cuenta clara nunca se deshoja.</p></section>' +
    '<div class="page-heading"><div><h2>Plan de cuentas</h2><p>' + pages.plan[2] + '</p></div>' +
    button('Nueva cuenta', 'plus', 'primary', 'id="new-account"') + '</div>' +
    '<div class="split"><section class="card">' + cardHead('folder', 'Plan de cuentas', 'Explorá la estructura de tu contabilidad') +
    '<div class="pad"><div class="tree-tools"><input type="search" id="tree-search" aria-label="Buscar cuenta" placeholder="Buscar por código o nombre…" value="' + escape(searchTerm) + '">' +
    iconButton('models', 'Expandir o contraer todos los grupos', 'id="expand-all"') + '</div><div id="tree"></div>' +
    '<div class="tree-status"><span>' + state.accounts.filter(item => !item.group).length + ' cuentas imputables</span><span>4 grupos principales</span></div></div></section>' +
    '<section class="card">' + cardHead('plan', 'Accesos directos contables', 'Libros, informes y operaciones del ejercicio') +
    '<div class="pad actions-grid">' + tiles.map(key => '<a class="shortcut ' + (key === 'eliminar' ? 'warn' : '') +
    '" href="#' + key + '"><span class="tile-icon">' + icon(pages[key][1]) + '</span><span>' + (shortcutNames[key] || pages[key][0]) + '</span></a>').join('') +
    '</div></section></div>';
  $('#new-account').onclick = () => editAccount();
  $('#tree-search').oninput = event => {
    searchTerm = event.target.value;
    drawTree();
  };
  $('#expand-all').onclick = () => {
    const groups = state.accounts.filter(item => item.group).map(item => item.code);
    if (groups.every(code => expanded.has(code))) expanded.clear();
    else groups.forEach(code => expanded.add(code));
    drawTree();
  };
  drawTree();
}

function drawTree() {
  const query = normalize(searchTerm.trim());
  const sorted = [...state.accounts].sort(accountOrder);
  const matches = sorted.filter(item => normalize(accountLabel(item.code)).includes(query));
  function branch(prefix) {
    const visible = sorted.filter(item => parent(item.code) === prefix && matches.some(match =>
      match.code === item.code || match.code.startsWith(item.code + '.')));
    return '<ul class="tree">' + visible.map(item => {
      const open = item.group && (expanded.has(item.code) || query);
      const extra = item.group ? icon('arrow', 'tree-caret ' + (open ? 'open' : '')) : '';
      return '<li><div class="tree-row ' + (prefix ? '' : 'root') + '">' +
        '<button type="button" class="tree-name" data-code="' + item.code + '"' +
        (item.group ? ' aria-expanded="' + Boolean(open) + '"' : '') + '>' +
        extra + icon(item.group ? 'folder' : 'close') + '<span class="tree-code">' + item.code + '</span>' +
        '<span>' + escape(item.name) + '</span></button><button type="button" class="tree-edit" data-edit="' + item.code +
        '" title="Editar cuenta" aria-label="Editar ' + escape(item.name) + '">' + icon('edit') + '</button></div>' +
        (open ? branch(item.code) : '') + '</li>';
    }).join('') + '</ul>';
  }
  const tree = $('#tree');
  tree.innerHTML = matches.length ? branch('') : '<p class="hint">No encontramos cuentas con esa búsqueda.</p>';
  tree.onclick = event => {
    const edit = event.target.closest('[data-edit]');
    if (edit) return editAccount(account(edit.dataset.edit));
    const name = event.target.closest('[data-code]');
    if (!name) return;
    const item = account(name.dataset.code);
    if (!item.group) {
      filters.mayor = {...reportDefaults('mayor'), codes: [item.code]};
      location.hash = 'mayor';
      return;
    }
    if (expanded.has(item.code)) expanded.delete(item.code);
    else expanded.add(item.code);
    drawTree();
    tree.querySelector('[data-code="' + item.code + '"]')?.focus();
  };
}

function editAccount(item) {
  modal(item ? 'Editar cuenta' : 'Nueva cuenta', '<form><div class="form-grid">' +
    field('Código', '<input name="code" maxlength="35" placeholder="Ej. 1.1.1.6" value="' + escape(item?.code) + '" required ' + (item ? 'readonly' : '') + '>') +
    field('Nombre', '<input name="name" maxlength="150" value="' + escape(item?.name) + '" required>') +
    (!item ? field('Tipo', '<select name="kind"><option value="account">Imputable</option><option value="group">Grupo</option></select>') : '') +
    '</div><p class="hint">Las cuentas imputables reciben movimientos. Los grupos organizan las subcuentas.</p>' +
    '<p class="error" role="alert"></p><div class="toolbar"><button class="btn primary" type="submit">Guardar cuenta</button>' +
    (item && parent(item.code) ? button('Eliminar', 'trash', 'danger', 'id="delete-account"') : '') + '</div></form>');
  const remove = $('#delete-account', dialog);
  if (remove) remove.onclick = () => confirmAction('Eliminar cuenta', 'Se eliminará ' + accountLabel(item.code) + '.',
    'delete-account', {code: item.code}, 'Cuenta eliminada.');
  handleSubmit($('form', dialog), async data => {
    const code = data.get('code').trim();
    await mutate('save-account', {code, name: data.get('name'), edit: Boolean(item), group: data.get('kind') === 'group'});
    for (let group = parent(code); group; group = parent(group)) expanded.add(group);
    searchTerm = '';
    dialog.close();
    render();
    notify('Cuenta guardada.');
  });
}


const amount = value => ({raw: money(value), numeric: true});
const safeCell = value => ({raw: value, html: value});
const typeLabels = {manual: 'Manual', inflation: 'Inflación', 'closing-result': 'Cierre de resultados',
  'closing-assets': 'Cierre patrimonial', opening: 'Apertura'};
function table(headers, rows) {
  return '<div class="table-scroll"><table><thead><tr>' + headers.map(title => '<th scope="col">' + title + '</th>').join('') +
    '</tr></thead><tbody>' + (rows.length ? rows.map(row =>
      '<tr' + (row[0] === 'Total' ? ' class="total"' : '') + '>' + row.map(cell =>
        '<td' + (cell?.numeric ? ' class="num"' : '') + '>' + (cell?.html ?? escape(cell?.raw ?? cell)) + '</td>').join('') +
      '</tr>').join('') : '<tr><td class="empty" colspan="' + headers.length + '">No se han encontrado resultados.</td></tr>') +
    '</tbody></table></div>';
}

function downloadCsv(name, headers, rows) {
  const quote = cell => {
    let value = String(cell?.raw ?? cell ?? '');
    if (!cell?.numeric && /^[\s]*[=+@-]|^[\t\r\n]/.test(value)) value = "'" + value;
    return '"' + value.replaceAll('"', '""') + '"';
  };
  const csv = '\uFEFF' + [headers, ...rows].map(row => row.map(quote).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
  const link = Object.assign(document.createElement('a'), {href: url, download: 'trebolium-' + name + '.csv'});
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function reportDefaults(key) {
  const date = today();
  const earliest = state.entries.map(entry => entry.date).sort()[0];
  return {from: earliest && earliest < date ? earliest : date.slice(0, 8) + '01',
    to: date, onlyManual: false, inflation: true, opening: false, zero: false, view: 'classic', memo: '', codes: []};
}

function reportData(key, f) {
  const all = [...state.entries].sort(order).filter(entry => !f.onlyManual || entry.type === 'manual');
  const range = all.filter(entry => entry.date >= f.from && entry.date <= f.to);
  if (key === 'diario' || key === 'manuales') {
    const manual = key === 'manuales';
    const entries = manual ? range.filter(entry => ['manual', 'inflation'].includes(entry.type) &&
      normalize(entry.memo).includes(normalize(f.memo))) : range;
    const headers = ['N.º asiento', 'Fecha', 'Leyenda', 'Código', 'Cuenta contable', 'Débito', 'Crédito', 'Tipo'];
    const rows = entries.flatMap(entry => entry.lines.map(line => [entry.id, shortDate(entry.date), entry.memo,
      line.code, account(line.code).name, amount(line.debit), amount(line.credit), typeLabels[entry.type]]));
    return {headers, rows};
  }

  if (key === 'mayor') {
    const starting = balances(all.filter(entry => entry.date < f.from));
    const lines = new Map();
    for (const entry of range) {
      for (const line of entry.lines) {
        if (!lines.has(line.code)) lines.set(line.code, []);
        lines.get(line.code).push({entry, line});
      }
    }
    const codes = postings().filter(item => f.codes.length ? f.codes.includes(item.code) :
      lines.has(item.code) || (starting.has(item.code) && net(starting.get(item.code))));
    const rows = codes.flatMap(({code, name}) => {
      let current = starting.has(code) ? net(starting.get(code)) : 0;
      if (!lines.has(code)) return [[code, name, '', '', 'Saldo anterior', amount(current), amount(0), amount(0), amount(current)]];
      return lines.get(code).map(({entry, line}) => {
        const previous = current;
        current += net(line);
        return [code, name, shortDate(entry.date), entry.id, entry.memo, amount(previous),
          amount(line.debit), amount(line.credit), amount(current)];
      });
    });
    return {headers: ['Código', 'Cuenta', 'Fecha', 'N.º asiento', 'Detalle', 'Saldo anterior', 'Débito', 'Crédito', 'Saldo'], rows};
  }

  if (key === 'balance') {
    const included = all.filter(entry => f.inflation || entry.type !== 'inflation');
    const before = balances(included.filter(entry => entry.date < f.from));
    const during = balances(included.filter(entry => entry.date >= f.from && entry.date <= f.to));
    const opening = balances(range.filter(entry => entry.type === 'opening'));
    const stats = postings().map(({code, name}) => {
      const initial = before.has(code) ? net(before.get(code)) : 0;
      const {debit, credit} = during.get(code) || {debit: 0, credit: 0};
      return {code, name, initial, debit, credit, opening: opening.has(code) ? net(opening.get(code)) : 0,
        final: initial + debit - credit};
    });
    const visible = f.view === 'grouped' ? ['1', '2', '3', '4'].map(code => ({
      ...addStats(stats.filter(item => item.code.startsWith(code + '.'))), code, name: account(code).name
    })) : stats;
    const cell = item => [amount(item.initial), ...(f.opening ? [amount(item.opening)] : []),
      amount(item.debit), amount(item.credit), amount(item.final)];
    const rows = visible.filter(item => f.zero || item.initial || item.debit || item.credit).map(item => [item.code, item.name, ...cell(item)]);
    if (rows.length) rows.push(['Total', '', ...cell(addStats(stats))]);
    return {headers: ['Código', 'Cuenta', 'Saldo inicial', ...(f.opening ? ['Apertura (incluida en los movimientos)'] : []),
      'Débito', 'Crédito', 'Saldo final'], rows};
  }

  const period = balances(range.filter(entry => !entry.closeDate));
  const result = postings().filter(item => item.code.startsWith('4.') && period.has(item.code)).map(item => ({
    ...item, value: -net(period.get(item.code))
  }));
  const income = result.filter(item => item.code.startsWith('4.1.'));
  const expense = result.filter(item => item.code.startsWith('4.2.'));
  const other = result.filter(item => !income.includes(item) && !expense.includes(item));
  const total = values => values.reduce((acc, item) => acc + item.value, 0);
  const row = (item, group) => [item.code, item.name, group, amount(item.value)];
  const rows = [
    ...income.map(item => row(item, 'Ingresos')), ...expense.map(item => row(item, 'Egresos')),
    ...other.map(item => row(item, 'Otros resultados'))
  ];
  if (rows.length) rows.push(['Total', 'Resultado del período', '', amount(total(result))]);
  return {headers: ['Código', 'Cuenta', 'Rubro', 'Importe neto'], rows};
}

function addStats(items) {
  const total = {initial: 0, debit: 0, credit: 0, opening: 0, final: 0};
  for (const item of items) for (const key of Object.keys(total)) total[key] += item[key];
  return total;
}

function renderReport() {
  const key = route;
  const f = filters[key] || reportDefaults(key);
  const manual = key === 'manuales';
  const dateControls = dateField('Fecha desde', 'from', f.from) + dateField('Fecha hasta', 'to', f.to);
  const balanceChecks = key === 'balance' ? '<div class="checks wide">' +
    checkbox('Mostrar cuentas sin movimientos ni saldo inicial', 'zero', f.zero) +
    checkbox('Incluir asientos de ajuste por inflación', 'inflation', f.inflation) +
    checkbox('Desglosar asientos de apertura', 'opening', f.opening) + '</div>' : '';
  content.innerHTML = heading(key) + '<section class="card pad"><form id="report-form"><div class="controls">' +
    balanceChecks + (manual ? field('Leyenda del asiento', '<input type="search" name="memo" placeholder="Ingresá la leyenda" value="' + escape(f.memo) + '">') : '') +
    dateControls + (['diario', 'mayor'].includes(key) ? '<div class="checks">' + checkbox('Solo asientos manuales', 'onlyManual', f.onlyManual) + '</div>' : '') +
    (key === 'balance' ? field('Vista', '<select name="view"><option value="classic">Vista clásica</option><option value="grouped"' +
      (f.view === 'grouped' ? ' selected' : '') + '>Por grupo principal</option></select>') : '') +
    (key === 'mayor' ? field('Cuentas', '<select name="codes" multiple size="4">' + options(f.codes) +
      '</select><span class="hint">Sin selección se muestran todas las cuentas con movimientos o saldo. Usá Ctrl para elegir varias.</span>', 'wide') : '') +
    '</div><div class="toolbar"><button class="btn primary" type="submit">' + icon('search') + ' Buscar</button>' +
    (manual ? button('Nuevo asiento manual', 'plus', '', 'id="new-entry"') : '') +
    button('Exportar CSV', 'download', '', 'id="report-export"') + '<span class="hint end">Importes en ARS</span></div>' +
    '<p class="error" role="alert"></p></form><div id="report-output"></div></section>';
  const result = reportData(key, f);
  const {headers, rows} = result;
  if (manual) {
    const entries = state.entries.filter(entry => ['manual', 'inflation'].includes(entry.type) && entry.date >= f.from &&
      entry.date <= f.to && normalize(entry.memo).includes(normalize(f.memo))).sort(order);
    const rowsWithActions = [];
    let offset = 0;
    for (const entry of entries) {
      entry.lines.forEach((line, i) => {
        const actions = i ? '' : (entry.type === 'manual' ? iconButton('edit', 'Editar asiento ' + entry.id, 'data-entry="' + entry.id + '"') : '') +
          ' ' + iconButton('trash', 'Eliminar asiento ' + entry.id, 'data-remove-entry="' + entry.id + '"');
        rowsWithActions.push([...rows[offset++], safeCell(actions)]);
      });
    }
    $('#report-output').innerHTML = table([...headers, 'Acciones'], rowsWithActions);
    $('#report-output').onclick = event => {
      const edit = event.target.closest('[data-entry]');
      const remove = event.target.closest('[data-remove-entry]');
      if (edit) editEntry(state.entries.find(entry => entry.id === Number(edit.dataset.entry)));
      if (remove) {
        const id = Number(remove.dataset.removeEntry);
        confirmAction('Eliminar asiento', 'Se eliminará el asiento n.º ' + id + ' de los libros e informes.',
          'delete-entry', {id}, 'Asiento eliminado.');
      }
    };
    $('#new-entry').onclick = () => editEntry();
  } else {
    $('#report-output').innerHTML = table(headers, rows);
  }
  $('#report-export').onclick = () => downloadCsv(key, headers, rows);
  handleSubmit($('#report-form'), data => {
    if (data.get('from') > data.get('to')) throw new Error('La fecha desde debe ser anterior o igual a la fecha hasta.');
    filters[key] = {
      from: data.get('from'), to: data.get('to'), onlyManual: data.has('onlyManual'),
      zero: data.has('zero'), inflation: data.has('inflation'), opening: data.has('opening'),
      view: data.get('view'), memo: (data.get('memo') || '').trim(), codes: data.getAll('codes')
    };
    render();
  });
}

function renderModels() {
  const memo = filters.modelos?.memo || '';
  const matching = state.models.filter(model => normalize(model.memo).includes(normalize(memo)));
  const rows = matching.map(model => [model.memo, model.lines.length, safeCell(
    button('Usar modelo', 'plus', '', 'data-use="' + model.id + '"') + ' ' +
    iconButton('edit', 'Editar modelo', 'data-model="' + model.id + '"') + ' ' +
    iconButton('trash', 'Eliminar modelo', 'data-remove-model="' + model.id + '"')
  )]);
  content.innerHTML = heading('modelos') + '<section class="card pad"><form id="model-search"><div class="controls">' +
    field('Leyenda del asiento modelo', '<input name="memo" type="search" placeholder="Ingresá la leyenda" value="' + escape(memo) + '">') +
    '</div><div class="toolbar"><button type="submit" class="btn primary">' + icon('search') + ' Buscar</button>' +
    button('Nuevo asiento modelo', 'plus', '', 'id="new-model"') + '</div></form><div id="models-list">' +
    table(['Leyenda', 'Líneas', 'Acciones'], rows) + '</div></section>';
  handleSubmit($('#model-search'), data => {
    filters.modelos = {memo: data.get('memo').trim()};
    render();
  });
  $('#new-model').onclick = () => editEntry(undefined, true);
  $('#models-list').onclick = event => {
    const action = event.target.closest('[data-use],[data-model],[data-remove-model]');
    if (!action) return;
    const {use, model, removeModel} = action.dataset;
    const item = state.models.find(item => item.id === Number(use || model || removeModel));
    if (use) editEntry(undefined, false, item);
    if (model) editEntry(item, true);
    if (removeModel) confirmAction('Eliminar asiento modelo', 'Se eliminará el modelo «' + item.memo + '».',
      'delete-model', {id: item.id}, 'Modelo eliminado.');
  };
}

function lineMarkup(line = {}, adjustment = false) {
  const currency = (label, name) => '<input name="' + name + '" type="text" inputmode="decimal" maxlength="15" aria-label="' + label + '" placeholder="0,00" value="' +
    (line[name] ? (line[name] / 100).toFixed(2).replace('.', ',') : '') + '">';
  return '<div class="entry-line"><select name="code" aria-label="Cuenta contable"><option value="">Seleccioná una cuenta</option>' +
    options([line.code], account => !adjustment || account.code !== '1.1.4.1') + '</select>' +
    currency('Debe', 'debit') + currency('Haber', 'credit') + iconButton('x', 'Quitar línea', 'data-remove-line') + '</div>';
}

function parseMoney(value) {
  const normalized = value.trim();
  if (!normalized) return 0;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) return NaN;
  const [whole, fraction = ''] = normalized.split(/[.,]/);
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 1e12 ? cents : NaN;
}

function readLines(form) {
  return Array.from(form.querySelectorAll('.entry-line select'), select => {
    const row = select.closest('.entry-line');
    const debit = $('[name=debit]', row).value;
    const credit = $('[name=credit]', row).value;
    return {code: select.value, debit: parseMoney(debit), credit: parseMoney(credit),
      used: Boolean(select.value || debit.trim() || credit.trim())};
  }).filter(line => line.used).map(({code, debit, credit}) => ({code, debit, credit}));
}

function validateLines(form) {
  const lines = readLines(form);
  if (lines.length < 2 || lines.some(line => !line.code || !Number.isFinite(line.debit) ||
    !Number.isFinite(line.credit) || Boolean(line.debit) === Boolean(line.credit))) {
    throw new Error('Completá al menos dos líneas. Cada una debe tener cuenta y un importe positivo en Debe o Haber, con hasta dos decimales.');
  }
  const total = sum(lines);
  if (total.debit !== total.credit) throw new Error('El total del Debe debe coincidir con el total del Haber.');
  return lines;
}

function lineEditor(lines, adjustment = false) {
  return '<div class="entry-lines"><div class="entry-line line-head"><span>Cuenta</span><span>Debe</span><span>Haber</span><span></span></div>' +
    '<div class="line-items">' + (lines.length ? lines : [{}, {}]).map(line => lineMarkup(line, adjustment)).join('') + '</div></div>' +
    '<div class="toolbar">' + button('Agregar línea', 'plus', '', 'data-add-line') + '<span class="hint end" data-totals></span></div>';
}

function wireLines(form, adjustment = false) {
  const list = $('.line-items', form);
  const totals = $('[data-totals]', form);
  function update() {
    const {debit, credit} = sum(readLines(form));
    totals.textContent = Number.isFinite(debit + credit) ? 'Debe $ ' + money(debit) + ' · Haber $ ' + money(credit) : 'Revisá los importes ingresados.';
  }
  form.addEventListener('input', update);
  $('[data-add-line]', form).onclick = () => {
    if (list.childElementCount >= 200) return notify('Podés agregar hasta 200 líneas.', true);
    list.insertAdjacentHTML('beforeend', lineMarkup({}, adjustment));
    list.lastElementChild.querySelector('select').focus();
  };
  list.onclick = event => {
    const remove = event.target.closest('[data-remove-line]');
    if (!remove) return;
    remove.closest('.entry-line').remove();
    update();
  };
  update();
}

function editEntry(entry, model = false, template) {
  const initial = entry || template;
  const title = (entry ? 'Editar asiento ' : 'Nuevo asiento ') + (model ? 'modelo' : 'manual');
  modal(title, '<form><div class="form-grid">' + field('Leyenda', '<input name="memo" required maxlength="150" value="' + escape(initial?.memo) + '">', model ? 'wide' : '') +
    (!model ? dateField('Fecha', 'date', entry?.date || today()) : '') + '</div>' +
    lineEditor(initial?.lines || []) + (!model ? field('Observaciones', '<textarea name="notes" maxlength="2000">' + escape(entry?.notes) + '</textarea>') : '') +
    '<p class="error" role="alert"></p><div class="toolbar"><button class="btn primary" type="submit">Guardar ' +
    (model ? 'modelo' : 'asiento') + '</button></div></form>');
  const form = $('form', dialog);
  wireLines(form);
  handleSubmit(form, async data => {
    const lines = validateLines(form);
    await mutate(model ? 'save-model' : 'save-entry', {
      id: entry?.id, memo: data.get('memo'), date: data.get('date'), notes: data.get('notes'), lines
    });
    dialog.close();
    if (!model) {
      const date = data.get('date');
      filters.manuales = {...reportDefaults('manuales'), from: date, to: date};
      if (route !== 'manuales') location.hash = 'manuales';
    }
    render();
    notify(model ? 'Modelo guardado.' : 'Asiento guardado.');
  });
}


function lineSummary(lines) {
  const total = sum(lines);
  return [...lines.map(line => [accountLabel(line.code), amount(line.debit), amount(line.credit)]),
    ['Total', amount(total.debit), amount(total.credit)]];
}
const lineHeaders = ['Cuenta', 'Debe', 'Haber'];

function closeSummary(entries) {
  return entries.map(entry => '<section class="card pad stacked"><h2>' + escape(entry.memo) +
    '</h2><p class="hint">' + shortDate(entry.date) + (entry.id ? ' · Asiento n.º ' + entry.id : '') +
    '</p>' + table(lineHeaders, lineSummary(entry.lines)) + '</section>').join('');
}

function renderClose() {
  const closeDate = state.entries.filter(entry => entry.closeDate).map(entry => entry.closeDate).sort().at(-1);
  if (route === 'eliminar') {
    content.innerHTML = heading(route) + '<section class="card pad">' +
      (closeDate ? '<p>Último cierre registrado el <strong>' + shortDate(closeDate) + '</strong>.</p>' +
        button('Eliminar cierre y apertura', 'trash', 'danger', 'id="remove-close"') : '<p class="muted">Todavía no hay cierres registrados.</p>') +
      '</section>' + (closeDate ? closeSummary(state.entries.filter(entry => entry.closeDate === closeDate).sort(order)) : '');
    const remove = $('#remove-close');
    if (remove) remove.onclick = () => confirmAction('Eliminar cierre y apertura',
      'Se eliminarán los asientos generados el ' + shortDate(closeDate) + ' y su apertura. Se habilitará nuevamente el período.',
      'delete-close', {date: closeDate}, 'Cierre y apertura eliminados.');
    return;
  }
  content.innerHTML = heading(route) + '<section class="card pad"><p class="notice">Al confirmar se bloquea la edición de los asientos con fecha igual o anterior al cierre. La apertura se genera al día siguiente.</p>' +
    '<form id="close-form"><div class="controls">' + dateField('Fecha de cierre', 'date', today()) +
    field('Cuenta de resultado del ejercicio', '<select name="resultCode" required><option value="">Seleccioná una cuenta</option>' +
      options(['3.4'], item => item.code.startsWith('3.')) + '</select>') +
    '</div><div class="toolbar"><button type="submit" class="btn primary">Previsualizar</button></div><p class="error" role="alert"></p></form></section><div id="close-preview"></div>';
  const form = $('#close-form');
  const preview = $('#close-preview');
  form.addEventListener('input', () => { preview.innerHTML = ''; });
  handleSubmit(form, data => {
    const date = data.get('date');
    const resultCode = data.get('resultCode');
    if (closeDate && date <= closeDate) throw new Error('La fecha debe ser posterior al último cierre.');
    if (date >= '2099-12-31') throw new Error('La fecha de apertura debe ser anterior a 2100.');
    const entries = closingEntries(state.entries, date, resultCode);
    if (!entries.length) throw new Error('No hay saldos para cerrar a la fecha elegida.');
    preview.innerHTML = closeSummary(entries) + '<form class="card pad stacked"><p class="error" role="alert"></p>' +
      '<button type="submit" class="btn primary">Confirmar cierre y apertura</button></form>';
    handleSubmit($('form', preview), async () => {
      await mutate('create-close', {date, resultCode});
      location.hash = 'eliminar';
      notify('Cierre y apertura registrados.');
    });
  });
}

function indexDialog() {
  modal('Historial de índices', '<p class="hint">Registro de referencia con los valores que cargues. La hoja de trabajo del ajuste se prepara por separado.</p>' +
    '<form><div class="form-grid">' + field('Mes', '<input type="month" name="month" value="' + today().slice(0, 7) + '" required>') +
    field('Índice', '<input name="value" type="text" inputmode="decimal" placeholder="Ej. 123,456" required>') +
    '</div><div class="toolbar"><button type="submit" class="btn primary">Guardar índice</button></div><p class="error" role="alert"></p></form>' +
    table(['Mes', 'Índice registrado'], state.indices.map(item => [item.month.split('-').reverse().join('/'),
      item.value.toLocaleString('es-AR', {maximumFractionDigits: 8})])));
  handleSubmit($('form', dialog), async data => {
    const text = data.get('value').trim();
    if (!/^\d+(?:[.,]\d+)?$/.test(text)) throw new Error('Ingresá el índice como un número decimal.');
    await mutate('save-index', {month: data.get('month'), value: Number(text.replace(',', '.'))});
    indexDialog();
    notify('Índice guardado.');
  });
}

function renderInflation() {
  content.innerHTML = heading(route) + '<section class="card pad"><p class="notice"><strong>Consideraciones.</strong> Ingresá los importes de una hoja de trabajo ya calculada. El historial sirve para registrar los índices usados. Cargá el ajuste de Mercaderías por separado desde Asientos manuales.</p>' +
    '<form id="inflation-form"><div class="form-grid">' +
    field('Leyenda', '<input name="memo" value="Ajuste por inflación" maxlength="150" required>') +
    dateField('Fecha', 'date', today()) +
    field('N.º de asiento manual de apertura (opcional)', '<input type="number" name="openingId" min="1" step="1">') +
    '</div><h2>Hoja de trabajo</h2>' + lineEditor([], true) +
    field('Observaciones', '<textarea name="notes" maxlength="2000" placeholder="Criterios, índices o referencia de la hoja de trabajo"></textarea>') +
    '<div class="toolbar"><button class="btn primary" type="submit">Previsualizar</button>' +
    button('Ver historial de índices', 'clock', '', 'id="indices"') + '</div><p class="error" role="alert"></p>' +
    '</form></section><div id="inflation-preview"></div>';
  const form = $('#inflation-form');
  const preview = $('#inflation-preview');
  wireLines(form, true);
  $('#indices').onclick = indexDialog;
  function invalidate() { preview.innerHTML = ''; }
  form.addEventListener('input', invalidate);
  form.addEventListener('click', event => {
    if (event.target.closest('[data-add-line],[data-remove-line]')) invalidate();
  });
  handleSubmit(form, data => {
    const lines = validateLines(form);
    const payload = {memo: data.get('memo'), date: data.get('date'), openingId: Number(data.get('openingId')),
      notes: data.get('notes'), lines, adjustment: true};
    const rows = lineSummary(lines);
    preview.innerHTML = '<section class="card pad stacked"><h2>Previsualización del ajuste</h2><p class="hint">' +
      escape(payload.memo) + ' · ' + shortDate(payload.date) + '</p>' + table(lineHeaders, rows) +
      '<form><div class="toolbar"><button class="btn primary" type="submit">Registrar ajuste</button>' +
      button('Exportar hoja CSV', 'download', '', 'id="adjustment-export"') + '</div><p class="error" role="alert"></p></form></section>';
    $('#adjustment-export').onclick = () => downloadCsv('ajuste-' + payload.date, lineHeaders, rows);
    handleSubmit($('form', preview), async () => {
      await mutate('save-entry', payload);
      filters.manuales = {...reportDefaults('manuales'), from: payload.date, to: payload.date};
      location.hash = 'manuales';
      notify('Ajuste registrado.');
    });
    preview.scrollIntoView({block: 'nearest'});
  });
}

function setupShell() {
  const search = $('#global');
  const suggestions = $('#suggestions');
  $('#search-label').setAttribute('aria-label', 'Buscar una sección');
  $('#search-label').innerHTML = icon('search');
  search.setAttribute('aria-label', 'Buscar una sección');
  function fillSuggestions() {
    const query = normalize(search.value.trim());
    const matched = Object.keys(pages).filter(key => normalize(pages[key][0]).includes(query));
    suggestions.innerHTML = matched.length ? matched.map(key =>
      '<a href="#' + key + '">' + icon(pages[key][1]) + ' ' + pages[key][0] + '</a>').join('') :
      '<p>No encontramos secciones.</p>';
    suggestions.hidden = false;
  }
  search.addEventListener('input', fillSuggestions);
  search.addEventListener('focus', fillSuggestions);
  search.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      $('a', suggestions)?.click();
    }
    if (event.key === 'Escape') suggestions.hidden = true;
  });
  suggestions.onclick = event => {
    if (event.target.closest('a')) {
      suggestions.hidden = true;
      search.value = '';
      search.blur();
    }
  };
  document.addEventListener('click', event => {
    if (!event.target.closest('.global-search')) suggestions.hidden = true;
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !dialog.open && !event.target.closest('input, textarea, select, [contenteditable]')) {
      event.preventDefault();
      search.focus();
    }
  });
  const menu = $('#menu');
  menu.innerHTML = icon('menu');
  function setMenu(open) {
    document.body.classList.toggle('menu-open', open);
    menu.setAttribute('aria-expanded', String(open));
  }
  menu.onclick = () => setMenu(!document.body.classList.contains('menu-open'));
  $('#nav').onclick = event => {
    if (event.target.closest('a')) setMenu(false);
  };
  window.addEventListener('hashchange', () => {
    setMenu(false);
    render();
    window.scrollTo(0, 0);
  });
}

try {
  const response = await fetch('/api/state');
  if (!response.ok) throw new Error('No se pudo conectar con Trebolium.');
  state = await response.json();
  setupShell();
  render();
} catch (issue) {
  content.textContent = issue.message;
}
