import {createHash, randomBytes, scrypt, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {chart} from './chart.mjs';

const derive = promisify(scrypt);
const cookieName = 'trebolium_pilot';
const sessionSeconds = 8 * 60 * 60;
const roles = ['consulta', 'operador', 'administrador'];
const closeActions = new Set(['create-close', 'delete-close']);
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;
const token = () => randomBytes(32).toString('base64url');
const digest = value => createHash('sha256').update(value).digest('hex');

export class PilotError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function emailOf(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new PilotError(400, 'Ingresá un correo válido.');
  }
  return email;
}

function passwordOf(value, minimum) {
  if (typeof value !== 'string' || value.length < minimum || Buffer.byteLength(value) > 256) {
    throw new PilotError(400, 'La contraseña debe tener entre 12 y 256 bytes.');
  }
  return value;
}

function requireAdmin(user) {
  if (user.role !== 'administrador') throw new PilotError(403, 'Esta operación requiere el rol Administrador.');
}

function changesBetween(before, after) {
  const changes = {};
  const keys = {accounts: 'code', entries: 'id', models: 'id', indices: 'month'};
  for (const [collection, field] of Object.entries(keys)) {
    const oldRows = new Map(before[collection].map(row => [row[field], row]));
    const newRows = new Map(after[collection].map(row => [row[field], row]));
    const changesInCollection = [];
    for (const key of new Set([...oldRows.keys(), ...newRows.keys()])) {
      const previous = oldRows.get(key) || null;
      const current = newRows.get(key) || null;
      if (JSON.stringify(previous) !== JSON.stringify(current)) {
        changesInCollection.push({key, before: previous, after: current});
      }
    }
    if (changesInCollection.length) changes[collection] = changesInCollection;
  }
  return changes;
}

const schema = `
  CREATE TABLE IF NOT EXISTS trebolium_ledger (
    id integer PRIMARY KEY CHECK (id = 1),
    state jsonb NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trebolium_users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email text UNIQUE NOT NULL,
    role text NOT NULL CHECK (role IN ('consulta', 'operador', 'administrador')),
    password_hash text NOT NULL,
    salt text NOT NULL,
    active boolean NOT NULL DEFAULT true
  );
  CREATE TABLE IF NOT EXISTS trebolium_invites (
    email text PRIMARY KEY,
    role text NOT NULL CHECK (role IN ('consulta', 'operador', 'administrador')),
    token_hash text UNIQUE NOT NULL,
    expires_at timestamptz NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trebolium_sessions (
    token_hash text PRIMARY KEY,
    user_id bigint NOT NULL REFERENCES trebolium_users(id),
    expires_at timestamptz NOT NULL
  );
  CREATE INDEX IF NOT EXISTS trebolium_sessions_user ON trebolium_sessions(user_id);
  CREATE TABLE IF NOT EXISTS trebolium_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actor text NOT NULL,
    action text NOT NULL,
    details jsonb NOT NULL
  );
`;

