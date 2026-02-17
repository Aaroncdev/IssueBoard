function esc(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function layout({ title, user, body }) {
  const auth = user
    ? `<div class="user-meta">${esc(user.name)} (${esc(user.role)}) · <a href="/logout">Logout</a></div>`
    : '<a class="btn" href="/login">Login</a>';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} - ICT Issue Board</title>
<link rel="stylesheet" href="/style.css" />
</head>
<body>
<header><h1><a href="/">ICT Notice Board</a></h1>${auth}</header>
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
      ${issue.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}
      <span>Created: ${new Date(issue.createdAt).toLocaleString()}</span>
      <span>By: ${esc(issue.createdBy.name)}</span>
      ${issue.dueDate ? `<span>Due: ${esc(issue.dueDate)}</span>` : ''}
      <span>Status: ${esc(issue.status)}</span>
    </div>
    ${canManage && issue.status !== 'closed' ? `<form method="POST" action="/issues/${issue.id}/close"><button>Close</button></form>` : ''}
  </article>`;
}

function homePage({ issues, tags, currentTag, user, status }) {
  const canPost = user && ['admin', 'author'].includes(user.role);
  const canManage = canPost;
  const tagOptions = ['<option value="">All tags</option>', ...tags.map((t) => `<option ${t === currentTag ? 'selected' : ''} value="${esc(t)}">${esc(t)}</option>`)].join('');

  return layout({
    title: 'Board',
    user,
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
      ${canPost ? createIssueForm() : ''}
      <section class="cards">${issues.map((i) => issueCard(i, canManage)).join('') || '<p>No issues posted yet.</p>'}</section>
      ${user && user.role === 'admin' ? '<p><a href="/admin">Open admin backend</a></p>' : ''}
    `
  });
}

function createIssueForm() {
  return `<section class="panel"><h2>Post known issue</h2>
  <form method="POST" action="/issues">
    <label>Title <input name="title" required maxlength="120" /></label>
    <label>Description <textarea name="description" required maxlength="2000"></textarea></label>
    <label>Tags (comma separated) <input name="tags" placeholder="network, printer, microsoft365" /></label>
    <label>Due date <input type="date" name="dueDate" /></label>
    <label><input type="checkbox" name="isNew" value="1" checked /> Mark as new</label>
    <label><input type="checkbox" name="isHighImportance" value="1" /> High importance</label>
    <button>Create issue</button>
  </form></section>`;
}

function loginPage(mode, error) {
  const body = mode === 'azure'
    ? `<section class="panel"><h2>Sign in with Azure AD SSO</h2><a class="btn" href="/auth/login">Continue with Microsoft</a></section>`
    : `<section class="panel"><h2>Local sign in (development)</h2>
      ${error ? '<p class="error">Invalid credentials.</p>' : ''}
      <form method="POST" action="/auth/local">
      <label>Email <input type="email" name="email" required /></label>
      <label>Password <input type="password" name="password" required /></label>
      <button>Login</button></form></section>`;
  return layout({ title: 'Login', user: null, body });
}

function detailsPage({ issue, comments, user }) {
  const canComment = Boolean(user);
  const canManage = user && ['admin', 'author'].includes(user.role);
  return layout({
    title: issue.title,
    user,
    body: `<article class="panel">
      <h2>${esc(issue.title)}</h2>
      <p>${esc(issue.description)}</p>
      <p>Created by ${esc(issue.createdBy.name)} (${esc(issue.createdBy.email)}) on ${new Date(issue.createdAt).toLocaleString()}</p>
      <p>Tags: ${issue.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join(' ')}</p>
      <p>Status: ${esc(issue.status)}</p>
      ${canManage && issue.status !== 'closed' ? `<form method="POST" action="/issues/${issue.id}/close"><button>Close issue</button></form>` : ''}
    </article>
    <section class="panel"><h3>Comments</h3>
      ${comments.map((c) => `<div class="comment"><p>${esc(c.message)}</p><small>${esc(c.createdBy.name)} · ${new Date(c.createdAt).toLocaleString()}</small></div>`).join('') || '<p>No comments yet.</p>'}
      ${canComment ? `<form method="POST" action="/issues/${issue.id}/comments"><label>Add comment <textarea name="message" required maxlength="1200"></textarea></label><button>Post comment</button></form>` : '<p>Please log in to comment.</p>'}
    </section>`
  });
}

function adminPage({ issues, user }) {
  return layout({
    title: 'Admin Backend',
    user,
    body: `<section class="panel"><h2>Admin backend</h2><p>Edit issue metadata, priority and sort order.</p>
    ${issues.map((i) => `<form method="POST" action="/admin/issues/${i.id}"><h3>${esc(i.title)}</h3>
      <label>Status <select name="status"><option ${i.status === 'open' ? 'selected' : ''} value="open">open</option><option ${i.status === 'closed' ? 'selected' : ''} value="closed">closed</option></select></label>
      <label><input type="checkbox" name="isNew" value="1" ${i.isNew ? 'checked' : ''} /> New</label>
      <label><input type="checkbox" name="isHighImportance" value="1" ${i.isHighImportance ? 'checked' : ''} /> High importance</label>
      <label>Tags <input name="tags" value="${esc(i.tags.join(', '))}" /></label>
      <button>Save</button>
    </form>`).join('')}
    <h3>Reorder</h3>
    <form method="POST" action="/admin/reorder"><textarea name="orderedIds" rows="6">${issues.map((i) => i.id).join('\n')}</textarea><button>Apply order</button></form>
    </section>`
  });
}

module.exports = { homePage, loginPage, detailsPage, adminPage };
