# ICT Issue Notice Board

A lightweight internal web app for posting and tracking ICT known issues as cards/tiles.

## Features
- Azure AD (Entra ID) SSO login (OIDC Authorization Code + PKCE).
- Access can be limited to a specific Intune/Entra group (`AZURE_ALLOWED_GROUP_ID`).
- Authorized users (`author`/`admin`) can post issues, tag, prioritize, and close them.
- All authenticated users can comment on issues; comments are attributed to the signed-in account.
- Cards display creator, created date, tags, status, new/high-importance flags.
- Admin backend for metadata edits, status control, and manual sort order.

## Quick start
1. Copy `.env.example` to `.env` in the application root (`/workspace/IssueBoard`) and configure values.
2. For local testing, set `AUTH_MODE=local` (uppercase key; `auth_mode` is also accepted for compatibility).
3. Start the app:
   ```bash
   node server.js
   ```
4. Open `http://localhost:3000`.

## Azure / Intune setup
1. In Entra ID, create an App Registration.
2. Add redirect URI: `https://<internal-host>/auth/callback`.
3. Generate a client secret.
4. Configure optional claims/groups so the `groups` claim is included in token.
5. Create/manage an Entra group for authorized posters and assign members.
6. Set `AZURE_ALLOWED_GROUP_ID` to that group's object ID.
7. Set `ADMIN_EMAILS` for users with admin backend access.

> Note: Large group memberships can cause group overage claims. In that case, implement a Microsoft Graph group lookup service account flow.

## IIS hosting (Windows Server 2025)
Recommended pattern is IIS reverse proxy to Node.js using URL Rewrite + ARR:
1. Install Node.js LTS and IIS modules: **Application Request Routing** and **URL Rewrite**.
2. Create site binding on `443` with internal CA SSL certificate.
3. Run app as Windows service (e.g. NSSM) on local port `3000`.
4. Configure rewrite rule to proxy all traffic to `http://localhost:3000`.
5. Ensure headers forwarded: `X-Forwarded-Proto=https`.
6. Set app env vars in system/user environment and restart service.

### Sample `web.config`
```xml
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="ReverseProxyInboundRule1" stopProcessing="true">
          <match url="(.*)" />
          <action type="Rewrite" url="http://localhost:3000/{R:1}" />
        </rule>
      </rules>
    </rewrite>
  </system.webServer>
</configuration>
```

## Security notes
- Set a long random `SESSION_SECRET`.
- Force HTTPS in production (`ENFORCE_HTTPS=true`).
- Store secrets in Windows Credential Manager or secure vault if possible.
- Restrict firewall and site access to internal networks only.