export async function createPilot(pool, {secure, bootstrapEmail, bootstrapToken}) {
  if (Boolean(bootstrapEmail) !== Boolean(bootstrapToken) ||
      (bootstrapToken && !tokenPattern.test(bootstrapToken))) {
    throw new Error('Configurá juntos TREBOLIUM_ADMIN_EMAIL y un TREBOLIUM_BOOTSTRAP_TOKEN generado para el piloto.');
  }
  const firstEmail = bootstrapEmail ? emailOf(bootstrapEmail) : null;
  const firstHash = bootstrapToken ? Buffer.from(digest(bootstrapToken), 'hex') : null;
  const initial = {accounts: chart, entries: [], models: [], indices: [], revision: 0, nextId: 1};
  const attempts = new Map();
  let activeDerivations = 0;

  async function transaction(task) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const result = await task(db);
      await db.query('COMMIT');
      return result;
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  }

  async function audit(db, actor, action, details) {
    await db.query('INSERT INTO trebolium_audit (actor, action, details) VALUES ($1, $2, $3)',
      [actor, action, details]);
  }

  await transaction(async db => {
    await db.query('SELECT pg_advisory_xact_lock(58720419)');
    await db.query(schema);
    await db.query('INSERT INTO trebolium_ledger VALUES (1, $1) ON CONFLICT (id) DO NOTHING', [initial]);
  });

  function throttle(key, max) {
    const now = Date.now();
    if (attempts.size >= 2048) {
      for (const [item, record] of attempts) {
        if (record.until <= now) attempts.delete(item);
      }
    }
    const record = attempts.get(key);
    if (record?.until > now) {
      if (record.count >= max) throw new PilotError(429, 'Demasiados intentos. Volvé a intentar en unos minutos.');
      record.count++;
    } else {
      if (attempts.size >= 2048 && !attempts.has(key)) {
        throw new PilotError(429, 'Demasiados intentos. Volvé a intentar en unos minutos.');
      }
      attempts.set(key, {until: now + 5 * 60 * 1000, count: 1});
    }
  }

  async function hashPassword(password, salt) {
    if (activeDerivations >= 3) throw new PilotError(429, 'Hay varios accesos en curso. Volvé a intentar.');
    activeDerivations++;
    try {
      return await derive(password, salt, 64, {N: 65536, r: 8, p: 2, maxmem: 80 * 1024 ** 2});
    } finally {
      activeDerivations--;
    }
  }

  function cookie(response, value, maxAge) {
    response.setHeader('Set-Cookie', cookieName + '=' + value + '; Path=/; Max-Age=' + maxAge +
      '; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : ''));
  }

  function sessionHash(request) {
    const prefix = cookieName + '=';
    const value = request.headers.cookie?.split(';').map(part => part.trim())
      .find(part => part.startsWith(prefix))?.slice(prefix.length);
    return value && tokenPattern.test(value) ? digest(value) : null;
  }

  async function userFor(request, db = pool, lock = false) {
    const hash = sessionHash(request);
    if (!hash) return null;
    const {rows} = await db.query(`
      SELECT u.id, u.email, u.role FROM trebolium_users u
      JOIN trebolium_sessions s ON s.user_id = u.id
      WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP AND u.active
      ${lock ? 'FOR UPDATE OF u' : ''}
    `, [hash]);
    return rows[0] || null;
  }

  async function requireUser(request, db, lock) {
    const user = await userFor(request, db, lock);
    if (!user) throw new PilotError(401, 'Iniciá sesión para continuar.');
    return user;
  }

  async function login(request, response, body) {
    const email = emailOf(body.email);
    const password = passwordOf(body.password, 1);
    throttle('login:' + email, 12);
    const {rows: [user]} = await pool.query(
      'SELECT id, password_hash, salt FROM trebolium_users WHERE email = $1 AND active', [email]);
    const calculated = await hashPassword(password, user?.salt || 'trebolium-dummy-salt');
    if (!user || !timingSafeEqual(calculated, Buffer.from(user.password_hash, 'hex'))) {
      throw new PilotError(401, 'El correo o la contraseña son incorrectos.');
    }
    const value = token();
    await transaction(async db => {
      await db.query('DELETE FROM trebolium_sessions WHERE expires_at <= CURRENT_TIMESTAMP');
      const previous = sessionHash(request);
      if (previous) await db.query('DELETE FROM trebolium_sessions WHERE token_hash = $1', [previous]);
      await db.query(`INSERT INTO trebolium_sessions (token_hash, user_id, expires_at)
        VALUES ($1, $2, CURRENT_TIMESTAMP + INTERVAL '8 hours')`, [digest(value), user.id]);
    });
    attempts.delete('login:' + email);
    cookie(response, value, sessionSeconds);
    return {ok: true};
  }

  async function accept(body) {
    const email = emailOf(body.email);
    const password = passwordOf(body.password, 12);
    if (typeof body.token !== 'string' || !tokenPattern.test(body.token)) {
      throw new PilotError(400, 'La invitación no es válida o ya venció.');
    }
    const hash = digest(body.token);
    const bootstrap = email === firstEmail && firstHash && timingSafeEqual(Buffer.from(hash, 'hex'), firstHash);
    throttle('invite:' + email, 12);
    if (!bootstrap) {
      const invite = await pool.query(`SELECT 1 FROM trebolium_invites
        WHERE email = $1 AND token_hash = $2 AND expires_at > CURRENT_TIMESTAMP`, [email, hash]);
      if (!invite.rowCount) throw new PilotError(400, 'La invitación no es válida o ya venció.');
    }
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await hashPassword(password, salt)).toString('hex');
    await transaction(async db => {
      let role;
      if (bootstrap) {
        await db.query('SELECT id FROM trebolium_ledger WHERE id = 1 FOR UPDATE');
        const users = await db.query('SELECT 1 FROM trebolium_users LIMIT 1');
        if (!users.rowCount) role = 'administrador';
      } else {
        const invite = await db.query(`DELETE FROM trebolium_invites WHERE email = $1 AND token_hash = $2
          AND expires_at > CURRENT_TIMESTAMP RETURNING role`, [email, hash]);
        role = invite.rows[0]?.role;
      }
      if (!role) throw new PilotError(400, 'La invitación no es válida o ya venció.');
      const created = await db.query(`INSERT INTO trebolium_users (email, role, password_hash, salt)
        VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING`, [email, role, passwordHash, salt]);
      if (!created.rowCount) throw new PilotError(409, 'Ya existe una cuenta con ese correo.');
      await audit(db, email, 'accept-invite', {role, bootstrap: Boolean(bootstrap)});
    });
    return {ok: true};
  }

  async function administration(request, action, body) {
    return transaction(async db => {
      const user = await requireUser(request, db, true);
      requireAdmin(user);
      const email = emailOf(body.email);
      if (action === 'invite') {
        if (!roles.includes(body.role)) throw new PilotError(400, 'Elegí un rol válido.');
        const existing = await db.query('SELECT 1 FROM trebolium_users WHERE email = $1', [email]);
        if (existing.rowCount) throw new PilotError(409, 'Ya existe una cuenta con ese correo.');
        const value = token();
        await db.query(`INSERT INTO trebolium_invites VALUES ($1, $2, $3, CURRENT_TIMESTAMP + INTERVAL '48 hours')
          ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, token_hash = EXCLUDED.token_hash,
          expires_at = EXCLUDED.expires_at`, [email, body.role, digest(value)]);
        await audit(db, user.email, 'invite', {email, role: body.role});
        return {token: value};
      }
      if (action === 'revoke-invite') {
        const removed = await db.query('DELETE FROM trebolium_invites WHERE email = $1', [email]);
        if (!removed.rowCount) throw new PilotError(404, 'La invitación ya no está pendiente.');
        await audit(db, user.email, 'revoke-invite', {email});
        return {ok: true};
      }
      if (email === user.email) throw new PilotError(400, 'No podés desactivar tu propia cuenta.');
      const changed = await db.query(`UPDATE trebolium_users SET active = false WHERE email = $1 AND active RETURNING id`, [email]);
      if (!changed.rowCount) throw new PilotError(404, 'La cuenta ya no está activa.');
      await db.query('DELETE FROM trebolium_sessions WHERE user_id = $1', [changed.rows[0].id]);
      await audit(db, user.email, 'disable-user', {email});
      return {ok: true};
    });
  }

  return {
    async health() {
      await pool.query('SELECT 1');
    },
    async readState(request) {
      const user = await requireUser(request);
      const {rows: [{state}]} = await pool.query('SELECT state FROM trebolium_ledger WHERE id = 1');
      return {...state, user};
    },
    async mutate(request, body, applyAction) {
      return transaction(async db => {
        const user = await requireUser(request, db, true);
        if (user.role === 'consulta') throw new PilotError(403, 'Tu cuenta tiene permiso de consulta.');
        if (closeActions.has(body.action)) requireAdmin(user);
        const {rows: [{state}]} = await db.query('SELECT state FROM trebolium_ledger WHERE id = 1 FOR UPDATE');
        if (body.revision !== state.revision) {
          throw new PilotError(409, 'Los datos cambiaron. Recargá la página antes de reintentar.');
        }
        const updated = structuredClone(state);
        applyAction(updated, body);
        updated.revision++;
        await db.query('UPDATE trebolium_ledger SET state = $1 WHERE id = 1', [updated]);
        await audit(db, user.email, body.action, {revision: updated.revision, changes: changesBetween(state, updated)});
        return {...updated, user};
      });
    },
    async get(request, endpoint) {
      const user = await requireUser(request);
      requireAdmin(user);
      if (endpoint === 'audit') {
        const {rows} = await pool.query(
          'SELECT id, occurred_at, actor, action, details FROM trebolium_audit ORDER BY id DESC LIMIT 100');
        return rows;
      }
      const [users, invites] = await Promise.all([
        pool.query('SELECT email, role, active FROM trebolium_users ORDER BY email'),
        pool.query('SELECT email, role, expires_at FROM trebolium_invites WHERE expires_at > CURRENT_TIMESTAMP ORDER BY email')
      ]);
      return {users: users.rows, invites: invites.rows};
    },
    async post(request, response, action, body) {
      if (action === 'login') return login(request, response, body);
      if (action === 'accept') return accept(body);
      if (action === 'logout') {
        const hash = sessionHash(request);
        if (hash) await pool.query('DELETE FROM trebolium_sessions WHERE token_hash = $1', [hash]);
        cookie(response, '', 0);
        return {ok: true};
      }
      return administration(request, action, body);
    }
  };
}
