const crypto = require('crypto');
const { URLSearchParams } = require('url');

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseJwt(token) {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  return JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

function createPkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

function authRoutes(config) {
  const tenantPath = `${config.azure.authorityHost}/${config.azure.tenantId}`;

  async function exchangeCodeForToken(code, codeVerifier) {
    const tokenEndpoint = `${tenantPath}/oauth2/v2.0/token`;
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.azure.clientId,
      client_secret: config.azure.clientSecret,
      code,
      redirect_uri: config.azure.redirectUri,
      code_verifier: codeVerifier,
      scope: 'openid profile email'
    });

    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Token exchange failed (${response.status}): ${body}`);
    }

    return response.json();
  }

  function startAzureLogin(req, res) {
    const { verifier, challenge } = createPkce();
    const state = crypto.randomBytes(16).toString('hex');
    req.session.pkceVerifier = verifier;
    req.session.authState = state;

    const params = new URLSearchParams({
      client_id: config.azure.clientId,
      response_type: 'code',
      redirect_uri: config.azure.redirectUri,
      response_mode: 'query',
      scope: 'openid profile email',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    res.writeHead(302, { Location: `${tenantPath}/oauth2/v2.0/authorize?${params.toString()}` });
    res.end();
  }

  async function handleAzureCallback(req, res, query) {
    if (!query.code || query.state !== req.session.authState) {
      res.writeHead(401);
      res.end('Invalid authentication response.');
      return;
    }

    const tokens = await exchangeCodeForToken(query.code, req.session.pkceVerifier);
    const claims = parseJwt(tokens.id_token);
    if (!claims) {
      res.writeHead(401);
      res.end('Unable to parse identity token.');
      return;
    }

    const groups = Array.isArray(claims.groups) ? claims.groups : [];
    const allowed = config.azure.allowedGroupId ? groups.includes(config.azure.allowedGroupId) : true;
    if (!allowed) {
      res.writeHead(403);
      res.end('Your account is not in the allowed Intune/Entra group.');
      return;
    }

    const email = (claims.preferred_username || claims.email || '').toLowerCase();
    const role = config.azure.adminEmails.includes(email) ? 'admin' : 'author';
    req.session.user = {
      id: claims.oid || claims.sub,
      name: claims.name || claims.preferred_username,
      email: claims.preferred_username || claims.email,
      role: role
    };

    res.writeHead(302, { Location: '/' });
    res.end();
  }

  function localLogin(req, res, body) {
    const user = config.localUsers.find((u) => u.email === body.email && u.password === body.password);
    if (!user) {
      res.writeHead(302, { Location: '/login?error=invalid' });
      res.end();
      return;
    }
    req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.writeHead(302, { Location: '/' });
    res.end();
  }

  return { startAzureLogin, handleAzureCallback, localLogin };
}

module.exports = { authRoutes };
