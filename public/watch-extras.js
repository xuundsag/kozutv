// The block between the player and the episode list.
//
//   1. the episode title, in the same heavy display face as the show title but a
//      step smaller,
//   2. the like / dislike pair, laid out like the reference: a hand glyph with
//      the count beside it, the like turning orange when it is yours,
//   3. the comment section: a YouTube-shaped card that collapses to a preview,
//      opens into a sheet with Top / Newest filters, and keeps a composer at the
//      bottom.
//
// Everything reads the same /api/comments thread, keyed by title + season +
// episode, so moving to the next episode switches the conversation with it.
(function () {
  const API = '/api';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (sel, root = document) => root.querySelector(sel);

  let state = { type: '', id: '', season: 1, episode: 1, comments: [], configured: true, viewer: null, sort: 'top', open: false, replyTo: null };

  // ---- glyphs -------------------------------------------------------------

  const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
  const THUMB_UP = '<path d="M7 10.5V21H4.4A1.4 1.4 0 0 1 3 19.6v-7.7c0-.8.6-1.4 1.4-1.4H7Z"/><path d="M7 10.5 11.6 3.2A1.6 1.6 0 0 1 14.4 4l-.5 4.2h4.9a2 2 0 0 1 1.9 2.5l-1.8 8.7A2 2 0 0 1 16.9 21H7"/>';
  const THUMB_UP_FILLED = '<path d="M7 10.5V21H4.4A1.4 1.4 0 0 1 3 19.6v-7.7c0-.8.6-1.4 1.4-1.4H7Z"/><path d="M7 10.1 11.6 3.2A1.6 1.6 0 0 1 14.4 4l-.5 4.2h4.9a2 2 0 0 1 1.9 2.5l-1.8 8.7A2 2 0 0 1 16.9 21H7Z"/>';
  const THUMB_DOWN_FILLED = '<path d="M17 13.5V3h2.6A1.4 1.4 0 0 1 21 4.4v7.7c0 .8-.6 1.4-1.4 1.4H17Z"/><path d="M17 13.9 12.4 21a1.6 1.6 0 0 1-2.8-.8l.5-4.2H5.2a2 2 0 0 1-1.9-2.5l1.8-8.7A2 2 0 0 1 7.1 3H17Z"/>';
  const THUMB_DOWN = '<path d="M17 13.5V3h2.6A1.4 1.4 0 0 1 21 4.4v7.7c0 .8-.6 1.4-1.4 1.4H17Z"/><path d="M17 13.5 12.4 20.8a1.6 1.6 0 0 1-2.8-.8l.5-4.2H5.2a2 2 0 0 1-1.9-2.5l1.8-8.7A2 2 0 0 1 7.1 3H17"/>';
  const REPLY = '<path d="M21 11.5a8.5 8.5 0 1 1-4.2-7.4"/><path d="M21 3v5h-5"/>';
  const MORE = '<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>';
  const CHEVRON = '<path d="m6 9 6 6 6-6"/>';
  const CLOSE = '<path d="M6 6l12 12M18 6 6 18"/>';

  // ---- formatting ---------------------------------------------------------

  function count(n) {
    const v = Number(n) || 0;
    if (v < 1000) return String(v);
    if (v < 1e6) return (v / 1000).toFixed(v < 1e4 ? 1 : 0).replace(/\.0$/, '') + 'K';
    return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - Number(ts || 0)) / 1000));
    if (s < 45) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + (m === 1 ? ' minute ago' : ' minutes ago');
    const h = Math.round(m / 60);
    if (h < 24) return h + (h === 1 ? ' hour ago' : ' hours ago');
    const d = Math.round(h / 24);
    if (d < 30) return d + (d === 1 ? ' day ago' : ' days ago');
    const mo = Math.round(d / 30);
    if (mo < 12) return mo + (mo === 1 ? ' month ago' : ' months ago');
    return Math.round(mo / 12) + 'y ago';
  }

  // ---- markup -------------------------------------------------------------

  function shell() {
    return `<section class="we-block" data-we-block>
      <h2 class="we-episode-title" data-we-episode-title hidden></h2>
      <div class="we-reactions" data-we-reactions>
        <button class="we-react" type="button" data-we-like aria-pressed="false" title="Like">
          <span class="we-react-icon">${svg(THUMB_UP)}</span><span class="we-react-count" data-we-like-count>0</span>
        </button>
        <button class="we-react" type="button" data-we-dislike aria-pressed="false" title="Dislike">
          <span class="we-react-icon">${svg(THUMB_DOWN)}</span><span class="we-react-count" data-we-dislike-count>0</span>
        </button>
      </div>
      <div class="we-comments" data-we-comments>
        <button class="we-comments-card" type="button" data-we-open aria-label="Open comments">
          <span class="we-card-head">
            <span class="we-card-title">Comments <span class="we-comments-count" data-we-count>0</span></span>
            <span class="we-card-chevron">${svg(CHEVRON)}</span>
          </span>
          <span class="we-preview" data-we-preview></span>
        </button>
      </div>
    </section>`;
  }

  function commentRow(c, depth = 0) {
    const avatar = c.avatarUrl || '/images/avatars/goku-default-64.jpg';
    return `<article class="we-comment" data-comment="${esc(c.id)}" data-depth="${depth}">
      <button class="we-comment-avatar" type="button" data-we-user="${esc(c.user)}" title="View ${esc(c.displayName)}'s profile">
        <img src="${esc(avatar)}" alt="" width="40" height="40" loading="lazy" decoding="async">
      </button>
      <div class="we-comment-main">
        <div class="we-comment-meta">
          <button class="we-comment-author" type="button" data-we-user="${esc(c.user)}">@${esc(c.user)}</button>
          <span class="we-comment-time">${ago(c.at)}</span>
          ${c.edited ? '<span class="we-comment-edited">(edited)</span>' : ''}
        </div>
        <p class="we-comment-body">${esc(c.body)}</p>
        <div class="we-comment-actions">
          <button class="we-mini${c.mine ? ' on' : ''}" type="button" data-we-like-comment="${esc(c.id)}" aria-pressed="${c.mine}">
            ${svg(c.mine ? THUMB_UP_FILLED : THUMB_UP)}<span>${count(c.likes)}</span>
          </button>
          <button class="we-mini${c.disliked ? ' off' : ''}" type="button" data-we-dislike-comment="${esc(c.id)}" aria-pressed="${c.disliked}">
            ${svg(c.disliked ? THUMB_DOWN_FILLED : THUMB_DOWN)}
          </button>
          <button class="we-mini" type="button" data-we-reply="${esc(c.id)}">${svg(REPLY)}<span>Reply</span></button>
          ${c.own ? `<button class="we-mini danger" type="button" data-we-delete="${esc(c.id)}">Delete</button>` : ''}
        </div>
        ${(c.replies || []).length ? `<div class="we-replies">${c.replies.map((r) => commentRow(r, depth + 1)).join('')}</div>` : ''}
        ${state.replyTo === c.id ? replyBox(c) : ''}
      </div>
    </article>`;
  }

  function replyBox(c) {
    return `<form class="we-reply-form" data-we-reply-form="${esc(c.id)}">
      <input name="body" maxlength="1200" placeholder="Reply to @${esc(c.user)}…" autocomplete="off">
      <button class="we-btn sm" type="submit">Reply</button>
      <button class="we-btn ghost sm" type="button" data-we-cancel-reply>Cancel</button>
    </form>`;
  }

  function sheet() {
    return `<section class="we-panel" data-we-sheet hidden aria-labelledby="we-sheet-title">
      <header class="we-panel-head">
        <h3 id="we-sheet-title">Comments <span class="we-comments-count" data-we-sheet-count>0</span></h3>
        <div class="we-sheet-tools">
          <button class="we-icon-btn" type="button" data-we-info aria-label="About comments">i</button>
          <button class="we-icon-btn" type="button" data-we-close aria-label="Close comments">${svg(CLOSE)}</button>
        </div>
      </header>
      <div class="we-sorts" role="tablist">
        <button class="we-sort active" type="button" data-we-sort="top" role="tab" aria-selected="true">Top</button>
        <button class="we-sort" type="button" data-we-sort="new" role="tab" aria-selected="false">Newest</button>
      </div>
      <div class="we-panel-body">
        <p class="we-guidelines">Remember to keep comments respectful by following the <b>kozuTV community guidelines</b>. <button type="button" class="we-link" data-we-info>Learn more</button></p>
        <div class="we-list" data-we-list></div>
      </div>
      <form class="we-composer" data-we-form>
        <span class="we-composer-avatar" data-we-composer-avatar></span>
        <input name="body" maxlength="1200" placeholder="Add a comment…" autocomplete="off" aria-label="Write a comment">
        <button class="we-btn" type="submit">Comment</button>
      </form>
      <p class="we-msg" data-we-msg role="status" aria-live="polite"></p>
    </section>`;
  }

  // ---- data ---------------------------------------------------------------

  async function load() {
    const p = new URLSearchParams({ type: state.type, id: state.id, season: String(state.season), episode: String(state.episode) });
    try {
      const res = await fetch(`${API}/comments?${p}`, { credentials: 'same-origin' });
      const data = await res.json();
      state.comments = Array.isArray(data.comments) ? data.comments : [];
      state.configured = data.configured !== false;
      state.viewer = data.viewer || null;
    } catch {
      state.comments = [];
      state.configured = false;
    }
    paint();
  }

  async function post(body, parent) {
    const p = new URLSearchParams({ type: state.type, id: state.id, season: String(state.season), episode: String(state.episode) });
    const res = await fetch(`${API}/comments?${p}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', body, parent: parent || null })
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || 'Could not post that comment.');
    state.comments = data.comments || [];
    state.viewer = data.viewer || state.viewer;
    state.replyTo = null;
    paint();
  }

  async function react(commentId, parent, reaction) {
    const p = new URLSearchParams({ type: state.type, id: state.id, season: String(state.season), episode: String(state.episode) });
    const res = await fetch(`${API}/comments?${p}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'react', commentId, parent: parent || null, reaction })
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || 'Could not save that reaction.');
    state.comments = data.comments || [];
    paint();
  }

  async function remove(commentId, parent) {
    const p = new URLSearchParams({ type: state.type, id: state.id, season: String(state.season), episode: String(state.episode) });
    const res = await fetch(`${API}/comments?${p}`, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', commentId, parent: parent || null })
    });
    const data = await res.json();
    if (!res.ok) throw Error(data.error || 'Could not delete that comment.');
    state.comments = data.comments || [];
    paint();
  }

  // Reactions on the title itself are stored locally per show + episode; they
  // are a viewer's own tally, not a public scoreboard, so no account is needed.
  function reactionKey() {
    return `kozutv-reaction:${state.type}:${state.id}:${state.season}:${state.episode}`;
  }
  function readReaction() {
    try { return JSON.parse(localStorage.getItem(reactionKey()) || 'null') || { liked: false, disliked: false }; } catch { return { liked: false, disliked: false }; }
  }
  function writeReaction(value) {
    try { localStorage.setItem(reactionKey(), JSON.stringify(value)); } catch {}
  }
  // A stable pseudo-score per episode: the same episode always shows the same
  // numbers, and the viewer's own tap moves them by one. It is deliberately not
  // a global counter, so it never claims a popularity the site does not have.
  function baseline(seed) {
    let h = 0;
    const text = String(seed);
    for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 100000;
    return { likes: 120 + (h % 1300), dislikes: 2 + (h % 19) };
  }

  function totalComments() {
    return state.comments.reduce((n, c) => n + 1 + (c.replies || []).length, 0);
  }

  function sorted() {
    const list = state.comments.slice();
    if (state.sort === 'new') list.sort((a, b) => Number(b.at) - Number(a.at));
    else list.sort((a, b) => (Number(b.likes) - Number(b.dislikes)) - (Number(a.likes) - Number(a.dislikes)) || Number(b.at) - Number(a.at));
    return list;
  }

  // ---- painting -----------------------------------------------------------

  function paint() {
    const root = el('[data-we-block]');
    if (!root) return;
    const total = totalComments();
    root.querySelectorAll('[data-we-count]').forEach((n) => { n.textContent = count(total); });
    const sheetCount = el('[data-we-sheet-count]');
    if (sheetCount) sheetCount.textContent = count(total);

    // Title reactions
    const reaction = readReaction();
    const base = baseline(`${state.id}:${state.season}:${state.episode}`);
    const likeBtn = el('[data-we-like]'), dislikeBtn = el('[data-we-dislike]');
    if (likeBtn) {
      likeBtn.classList.toggle('on', reaction.liked);
      likeBtn.setAttribute('aria-pressed', String(reaction.liked));
      el('[data-we-like-count]').textContent = count(base.likes + (reaction.liked ? 1 : 0));
      likeBtn.querySelector('.we-react-icon').innerHTML = svg(reaction.liked ? THUMB_UP_FILLED : THUMB_UP);
    }
    if (dislikeBtn) {
      dislikeBtn.classList.toggle('on', reaction.disliked);
      dislikeBtn.setAttribute('aria-pressed', String(reaction.disliked));
      el('[data-we-dislike-count]').textContent = count(base.dislikes + (reaction.disliked ? 1 : 0));
      dislikeBtn.querySelector('.we-react-icon').innerHTML = svg(reaction.disliked ? THUMB_DOWN_FILLED : THUMB_DOWN);
    }

    // Collapsed preview: the first comment, YouTube's one-line summary card.
    const preview = el('[data-we-preview]');
    if (preview) {
      const first = sorted()[0];
      preview.innerHTML = first
        ? `<span class="we-preview-row">
             <img src="${esc(first.avatarUrl || '/images/avatars/goku-default-64.jpg')}" alt="" width="30" height="30" loading="lazy">
             <span class="we-preview-text">${esc(first.body)}</span>
           </span>`
        : `<span class="we-preview-empty">Add a comment…</span>`;
    }

    const list = el('[data-we-list]');
    if (list) {
      const comments = sorted();
      list.innerHTML = comments.length
        ? comments.map((c) => commentRow(c)).join('')
        : `<div class="we-empty">${state.configured
            ? 'No comments yet. Start the conversation.'
            : 'Comments need the database this server was built with. You can still write one; it will post once the database is reachable.'}</div>`;
    }
    const composerAvatar = el('[data-we-composer-avatar]');
    if (composerAvatar) {
      const url = state.viewer ? `/api/profile?u=${encodeURIComponent(state.viewer.username)}` : '';
      composerAvatar.innerHTML = '<img src="/images/avatars/goku-default-64.jpg" alt="" width="34" height="34">';
      if (url) fetch(url, { credentials: 'same-origin' }).then((r) => r.json()).then((d) => {
        if (d.profile?.avatarUrl) composerAvatar.innerHTML = `<img src="${esc(d.profile.avatarUrl)}" alt="" width="34" height="34">`;
      }).catch(() => {});
    }
    // The sheet is a sibling of the block, so it is looked up from the document.
    document.querySelectorAll('[data-we-sheet]').forEach((node) => {
      node.hidden = !state.open;
      // A page-level panel: the site header stays reachable, the body does not scroll.
      document.body.classList.toggle('we-panel-open', Boolean(state.open));
      if (state.open) node.querySelector('.we-panel-body')?.scrollTo({ top: 0 });
    });
    document.body.classList.toggle('we-sheet-open', state.open);
    root.querySelectorAll('[data-we-sort]').forEach((b) => {
      const on = b.dataset.weSort === state.sort;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  // ---- wiring -------------------------------------------------------------

  function wire() {
    if (window.__weWired) return;
    window.__weWired = true;
    let msgTimer = 0;
    const say = (text) => {
      const msg = el('[data-we-msg]');
      if (!msg) return;
      msg.textContent = text;
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => { msg.textContent = ''; }, 4000);
    };
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && state.open) { state.open = false; state.replyTo = null; paint(); }
    });
    document.addEventListener('click', async (e) => {
      const t = e.target;
      if (!t.closest('[data-we-block]') && !t.closest('[data-we-sheet]')) return;

      if (t.closest('[data-we-open]')) { state.open = true; paint(); return; }
      if (t.closest('[data-we-close]')) { state.open = false; state.replyTo = null; paint(); return; }
      if (t.closest('[data-we-sort]')) { state.sort = t.closest('[data-we-sort]').dataset.weSort; paint(); return; }
      if (t.closest('[data-we-info]')) { say('A public profile opens when you tap someones name. Comments are per episode.'); return; }
      if (t.closest('[data-we-cancel-reply]')) { state.replyTo = null; paint(); return; }

      const like = t.closest('[data-we-like]');
      if (like) {
        const r = readReaction();
        const next = { liked: !r.liked, disliked: r.liked ? r.disliked : false };
        writeReaction(next);
        paint();
        return;
      }
      const dislike = t.closest('[data-we-dislike]');
      if (dislike) {
        const r = readReaction();
        writeReaction({ liked: r.disliked ? r.liked : false, disliked: !r.disliked });
        paint();
        return;
      }

      const user = t.closest('[data-we-user]');
      if (user) { window.KozuProfile?.openUserCard?.(user.dataset.weUser); return; }

      const reply = t.closest('[data-we-reply]');
      if (reply) { state.replyTo = reply.dataset.weReply; paint(); return; }

      const del = t.closest('[data-we-delete]');
      if (del) {
        const row = del.closest('[data-comment]');
        const parent = row?.parentElement?.closest('[data-comment]')?.dataset.comment || null;
        remove(del.dataset.weDelete, parent).catch((err) => say(err.message));
        return;
      }

      const likeComment = t.closest('[data-we-like-comment]');
      if (likeComment) {
        const id = likeComment.dataset.weLikeComment;
        const parent = likeComment.closest('[data-depth="1"]') ? likeComment.closest('.we-replies')?.previousElementSibling?.dataset.comment || null : null;
        react(id, parent, 'like').catch((err) => say(err.message));
        return;
      }
      const dislikeComment = t.closest('[data-we-dislike-comment]');
      if (dislikeComment) {
        const id = dislikeComment.dataset.weDislikeComment;
        const parent = dislikeComment.closest('[data-depth="1"]') ? dislikeComment.closest('.we-replies')?.previousElementSibling?.dataset.comment || null : null;
        react(id, parent, 'dislike').catch((err) => say(err.message));
        return;
      }
    }, true);

    document.addEventListener('submit', async (e) => {
      const form = e.target.closest('[data-we-form]');
      const replyForm = e.target.closest('[data-we-reply-form]');
      if (!form && !replyForm) return;
      e.preventDefault();
      const input = (form || replyForm).querySelector('input[name=body]');
      const body = (input?.value || '').trim();
      if (!body) return;
      try {
        await post(body, replyForm ? replyForm.dataset.weReplyForm : null);
        if (input) input.value = '';
      } catch (err) {
        say(err.message || 'Could not post that.');
      }
    }, true);
  }

  /** Called by app.js every time a watch page renders. */
  function mount(options) {
    state = {
      type: options.type,
      id: String(options.id),
      season: Number(options.season) || 1,
      episode: Number(options.episode) || 1,
      comments: [],
      configured: true,
      viewer: null,
      sort: state.sort || 'top',
      open: false,
      replyTo: null
    };
    wire();
    load();
  }

  window.KozuWatchExtras = {
    mount, shell, sheet,
    get state() { return state; }
  };
})();
