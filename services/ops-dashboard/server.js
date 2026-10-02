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
const OPS_DASHBOARD_VERSION = '2026-10-02-service-versions';

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
    return { ok: res.ok, status: res.status, body: text.slice(0, 4096) };
  } catch (err) {
    return { ok: false, status: 0, body: String(err && err.message ? err.message : err) };
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonObject(text) {
  try {
    const value = JSON.parse(String(text || ''));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function firstVersionValue(...healthBodies) {
  const keys = ['version', 'service_version', 'build_version', 'buildVersion', 'build_id', 'buildId', 'revision'];
  for (const body of healthBodies) {
    if (!body) continue;
    for (const key of keys) {
      const value = body[key];
      if (value !== null && value !== undefined && String(value).trim()) return String(value).trim();
    }
  }
  return '';
}

function serviceRuntimeRoot(svc) {
  const relative = String((svc && svc.runtimePath) || '').trim();
  if (!relative) return '';
  const normalized = relative.replace(/[\\/]+/g, path.sep);
  return path.resolve(PIPELINE_ROOT, normalized);
}

function resolveGitDir(repoRoot) {
  const marker = path.join(repoRoot, '.git');
  try {
    const stat = fs.statSync(marker);
    if (stat.isDirectory()) return marker;
    if (!stat.isFile()) return '';
    const text = fs.readFileSync(marker, 'utf8').trim();
    const match = text.match(/^gitdir:\s*(.+)$/i);
    if (!match) return '';
    return path.resolve(repoRoot, match[1].trim());
  } catch {
    return '';
  }
}

function readGitHead(repoRoot) {
  const gitDir = resolveGitDir(repoRoot);
  if (!gitDir) return '';
  try {
    const head = fs.readFileSync(path.join(gitDir, 'HEAD'), 'utf8').trim();
    if (/^[0-9a-f]{40}$/i.test(head)) return head;
    const match = head.match(/^ref:\s*(.+)$/i);
    if (!match) return '';
    const refName = match[1].trim();
    const looseRef = path.join(gitDir, ...refName.split('/'));
    if (fs.existsSync(looseRef)) {
      const value = fs.readFileSync(looseRef, 'utf8').trim();
      if (/^[0-9a-f]{40}$/i.test(value)) return value;
    }
    const packed = path.join(gitDir, 'packed-refs');
    if (fs.existsSync(packed)) {
      for (const line of fs.readFileSync(packed, 'utf8').split(/\r?\n/)) {
        if (!line || line.startsWith('#') || line.startsWith('^')) continue;
        const parts = line.trim().split(/\s+/, 2);
        const sha = parts[0];
        const ref = parts[1];
        if (ref === refName && /^[0-9a-f]{40}$/i.test(sha)) return sha;
      }
    }
  } catch {
    return '';
  }
  return '';
}

function deployedVersionInfo(svc) {
  const runtimeRoot = serviceRuntimeRoot(svc);
  if (!runtimeRoot) return { commit: '', short: '', deployedAt: '', source: '' };
  const manifestPath = path.join(runtimeRoot, '.smv2-deployment.json');
  try {
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const commit = String(manifest.deployed_commit || '').trim();
      const short = String(manifest.deployed_commit_short || '').trim() || commit.slice(0, 7);
      return {
        commit,
        short,
        deployedAt: String(manifest.deployed_at_utc || '').trim(),
        source: 'deployment-manifest',
      };
    }
  } catch {
    // A bad or partially written manifest should not break the entire Ops status page.
  }
  if (svc && svc.gitCheckout) {
    const commit = readGitHead(runtimeRoot);
    return { commit, short: commit.slice(0, 7), deployedAt: '', source: commit ? 'git-head' : '' };
  }
  return { commit: '', short: '', deployedAt: '', source: '' };
}

function buildServiceVersionInfo(svc, localHealth, publicHealth) {
  const localBody = parseJsonObject(localHealth && localHealth.body);
  const publicBody = parseJsonObject(publicHealth && publicHealth.body);
  const localVersion = firstVersionValue(localBody);
  const publicVersion = firstVersionValue(publicBody);
  const deployed = deployedVersionInfo(svc);
  const runtimeVersion = localVersion || publicVersion;
  const displayVersion = runtimeVersion || deployed.short || '';
  const versionSource = localVersion ? 'local-health' : publicVersion ? 'public-health' : deployed.source;
  return {
    runtimeVersion: runtimeVersion || null,
    localVersion: localVersion || null,
    publicVersion: publicVersion || null,
    deployedCommit: deployed.commit || null,
    deployedCommitShort: deployed.short || null,
    deployedAt: deployed.deployedAt || null,
    version: displayVersion || null,
    versionSource: versionSource || null,
    versionMismatch: Boolean(localVersion && publicVersion && localVersion !== publicVersion),
  };
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
  ];
  if (service) {
    args.push('-Service', service);
  }

  const child = spawn('powershell.exe', args, {
    windowsHide: true,
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  job.child = child;

  let pump = null;
  let timeoutTimer = null;
  const finish = (code, errText) => {
    if (job.endedAt) return;
    if (pump) clearInterval(pump);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    if (errText) appendLog(job, `\n${errText}\n`);
    if (!job.log || job.log.trim() === 'Starting… VERIFY and DEPLOY can take a minute. Output appears as PowerShell writes it.') {
      appendLog(job, '\n(No PowerShell output was captured.)\n');
    }
    job.exitCode = code == null ? 1 : code;
    job.status = job.exitCode === 0 ? 'ok' : 'failed';
    job.endedAt = new Date().toISOString();
    job.child = null;
    if (activeJobId === job.id) activeJobId = null;
  };
  pump = setInterval(() => {
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
  child.on('exit', (code) => finish(code));
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
    json(res, 200, { ok: true, service: 'ops-dashboard', version: OPS_DASHBOARD_VERSION, host: os.hostname() });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/openapi.json') {
    const specPath = path.join(ROOT, 'openapi.json');
    if (!fs.existsSync(specPath)) {
      json(res, 404, { ok: false, error: 'openapi.json missing' });
      return;
    }
    const spec = fs.readFileSync(specPath, 'utf8');
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': Buffer.byteLength(spec),
    });
    res.end(spec);
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
      const rows = await Promise.all(catalog.services.map(async (svc) => {
        const localUp = await probePort(svc.port);
        const localUrl = 'http://127.0.0.1:' + svc.port + '/health';
        const publicUrl = svc.publicUrl && svc.publicUrl.startsWith('https://')
          ? svc.publicUrl.replace(/\/$/, '') + '/health'
          : '';
        const pair = await Promise.all([
          localUp ? probeHttp(localUrl, 1800) : Promise.resolve(null),
          publicUrl ? probeHttp(publicUrl) : Promise.resolve(null),
        ]);
        const localHealth = pair[0];
        const publicHealth = pair[1];
        const versionInfo = buildServiceVersionInfo(svc, localHealth, publicHealth);
        return {
          id: svc.id,
          name: svc.name,
          port: svc.port,
          publicUrl: svc.publicUrl,
          localUp,
          localHealthOk: localHealth ? localHealth.ok : null,
          publicOk: publicHealth ? publicHealth.ok : null,
          publicStatus: publicHealth ? publicHealth.status : null,
          ...versionInfo,
        };
      }));
      json(res, 200, {
        ok: true,
        version: OPS_DASHBOARD_VERSION,
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
