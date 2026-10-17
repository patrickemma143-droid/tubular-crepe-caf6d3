// Minimal local Supabase stand-in: /auth/v1 (password sign-up/in, user, refresh, logout) + /rest/v1 → PostgREST
import http from 'node:http';
import crypto from 'node:crypto';
import pg from 'pg';

const SECRET = 'farmos-local-test-secret-at-least-32-chars!!';
const REST = 'http://127.0.0.1:3001';
const pool = new pg.Pool({ host: '/var/tmp/farmpg', port: 5499, user: 'postgres', database: 'sb' });

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export function sign(claims) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }); const p = b64(claims);
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
function verify(tok) {
  const [h, p, s] = (tok || '').split('.');
  if (!s || crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url') !== s) return null;
  return JSON.parse(Buffer.from(p, 'base64url').toString());
}
const userObj = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: { provider: 'email' }, user_metadata: {}, created_at: u.created_at, updated_at: u.created_at });
function session(u) {
  const now = Math.floor(Date.now() / 1000);
  const access_token = sign({ sub: u.id, email: u.email, role: 'authenticated', aud: 'authenticated', iat: now, exp: now + 3600 });
  return { access_token, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r.' + u.id, user: userObj(u) };
}
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS', 'access-control-expose-headers': 'content-range, content-profile, x-total-count' };
const send = (res, code, body) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(body == null ? '' : JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });
export const stats = { rest: 0, auth: 0 };

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/auth/v1')) {
      stats.auth++;
      const path = url.pathname.slice(8);
      const body = req.method === 'GET' ? {} : JSON.parse((await readBody(req)) || '{}');
      if (path === '/signup') {
        const email = String(body.email).toLowerCase();
        const ex = await pool.query('select * from auth.users where email=$1', [email]);
        if (ex.rows.length) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        const { rows } = await pool.query('insert into auth.users (email,password) values ($1,$2) returning *', [email, body.password]);
        return send(res, 200, session(rows[0]));
      }
      if (path === '/token' && url.searchParams.get('grant_type') === 'password') {
        const { rows } = await pool.query('select * from auth.users where email=$1 and password=$2', [String(body.email).toLowerCase(), body.password]);
        if (!rows.length) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return send(res, 200, session(rows[0]));
      }
      if (path === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
        const id = String(body.refresh_token || '').slice(2);
        const { rows } = await pool.query('select * from auth.users where id=$1', [id]);
        if (!rows.length) return send(res, 400, { error: 'invalid_grant' });
        return send(res, 200, session(rows[0]));
      }
      if (path === '/user') {
        const c = verify((req.headers.authorization || '').replace(/^Bearer /, ''));
        if (!c?.sub) return send(res, 401, { msg: 'invalid JWT' });
        const { rows } = await pool.query('select * from auth.users where id=$1', [c.sub]);
        return send(res, 200, userObj(rows[0]));
      }
      if (path === '/logout') { res.writeHead(204, cors); return res.end(); }
      return send(res, 404, { msg: 'not implemented: ' + path });
    }
    if (url.pathname.startsWith('/rest/v1')) {
      stats.rest++;
      const body = ['GET', 'HEAD'].includes(req.method) ? undefined : await readBody(req);
      const headers = { ...req.headers }; delete headers.host; delete headers['content-length']; delete headers.origin;
      const r = await fetch(REST + url.pathname.slice(8) + url.search, { method: req.method, headers, body });
      const out = await r.text();
      const h = { ...cors }; for (const k of ['content-type', 'content-range', 'preference-applied']) if (r.headers.get(k)) h[k] = r.headers.get(k);
      res.writeHead(r.status, h); return res.end(out);
    }
    send(res, 404, { msg: 'not found' });
  } catch (e) { send(res, 500, { msg: String(e) }); }
}).listen(54321, '127.0.0.1', () => console.log('gateway on 54321'));

if (process.argv[2] === 'anon') console.log(sign({ role: 'anon', iss: 'local', iat: 1, exp: 4102444800 }));
