const path = require('path');

function bool(v, fallback = false) {
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  sessionSecret: process.env.SESSION_SECRET || 'change-me-in-production',
  enforceHttps: bool(process.env.ENFORCE_HTTPS, false),
  dataFile: process.env.DATA_FILE || path.join(process.cwd(), 'data', 'issueboard.json'),
  authMode: process.env.AUTH_MODE || 'azure', // azure | local
  azure: {
    tenantId: process.env.AZURE_TENANT_ID || '',
    clientId: process.env.AZURE_CLIENT_ID || '',
    clientSecret: process.env.AZURE_CLIENT_SECRET || '',
    redirectUri: process.env.AZURE_REDIRECT_URI || 'http://localhost:3000/auth/callback',
    authorityHost: process.env.AZURE_AUTHORITY_HOST || 'https://login.microsoftonline.com',
    allowedGroupId: process.env.AZURE_ALLOWED_GROUP_ID || '',
    adminEmails: (process.env.ADMIN_EMAILS || '').split(',').map((v) => v.trim().toLowerCase()).filter(Boolean)
  },
  localUsers: [
    { id: 'admin1', name: 'Admin User', email: 'admin@example.local', role: 'admin', password: process.env.LOCAL_ADMIN_PASSWORD || 'admin123!' },
    { id: 'author1', name: 'Authorized Staff', email: 'staff@example.local', role: 'author', password: process.env.LOCAL_AUTHOR_PASSWORD || 'author123!' },
    { id: 'viewer1', name: 'Standard Viewer', email: 'viewer@example.local', role: 'viewer', password: process.env.LOCAL_VIEWER_PASSWORD || 'viewer123!' }
  ]
};
