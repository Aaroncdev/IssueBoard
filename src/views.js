function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function layout({ title, user, body, settings = {} }) {
  const auth = user
    ? `<div class="user-meta">${esc(user.name)} (${esc(user.role)}) · <a href="/logout">Logout</a></div>`
    : '<a class="btn" href="/login">Login</a>';

  const theme = settings.theme || {};
  const styleVars = `--header-bg:${esc(theme.headerBg || '#1f4a78')};--page-bg:${esc(theme.pageBg || '#f4f6f9')};--accent:${esc(theme.accent || '#1f4a78')};`;
  const logo = settings.logoDataUrl ? `<img class="logo" alt="Organisation logo" src="${settings.logoDataUrl}" />` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} - ICT Issue Board</title>
<link rel="stylesheet" href="/style.css" />
</head>
<body style="${styleVars}">
<header><h1><a href="/">${logo}ICT Notice Board</a></h1>${auth}</header>
<main>${body}</main>
</body></html>`;
}

function issueCard(issue, canManage) {
  return `<article class="card ${issue.isHighImportance ? 'high' : ''}">
    <h3><a href="/issues/${issue.id}">${esc(issue.title)}</a></h3>
    <p>${esc(issue.description.slice(0, 220))}</p>
    <div class="meta">
      ${issue.isNew ? '<span class="badge new">New</span>' : ''}
      ${issue.isHighImportance ? '<span class="badge high">High Importance</span>' : ''}
      ${issue.isOverdue ? '<span class="badge overdue">Overdue</span>' : ''}
      ${issue.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}
      <span>Created: ${new Date(issue.createdAt).toLocaleString()}</span>
      <span>By: ${esc(issue.createdBy.name)}</span>
      ${issue.expectedResolutionDate ? `<span>Expected resolution: ${esc(issue.expectedResolutionDate)}</span>` : ''}
      <span>Status: ${esc(issue.status)}</span>
    </div>
    ${canManage && issue.status !== 'closed' ? `<form method="POST" action="/issues/${issue.id}/close"><button>Close</button></form>` : ''}
  </article>`;
}

function createIssueForm() {
  return `<details class="panel create-issue"><summary>Add known issue</summary>
  <form method="POST" action="/issues">
    <label>Title <input name="title" required maxlength="120" /></label>
    <label>Description <textarea name="description" required maxlength="2000"></textarea></label>
    <label>Tags (comma separated) <input name="tags" placeholder="network, printer, microsoft365" /></label>
    <label>Expected resolution date (optional) <input type="date" name="expectedResolutionDate" /></label>
    <label><input type="checkbox" name="isNew" value="1" checked /> Mark as new</label>
    <label><input type="checkbox" name="isHighImportance" value="1" /> High importance</label>
    <button>Create issue</button>
  </form></details>`;
}

function homePage({ issues, tags, currentTag, user, status, settings }) {
  const canPost = user && ['admin', 'author'].includes(user.role);
  const canManage = canPost;
  const tagOptions = ['<option value="">All tags</option>', ...tags.map((t) => `<option ${t === currentTag ? 'selected' : ''} value="${esc(t)}">${esc(t)}</option>`)].join('');

  return layout({
    title: 'Board',
    user,
    settings,
    body: `
      <section class="toolbar">
        <form method="GET" action="/">
          <select name="tag">${tagOptions}</select>
          <select name="status">
            <option value="open" ${status !== 'all' ? 'selected' : ''}>Open only</option>
            <option value="all" ${status === 'all' ? 'selected' : ''}>All</option>
          </select>
          <button>Filter</button>
        </form>
      </section>
      <section class="cards">${issues.map((i) => issueCard(i, canManage)).join('') || '<p>No issues posted yet.</p>'}</section>
      ${canPost ? createIssueForm() : ''}
      ${user && user.role === 'admin' ? '<p><a href="/admin">Open admin backend</a></p>' : ''}
    `
  });
}

function loginPage(mode, error, settings) {
  const body = mode === 'azure'
    ? `<section class="panel"><h2>Sign in with Azure AD SSO</h2><a class="btn" href="/auth/login">Continue with Microsoft</a></section>`
    : `<section class="panel"><h2>Local sign in (development)</h2>
      ${error ? '<p class="error">Invalid credentials.</p>' : ''}
      <form method="POST" action="/auth/local">
      <label>Email <input type="email" name="email" required /></label>
      <label>Password <input type="password" name="password" required /></label>
      <button>Login</button></form></section>`;
  return layout({ title: 'Login', user: null, body, settings });
}

function detailsPage({ issue, comments, user, settings }) {
  const canComment = Boolean(user);
  const canManage = user && ['admin', 'author'].includes(user.role);
  return layout({
    title: issue.title,
    user,
    settings,
    body: `<article class="panel">
      <h2>${esc(issue.title)}</h2>
      <p>${esc(issue.description)}</p>
      <p>Created by ${esc(issue.createdBy.name)} (${esc(issue.createdBy.email)}) on ${new Date(issue.createdAt).toLocaleString()}</p>
      <p>Tags: ${issue.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</p>
      <p>Status: ${esc(issue.status)}</p>
      ${issue.expectedResolutionDate ? `<p>Expected resolution date: ${esc(issue.expectedResolutionDate)}</p>` : ''}
      ${issue.isOverdue ? '<p><strong>This issue is overdue and is automatically marked high importance.</strong></p>' : ''}
      ${canManage && issue.status !== 'closed' ? `<form method="POST" action="/issues/${issue.id}/close"><button>Close issue</button></form>` : ''}
    </article>
    <section class="panel"><h3>Comments</h3>
      ${comments.map((c) => `<div class="comment"><p>${esc(c.message)}</p><small>${esc(c.createdBy.name)} · ${new Date(c.createdAt).toLocaleString()}</small></div>`).join('') || '<p>No comments yet.</p>'}
      ${canComment ? `<form method="POST" action="/issues/${issue.id}/comments"><label>Add comment <textarea name="message" required maxlength="1200"></textarea></label><button>Post comment</button></form>` : '<p>Please log in to comment.</p>'}
    </section>`
  });
}

function adminPage({ issues, user, settings }) {
  return layout({
    title: 'Admin Backend',
    user,
    settings,
    body: `<section class="panel"><h2>Admin backend</h2><p>Edit issue metadata, priority and sort order.</p>
    <h3>Branding & Theme</h3>
    <form method="POST" action="/admin/theme">
      <label>Header background <input type="color" name="headerBg" value="${esc(settings.theme?.headerBg || '#1f4a78')}" /></label>
      <label>Page background <input type="color" name="pageBg" value="${esc(settings.theme?.pageBg || '#f4f6f9')}" /></label>
      <label>Accent/button color <input type="color" name="accent" value="${esc(settings.theme?.accent || '#1f4a78')}" /></label>
      <button>Save theme</button>
    </form>
    <form method="POST" action="/admin/logo" enctype="multipart/form-data">
      <label>Upload logo image <input type="file" name="logo" accept="image/*" /></label>
      <button>Upload logo</button>
    </form>
    <form method="POST" action="/admin/logo/clear"><button type="submit">Remove logo</button></form>
    ${issues.map((i) => `<form method="POST" action="/admin/issues/${i.id}"><h3>${esc(i.title)}</h3>
      <label>Status <select name="status"><option ${i.status === 'open' ? 'selected' : ''} value="open">open</option><option ${i.status === 'closed' ? 'selected' : ''} value="closed">closed</option></select></label>
      <label><input type="checkbox" name="isNew" value="1" ${i.isNew ? 'checked' : ''} /> New</label>
      <label><input type="checkbox" name="isHighImportance" value="1" ${i.isHighImportance ? 'checked' : ''} /> High importance</label>
      <label>Expected resolution date <input type="date" name="expectedResolutionDate" value="${esc(i.expectedResolutionDate || '')}" /></label>
      <label>Tags <input name="tags" value="${esc(i.tags.join(', '))}" /></label>
      <button>Save</button>
    </form>`).join('')}
    <h3>Reorder</h3>
    <form method="POST" action="/admin/reorder"><textarea name="orderedIds" rows="6">${issues.map((i) => i.id).join('\n')}</textarea><button>Apply order</button></form>
    </section>`
  });
}

module.exports = { homePage, loginPage, detailsPage, adminPage };
