'use strict';

const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');

const ROOT = __dirname;
const CATALOG_PATH = path.join(ROOT, 'catalog.json');

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = value;
  }
}

loadDotEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 3361);
const BIND = process.env.BIND || '127.0.0.1';
const TOKEN = String(process.env.DASHBOARD_TOKEN || '').trim();
const PIPELINE_ROOT = process.env.PIPELINE_ROOT || 'D:\\Content Creation\\ChicagoShining Pipeline';
const REPO_ROOT = process.env.REPO_ROOT || path.resolve(ROOT, '..', '..');
const ACTION_PS1 = path.join(REPO_ROOT, 'deploy', 'local-services', 'Invoke-OpsDashboardAction.ps1');

const catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
const actionsById = new Map(catalog.actions.map((a) => [a.id, a]));
const servicesById = new Map(catalog.services.map((s) => [s.id, s]));

const jobs = new Map();
let activeJobId = null;

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function clientIp(req) {
  const xf = String(req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for'] || '');
  if (xf) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

function readToken(req, url) {
  const header = String(req.headers['authorization'] || '');
  if (header.toLowerCase().startsWith('bearer ')) return header.slice(7).trim();
  const named = String(req.headers['x-ops-token'] || '').trim();
  if (named) return named;
  const q = url.searchParams.get('token');
  if (q) return q;
  const cookie = String(req.headers.cookie || '');
  const match = cookie.match(/(?:^|;\s*)ops_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function authorize(req, url) {
  const ip = clientIp(req);
  if (!TOKEN) return isLoopback(ip);
  return readToken(req, url) === TOKEN;
}

function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, timeout: 800 }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function probeHttp(url, timeoutMs = 4000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'manual' });
    const text = await res.text();
    return { ok: res.ok, status: res.status, body: text.slice(0, 240) };
  } catch (err) {
    return { ok: false, status: 0, body: String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.js') return 'application/javascript; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function serveStatic(res, urlPath) {
  let rel = urlPath === '/' ? '/index.html' : urlPath;
  rel = path.posix.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = path.join(ROOT, 'public', rel);
  if (!filePath.startsWith(path.join(ROOT, 'public'))) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, {
    'Content-Type': mimeFor(filePath),
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 64 * 1024) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function appendLog(job, line) {
  const text = String(line).replace(/\r\n/g, '\n');
  job.log += text;
  if (job.log.length > 400000) job.log = job.log.slice(-300000);
}

function readTranscript(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function syncTranscript(job) {
  const text = readTranscript(job.transcriptPath);
  if (text && text !== job.log) job.log = text;
}

function startJob(action, service) {
  const job = {
    id: randomUUID(),
    action,
    service: service || null,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    log: 'Starting… VERIFY and DEPLOY can take a minute. Output appears as PowerShell writes it.\n',
    transcriptPath: path.join(os.tmpdir(), `ops-dashboard-${randomUUID()}.log`),
  };
  jobs.set(job.id, job);
  activeJobId = job.id;

  const args = [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    ACTION_PS1,
    '-Action',
    action,
    '-PipelineRoot',
    PIPELINE_ROOT,
    '-RepoRoot',
    REPO_ROOT,
    '-TranscriptPath',
    job.transcriptPath,
  ];
  if (service) {
    args.push('-Service', service);
  }

  const child = spawn('powershell.exe', args, {
    windowsHide: true,
    cwd: REPO_ROOT,
  });
  job.child = child;

  let pump = null;
  let timeoutTimer = null;
  const finish = (code, errText) => {
    if (job.endedAt) return;
    if (pump) clearInterval(pump);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    syncTranscript(job);
    if (errText) appendLog(job, `\n${errText}\n`);
    if (!job.log || job.log.trim() === 'Starting… VERIFY and DEPLOY can take a minute. Output appears as PowerShell writes it.') {
      appendLog(job, '\n(No PowerShell transcript was captured.)\n');
    }
    job.exitCode = code == null ? 1 : code;
    job.status = job.exitCode === 0 ? 'ok' : 'failed';
    job.endedAt = new Date().toISOString();
    if (activeJobId === job.id) activeJobId = null;
    try { if (fs.existsSync(job.transcriptPath)) fs.unlinkSync(job.transcriptPath); } catch { /* keep */ }
  };
  pump = setInterval(() => {
    syncTranscript(job);
    if (child.exitCode !== null) finish(child.exitCode);
  }, 800);
  timeoutTimer = setTimeout(() => {
    if (job.endedAt) return;
    try {
      if (child && !child.killed) child.kill();
    } catch { /* ignore */ }
    finish(1, 'ERROR job timed out after 30 minutes');
  }, 30 * 60 * 1000);

  child.stdout.on('data', (buf) => appendLog(job, buf.toString('utf8')));
  child.stderr.on('data', (buf) => appendLog(job, buf.toString('utf8')));
  child.on('error', (err) => finish(1, `ERROR ${err.message}`));
  child.on('close', (code) => finish(code));
  return job;
}

function publicSafeJob(job) {
  return {
    id: job.id,
    action: job.action,
    service: job.service,
    status: job.status,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    exitCode: job.exitCode,
    log: job.log,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    json(res, 200, { ok: true, service: 'ops-dashboard', host: os.hostname() });
    return;
  }

  if (!authorize(req, url)) {
    if (url.pathname.startsWith('/api/')) {
      json(res, 401, { ok: false, error: 'Set DASHBOARD_TOKEN and send it as Bearer, X-Ops-Token, or ?token=.' });
      return;
    }
    serveStatic(res, '/');
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/catalog') {
      json(res, 200, {
        ok: true,
        tokenRequired: Boolean(TOKEN),
        bind: BIND,
        port: PORT,
        catalog,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const rows = [];
      for (const svc of catalog.services) {
        const localUp = await probePort(svc.port);
        let publicHealth = null;
        if (svc.publicUrl && svc.publicUrl.startsWith('https://')) {
          publicHealth = await probeHttp(`${svc.publicUrl.replace(/\/$/, '')}/health`);
        }
        rows.push({
          id: svc.id,
          name: svc.name,
          port: svc.port,
          publicUrl: svc.publicUrl,
          localUp,
          publicOk: publicHealth ? publicHealth.ok : null,
          publicStatus: publicHealth ? publicHealth.status : null,
        });
      }
      json(res, 200, {
        ok: true,
        hostname: os.hostname(),
        activeJobId,
        rows,
      });
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
      const id = url.pathname.slice('/api/jobs/'.length);
      const job = jobs.get(id);
      if (!job) {
        json(res, 404, { ok: false, error: 'job not found' });
        return;
      }
      json(res, 200, { ok: true, job: publicSafeJob(job) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/jobs/unlock') {
      if (activeJobId) {
        const job = jobs.get(activeJobId);
        if (job && job.status === 'running') {
          appendLog(job, '\nUnlocked by operator.\n');
          job.status = 'failed';
          job.exitCode = 1;
          job.endedAt = new Date().toISOString();
          try {
            if (job.child && !job.child.killed) job.child.kill();
          } catch { /* ignore */ }
        }
        activeJobId = null;
      }
      json(res, 200, { ok: true, unlocked: true });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/run') {
      if (activeJobId) {
        const current = jobs.get(activeJobId);
        if (current) syncTranscript(current);
        json(res, 409, {
          ok: false,
          error: 'That first click is still running. Showing its log.',
          jobId: activeJobId,
          job: current ? publicSafeJob(current) : null,
        });
        return;
      }
      if (!fs.existsSync(ACTION_PS1)) {
        json(res, 500, { ok: false, error: `Missing action runner: ${ACTION_PS1}` });
        return;
      }
      const body = JSON.parse((await readBody(req)) || '{}');
      const actionId = String(body.action || '');
      const spec = actionsById.get(actionId);
      if (!spec) {
        json(res, 400, { ok: false, error: 'Unknown action.' });
        return;
      }
      let service = String(body.service || '').trim();
      if (spec.needsService) {
        if (!servicesById.has(service)) {
          json(res, 400, { ok: false, error: 'Pick a service for this action.' });
          return;
        }
      } else {
        service = '';
      }
      if (spec.confirm && body.confirm !== true) {
        json(res, 400, { ok: false, error: 'This action needs an explicit confirm: true.' });
        return;
      }
      const job = startJob(actionId, service);
      json(res, 202, { ok: true, job: publicSafeJob(job) });
      return;
    }

    if (req.method === 'GET' && (url.pathname === '/' || !url.pathname.startsWith('/api/'))) {
      serveStatic(res, url.pathname);
      return;
    }

    json(res, 404, { ok: false, error: 'not found' });
  } catch (err) {
    json(res, 500, { ok: false, error: String(err && err.message ? err.message : err) });
  }
});

server.listen(PORT, BIND, () => {
  process.stdout.write(`ops-dashboard listening on http://${BIND}:${PORT}\n`);
  if (!TOKEN) {
    process.stdout.write('WARN DASHBOARD_TOKEN is empty; only loopback clients are accepted.\n');
  }
});
