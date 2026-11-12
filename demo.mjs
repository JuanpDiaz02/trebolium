import {randomBytes, randomInt} from 'node:crypto';
import {chart} from './chart.mjs';

const cookieName = 'trebolium_demo';
const duration = 2 * 60 * 60;
const maxSessions = 96;
const dateFormatter = new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Argentina/Buenos_Aires'});

export function demoState(revision = randomInt(2 ** 47)) {
  const date = dateFormatter.format(new Date());
  const line = (code, debit, credit) => ({code, debit, credit});
  const entry = (id, memo, lines) => ({id, date, memo, lines, type: 'manual', notes: 'Ejemplo ficticio'});
  return {
    demo: true,
    accounts: structuredClone(chart),
    entries: [
      entry(1, 'Aporte inicial de ejemplo', [line('1.1.1.1', 50000000, 0), line('3.1', 0, 50000000)]),
      entry(2, 'Servicios cobrados de ejemplo', [line('1.1.1.1', 12500000, 0), line('4.1.2', 0, 12500000)]),
      entry(3, 'Alquiler de ejemplo', [line('4.2.22', 4200000, 0), line('1.1.1.1', 0, 4200000)])
    ],
    models: [{id: 4, memo: 'Cobro de servicios de ejemplo',
      lines: [line('1.1.1.1', 1500000, 0), line('4.1.2', 0, 1500000)]}],
    indices: [],
    nextId: 5,
    revision
  };
}

export function demoSessions(secure) {
  const sessions = new Map();
  return {
    get(request, response, create = false) {
      const now = Date.now();
      const cookies = request.headers.cookie?.split(';') || [];
      const cookie = cookies.map(value => value.trim()).find(value => value.startsWith(cookieName + '='));
      const id = cookie?.slice(cookieName.length + 1);
      const current = sessions.get(id);
      if (current && current.expires > now) return current;
      if (!create) return;
      for (const [key, session] of sessions) {
        if (session.expires <= now) sessions.delete(key);
      }
      if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
      const token = randomBytes(24).toString('hex');
      const session = {expires: now + duration * 1000, state: demoState()};
      sessions.set(token, session);
      response.setHeader('Set-Cookie', cookieName + '=' + token + '; Path=/; Max-Age=' + duration +
        '; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : ''));
      return session;
    }
  };
}
