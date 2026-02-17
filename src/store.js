const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function nowIso() {
  return new Date().toISOString();
}

function isOverdue(issue) {
  if (!issue.expectedResolutionDate || issue.status === 'closed') return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(issue.expectedResolutionDate) < today;
}

function withDerived(issue) {
  const overdue = isOverdue(issue);
  return {
    ...issue,
    isOverdue: overdue,
    isHighImportance: issue.isHighImportance || overdue
  };
}

class Store {
  constructor(filePath) {
    this.filePath = filePath;
    this.ensure();
  }

  ensure() {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      const initial = {
        issues: [],
        comments: [],
        issueOrder: [],
        settings: {
          logoDataUrl: '',
          theme: { headerBg: '#1f4a78', pageBg: '#f4f6f9', accent: '#1f4a78' }
        }
      };
      fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2));
    }
  }

  read() {
    const data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
    if (!data.settings) {
      data.settings = { logoDataUrl: '', theme: { headerBg: '#1f4a78', pageBg: '#f4f6f9', accent: '#1f4a78' } };
    }
    if (!data.settings.theme) data.settings.theme = { headerBg: '#1f4a78', pageBg: '#f4f6f9', accent: '#1f4a78' };
    return data;
  }

  write(data) {
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }

  listIssues(filters = {}) {
    const db = this.read();
    const activeOnly = filters.status !== 'all';
    let issues = db.issues.map(withDerived).filter((i) => (activeOnly ? i.status !== 'closed' : true));
    if (filters.tag) {
      issues = issues.filter((i) => i.tags.includes(filters.tag.toLowerCase()));
    }
    const index = new Map(db.issueOrder.map((id, idx) => [id, idx]));
    return issues.sort((a, b) => {
      if (a.isHighImportance !== b.isHighImportance) return a.isHighImportance ? -1 : 1;
      if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
      const ai = index.has(a.id) ? index.get(a.id) : Number.MAX_SAFE_INTEGER;
      const bi = index.has(b.id) ? index.get(b.id) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
  }

  getIssue(id) {
    const db = this.read();
    const issue = db.issues.find((i) => i.id === id);
    if (!issue) return null;
    const comments = db.comments
      .filter((c) => c.issueId === id)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    return { issue: withDerived(issue), comments };
  }

  createIssue(payload, user) {
    const db = this.read();
    const issue = {
      id: crypto.randomUUID(),
      title: payload.title,
      description: payload.description,
      tags: payload.tags,
      status: 'open',
      isNew: payload.isNew,
      isHighImportance: payload.isHighImportance,
      expectedResolutionDate: payload.expectedResolutionDate || null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: { id: user.id, name: user.name, email: user.email }
    };
    db.issues.push(issue);
    db.issueOrder.unshift(issue.id);
    this.write(db);
    return withDerived(issue);
  }

  updateIssue(id, updates) {
    const db = this.read();
    const idx = db.issues.findIndex((i) => i.id === id);
    if (idx === -1) return null;
    db.issues[idx] = {
      ...db.issues[idx],
      ...updates,
      tags: updates.tags || db.issues[idx].tags,
      updatedAt: nowIso()
    };
    this.write(db);
    return withDerived(db.issues[idx]);
  }

  closeIssue(id) {
    return this.updateIssue(id, { status: 'closed', isNew: false });
  }

  addComment(issueId, message, user) {
    const db = this.read();
    const issue = db.issues.find((i) => i.id === issueId);
    if (!issue) return null;
    const comment = {
      id: crypto.randomUUID(),
      issueId,
      message,
      createdAt: nowIso(),
      createdBy: { id: user.id, name: user.name, email: user.email }
    };
    db.comments.push(comment);
    this.write(db);
    return comment;
  }

  reorder(issueIds) {
    const db = this.read();
    const set = new Set(db.issues.map((i) => i.id));
    db.issueOrder = issueIds.filter((id) => set.has(id));
    const missing = db.issues.map((i) => i.id).filter((id) => !db.issueOrder.includes(id));
    db.issueOrder.push(...missing);
    this.write(db);
    return db.issueOrder;
  }

  tags() {
    const db = this.read();
    return [...new Set(db.issues.flatMap((i) => i.tags))].sort();
  }

  getSettings() {
    return this.read().settings;
  }

  updateTheme(theme) {
    const db = this.read();
    db.settings.theme = {
      ...db.settings.theme,
      ...theme
    };
    this.write(db);
    return db.settings;
  }

  setLogoDataUrl(logoDataUrl) {
    const db = this.read();
    db.settings.logoDataUrl = logoDataUrl;
    this.write(db);
    return db.settings;
  }
}

module.exports = { Store };
