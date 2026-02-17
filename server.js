const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const config = require('./src/config');
const { Store } = require('./src/store');
const { authRoutes } = require('./src/auth');
const { homePage, loginPage, detailsPage, adminPage } = require('./src/views');

const store = new Store(config.dataFile);
const auth = authRoutes(config);

const sessions = new Map();

function parseCookies(cookieHeader = '') {
  return Object.fromEntries(cookieHeader.split(';').map((c) => c.trim()).filter(Boolean).map((c) => {
    const eq = c.indexOf('=');
    return [c.substring(0, eq), decodeURIComponent(c.substring(eq + 1))];
  }));
}

function getSession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  let sid = cookies.sid;
  if (!sid || !sessions.has(sid)) {
    sid = crypto.randomBytes(16).toString('hex');
    sessions.set(sid, {});
    res.setHeader('Set-Cookie', `sid=${sid}; Path=/; HttpOnly; SameSite=Lax`);
  }
  return sessions.get(sid);
}

function sendHtml(res, html, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const entries = new URLSearchParams(raw);
  return Object.fromEntries(entries.entries());
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function requireLogin(req, res) {
  if (!req.session.user) {
    redirect(res, '/login');
    return false;
  }
  return true;
}

function requireRole(req, res, roles) {
  if (!requireLogin(req, res)) return false;
  if (!roles.includes(req.session.user.role)) {
    sendHtml(res, '<h1>Forbidden</h1>', 403);
    return false;
  }
  return true;
}

const server = http.createServer(async (req, res) => {
  if (config.enforceHttps && req.headers['x-forwarded-proto'] !== 'https') {
    redirect(res, `${config.baseUrl}${req.url}`);
    return;
  }

  if (req.url.startsWith('/style.css')) {
    res.writeHead(200, { 'Content-Type': 'text/css' });
    res.end(fs.readFileSync(path.join(__dirname, 'public/style.css'), 'utf8'));
    return;
  }

  req.session = getSession(req, res);

  const url = new URL(req.url, config.baseUrl);
  const pathname = url.pathname;

  try {
    if (req.method === 'GET' && pathname === '/') {
      const issues = store.listIssues({ tag: url.searchParams.get('tag') || '', status: url.searchParams.get('status') || 'open' });
      sendHtml(res, homePage({ issues, tags: store.tags(), currentTag: url.searchParams.get('tag') || '', user: req.session.user, status: url.searchParams.get('status') || 'open' }));
      return;
    }

    if (req.method === 'GET' && pathname === '/login') {
      sendHtml(res, loginPage(config.authMode, url.searchParams.get('error')));
      return;
    }

    if (req.method === 'GET' && pathname === '/logout') {
      req.session.user = null;
      redirect(res, '/');
      return;
    }

    if (req.method === 'GET' && pathname === '/auth/login') {
      if (config.authMode !== 'azure') return redirect(res, '/login');
      auth.startAzureLogin(req, res);
      return;
    }

    if (req.method === 'GET' && pathname === '/auth/callback') {
      await auth.handleAzureCallback(req, res, Object.fromEntries(url.searchParams.entries()));
      return;
    }

    if (req.method === 'POST' && pathname === '/auth/local') {
      const body = await readBody(req);
      auth.localLogin(req, res, body);
      return;
    }

    if (req.method === 'POST' && pathname === '/issues') {
      if (!requireRole(req, res, ['admin', 'author'])) return;
      const body = await readBody(req);
      store.createIssue({
        title: body.title?.trim(),
        description: body.description?.trim(),
        tags: (body.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
        dueDate: body.dueDate || null,
        isNew: Boolean(body.isNew),
        isHighImportance: Boolean(body.isHighImportance)
      }, req.session.user);
      redirect(res, '/');
      return;
    }

    const detailsMatch = pathname.match(/^\/issues\/([a-f0-9\-]+)$/);
    if (req.method === 'GET' && detailsMatch) {
      const issueData = store.getIssue(detailsMatch[1]);
      if (!issueData) return sendHtml(res, '<h1>Not found</h1>', 404);
      sendHtml(res, detailsPage({ ...issueData, user: req.session.user }));
      return;
    }

    const closeMatch = pathname.match(/^\/issues\/([a-f0-9\-]+)\/close$/);
    if (req.method === 'POST' && closeMatch) {
      if (!requireRole(req, res, ['admin', 'author'])) return;
      store.closeIssue(closeMatch[1]);
      redirect(res, '/');
      return;
    }

    const commentMatch = pathname.match(/^\/issues\/([a-f0-9\-]+)\/comments$/);
    if (req.method === 'POST' && commentMatch) {
      if (!requireLogin(req, res)) return;
      const body = await readBody(req);
      store.addComment(commentMatch[1], body.message?.trim(), req.session.user);
      redirect(res, `/issues/${commentMatch[1]}`);
      return;
    }

    if (req.method === 'GET' && pathname === '/admin') {
      if (!requireRole(req, res, ['admin'])) return;
      sendHtml(res, adminPage({ issues: store.listIssues({ status: 'all' }), user: req.session.user }));
      return;
    }

    const adminIssueMatch = pathname.match(/^\/admin\/issues\/([a-f0-9\-]+)$/);
    if (req.method === 'POST' && adminIssueMatch) {
      if (!requireRole(req, res, ['admin'])) return;
      const body = await readBody(req);
      store.updateIssue(adminIssueMatch[1], {
        status: body.status === 'closed' ? 'closed' : 'open',
        isNew: Boolean(body.isNew),
        isHighImportance: Boolean(body.isHighImportance),
        tags: (body.tags || '').split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      });
      redirect(res, '/admin');
      return;
    }

    if (req.method === 'POST' && pathname === '/admin/reorder') {
      if (!requireRole(req, res, ['admin'])) return;
      const body = await readBody(req);
      store.reorder((body.orderedIds || '').split('\n').map((i) => i.trim()).filter(Boolean));
      redirect(res, '/admin');
      return;
    }

    sendHtml(res, '<h1>Not found</h1>', 404);
  } catch (error) {
    sendHtml(res, `<h1>Server error</h1><pre>${error.message}</pre>`, 500);
  }
});

server.listen(config.port, () => {
  console.log(`IssueBoard listening on ${config.port}`);
});
