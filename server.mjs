import http from 'node:http';
import {mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chart} from './chart.mjs';
import {closingEntries, parent, sum} from './ledger.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const dataDir = join(root, 'data');
const dataFile = join(dataDir, 'trebolium.json');
const host = '127.0.0.1';
const port = Number(process.env.TREBOLIUM_PORT || 4173);
let state;
try {
  state = JSON.parse(readFileSync(dataFile, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
  state = {accounts: chart, entries: [], models: [], indices: [], revision: 0, nextId: 1};
}

class InputError extends Error {}
function requireInput(condition, message) {
  if (!condition) throw new InputError(message);
}

function cleanText(value, label, max = 150) {
  const result = typeof value === 'string' ? value.trim() : '';
  requireInput(result.length > 0 && result.length <= max, label + ' debe tener entre 1 y ' + max + ' caracteres.');
  return result;
}

function validDate(value) {
  return typeof value === 'string' && /^(19|20)\d{2}-\d\d-\d\d$/.test(value) &&
    new Date(value).toJSON()?.slice(0, 10) === value;
}

function getPosting(db, code) {
  const account = db.accounts.find(account => account.code === code);
  requireInput(account && !account.group, 'Seleccioná una cuenta imputable válida.');
  return account;
}

function checkLines(db, lines, adjustment = false) {
  requireInput(Array.isArray(lines) && lines.length >= 2 && lines.length <= 200, 'Agregá entre 2 y 200 líneas.');
  requireInput(lines.every(line => line && typeof line === 'object'), 'Hay líneas con datos inválidos.');
  const cleaned = lines.map(({code, debit, credit}) => {
    getPosting(db, code);
    requireInput(!adjustment || code !== '1.1.4.1', 'Registrá el ajuste de Mercaderías desde Asientos manuales.');
    requireInput([debit, credit].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 1e12) &&
      Boolean(debit) !== Boolean(credit), 'Cada línea debe tener un importe positivo en Debe o Haber.');
    return {code, debit, credit};
  });
  const totals = sum(cleaned);
  requireInput(totals.debit === totals.credit, 'El total del Debe debe coincidir con el total del Haber.');
  return cleaned;
}

function lastClose(db) {
  return db.entries.filter(entry => entry.closeDate).map(entry => entry.closeDate).sort().at(-1);
}

function checkEntryDate(db, date) {
  requireInput(validDate(date), 'Ingresá una fecha válida entre 1900 y 2099.');
  const closed = lastClose(db);
  requireInput(!closed || date > closed, 'La fecha pertenece a un período cerrado.');
}

function note(value) {
  requireInput(typeof value === 'string' && value.length <= 2000, 'Las observaciones admiten hasta 2000 caracteres.');
  return value.trim();
}

const actions = {
  'save-account'(db, body) {
    const code = cleanText(body.code, 'El código', 35);
    const name = cleanText(body.name, 'El nombre');
    requireInput(/^([1-4])(?:\.[1-9]\d*){0,7}$/.test(code), 'Usá un código jerárquico, por ejemplo 1.1.1.6.');
    const current = db.accounts.find(account => account.code === code);
    if (body.edit) {
      requireInput(current, 'La cuenta ya no existe.');
      current.name = name;
      return;
    }
    requireInput(!current, 'Ese código ya existe.');
    requireInput(db.accounts.some(account => account.code === parent(code) && account.group),
      'El código debe pertenecer a un grupo existente.');
    db.accounts.push({code, name, group: body.group === true});
  },
  'delete-account'(db, {code}) {
    requireInput(typeof code === 'string' && parent(code), 'Los grupos principales son obligatorios.');
    requireInput(!db.accounts.some(account => parent(account.code) === code), 'El grupo tiene subcuentas.');
    requireInput(![...db.entries, ...db.models].some(entry => entry.lines.some(line => line.code === code)),
      'La cuenta se usa en un asiento o modelo.');
    db.accounts = db.accounts.filter(account => account.code !== code);
  },
  'save-entry'(db, body) {
    const type = body.adjustment ? 'inflation' : 'manual';
    checkEntryDate(db, body.date);
    if (body.adjustment && body.openingId) {
      requireInput(db.entries.some(entry => entry.id === body.openingId && entry.type === 'manual' && entry.date <= body.date),
        'El número de apertura debe corresponder a un asiento manual con fecha anterior o igual.');
    }
    const fields = {
      date: body.date, memo: cleanText(body.memo, 'La leyenda'), type,
      notes: note(body.notes), lines: checkLines(db, body.lines, body.adjustment),
      ...(body.adjustment ? {openingId: body.openingId || null} : {})
    };
    if (body.id) {
      const current = db.entries.find(entry => entry.id === body.id && entry.type === 'manual');
      requireInput(current && type === 'manual', 'Solo se pueden editar asientos manuales.');
      checkEntryDate(db, current.date);
      requireInput(!db.entries.some(entry => entry.openingId === current.id && entry.date < fields.date),
        'La fecha de apertura debe ser anterior o igual al ajuste que usa este asiento.');
      Object.assign(current, fields);
      return;
    }
    db.entries.push({id: db.nextId++, ...fields});
  },
  'delete-entry'(db, {id}) {
    const entry = db.entries.find(entry => entry.id === id && ['manual', 'inflation'].includes(entry.type));
    requireInput(entry, 'El asiento ya no existe o pertenece a un cierre.');
    checkEntryDate(db, entry.date);
    requireInput(!db.entries.some(other => other.openingId === id), 'Un ajuste por inflación referencia este asiento.');
    db.entries = db.entries.filter(entry => entry.id !== id);
  },
  'save-model'(db, body) {
    const memo = cleanText(body.memo, 'La leyenda');
    const lines = checkLines(db, body.lines);
    if (body.id) {
      const model = db.models.find(model => model.id === body.id);
      requireInput(model, 'El modelo ya no existe.');
      Object.assign(model, {memo, lines});
      return;
    }
    db.models.push({id: db.nextId++, memo, lines});
  },
  'delete-model'(db, {id}) {
    db.models = db.models.filter(model => model.id !== id);
  },
  'save-index'(db, {month, value}) {
    requireInput(typeof month === 'string' && validDate(month + '-01'), 'Ingresá un mes válido.');
    requireInput(Number.isFinite(value) && value > 0, 'Ingresá un índice mayor a cero.');
    db.indices = [...db.indices.filter(index => index.month !== month), {month, value}].sort((a,b) => b.month.localeCompare(a.month));
  },
  'create-close'(db, {date, resultCode}) {
    checkEntryDate(db, date);
    requireInput(date < '2099-12-31', 'La fecha de apertura debe ser anterior a 2100.');
    requireInput(typeof resultCode === 'string' && resultCode.startsWith('3.'), 'Elegí una cuenta de Patrimonio neto.');
    getPosting(db, resultCode);
    const generated = closingEntries(db.entries, date, resultCode);
    requireInput(generated.length, 'No hay saldos para cerrar a la fecha elegida.');
    for (const entry of generated) {
      db.entries.push({...entry, id: db.nextId++, notes: '', closeDate: date});
    }
  },
  'delete-close'(db, {date}) {
    requireInput(date && date === lastClose(db), 'Solo se puede eliminar el último cierre.');
    db.entries = db.entries.filter(entry => entry.closeDate !== date);
  }
};

const staticFiles = new Map([
  ['/', ['public/index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['public/styles.css', 'text/css; charset=utf-8']],
  ['/app.js', ['public/app.js', 'text/javascript; charset=utf-8']],
  ['/ledger.mjs', ['ledger.mjs', 'text/javascript; charset=utf-8']],
  ['/logo.png', ['public/logo.png', 'image/png']]
]);

function json(response, code, body) {
  response.writeHead(code, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 262144) throw new InputError('La solicitud supera el límite permitido.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new InputError('La solicitud no contiene datos válidos.');
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const allowedHosts = [host + ':' + port, 'localhost:' + port];
    if (!allowedHosts.includes(request.headers.host)) return json(response, 403, {error: 'Usá la dirección local de Trebolium.'});
    const url = new URL(request.url, 'http://' + request.headers.host);
    if (request.method === 'GET' && url.pathname === '/api/state') return json(response, 200, state);
    if (request.method === 'POST' && url.pathname === '/api/action') {
      if (request.headers.origin && request.headers.origin !== url.origin) {
        return json(response, 403, {error: 'Origen inválido.'});
      }
      requireInput(request.headers['content-type'] === 'application/json', 'Formato inválido.');
      const body = await readBody(request);
      requireInput(body && Object.hasOwn(actions, body.action), 'Acción desconocida.');
      if (body.revision !== state.revision) {
        return json(response, 409, {error: 'Los datos cambiaron. Recargá la página antes de reintentar.'});
      }
      const updated = structuredClone(state);
      actions[body.action](updated, body);
      updated.revision++;
      mkdirSync(dataDir, {recursive: true});
      writeFileSync(dataFile + '.tmp', JSON.stringify(updated, null, 2), 'utf8');
      renameSync(dataFile + '.tmp', dataFile);
      state = updated;
      return json(response, 200, state);
    }
    const file = staticFiles.get(url.pathname);
    if (request.method !== 'GET' || !file) return json(response, 404, {error: 'Página no encontrada.'});
    response.writeHead(200, {
      'Content-Type': file[1], 'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'self'; base-uri 'none'; frame-ancestors 'none'"
    });
    response.end(readFileSync(join(root, file[0])));
  } catch (error) {
    if (error instanceof InputError) return json(response, 400, {error: error.message});
    console.error(error);
    if (!response.headersSent) json(response, 500, {error: 'No se pudo completar la operación.'});
    else response.end();
  }
});

server.listen(port, host, () => console.log('Trebolium disponible en http://' + host + ':' + port));
