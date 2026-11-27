// Discord-shaped profiles for kozuTV.
//
// Three surfaces, all built from the same data:
//   * the account popup under the header portrait (identity card + rows),
//   * the full profile page (/profile) with the banner, avatar, bio, stats and
//     the picture/banner editor,
//   * the public card (/u/<name>, and the popup that opens from a comment
//     author) which shows any visitor another person's banner, avatar, bio and
//     their friends.
//
// The look follows Discord's profile exactly: a banner with a circular avatar
// hanging over its lower edge, name over handle, "ABOUT ME" in small caps above
// the bio, then the member rows.
(function () {
  const API = '/api';
  const BIO_LIMIT = 260;

  const js = (o) => JSON.stringify(o);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const el = (sel, root = document) => root.querySelector(sel);

  async function api(path, options) {
    const res = await fetch(API + path, { credentials: 'same-origin', ...options });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Error(data.error || 'That did not work.');
    return data;
  }

  // ---- shared pieces -------------------------------------------------------

  function bannerStyle(profile) {
    const url = profile && profile.bannerUrl ? profile.bannerUrl : '';
    return url ? ` style="background-image:url('${esc(url)}')"` : '';
  }

  function avatarBlock(profile, size) {
    const url = profile && profile.avatarUrl ? profile.avatarUrl : '/images/avatars/goku-default-160.jpg';
    return `<span class="pf-avatar" style="--pf-avatar-size:${size}px"><img src="${esc(url)}" alt="" width="${size}" height="${size}" loading="eager" decoding="async"></span>`;
  }

  function statLine(profile) {
    const stats = profile?.stats || {};
    const eps = Number(stats.episodesWatched) || 0;
    const list = Number(stats.watchlist) || 0;
    return `<div class="pf-stats">
      <span><b>${eps}</b> ${eps === 1 ? 'episode' : 'episodes'} watched</span>
      <span><b>${list}</b> on the watchlist</span>
    </div>`;
  }

  function sinceLine(profile) {
    if (!profile?.createdAt) return '';
    const d = new Date(profile.createdAt);
    return `<div class="pf-since">Member since ${d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>`;
  }

  function bioBlock(profile) {
    const bio = String(profile?.bio || '').trim();
    return bio
      ? `<div class="pf-section"><h4>About me</h4><p class="pf-bio">${esc(bio)}</p></div>`
      : `<div class="pf-section"><h4>About me</h4><p class="pf-bio empty">No bio yet.</p></div>`;
  }

  // ---- the full profile card ----------------------------------------------

  function profileCard(profile, viewer, options = {}) {
    const mine = Boolean(profile?.self || (viewer && viewer.username === profile?.username));
    const name = profile?.displayName || profile?.username || 'Member';
    const accent = profile?.accent ? ` style="--pf-accent:${esc(profile.accent)}"` : '';
    return `<article class="pf-card${mine ? ' is-mine' : ''}"${accent} data-profile-card data-username="${esc(profile?.username || '')}">
      <div class="pf-banner"${bannerStyle(profile)}>
        <div class="pf-banner-empty">No banner yet</div>
        ${mine ? `<button class="pf-banner-edit" type="button" data-pf-edit-banner title="Change banner">${gearIcon()}<span>Change banner</span></button>` : ''}
      </div>
      <div class="pf-body">
        <div class="pf-avatar-row">
          ${avatarBlock(profile, 104)}
          ${mine
            ? `<div class="pf-own-actions">
                 <button class="pf-btn ghost" type="button" data-pf-edit-avatar>Change avatar</button>
                 <button class="pf-btn" type="button" data-pf-edit>Edit profile</button>
               </div>`
            : `<div class="pf-own-actions" data-pf-friend-slot></div>`}
        </div>
        <div class="pf-identity">
          <h2 class="pf-name">${esc(name)}</h2>
          <div class="pf-handle">@${esc(profile?.username || '')}</div>
        </div>
        ${statLine(profile)}
        ${bioBlock(profile)}
        ${sinceLine(profile)}
        ${options.friendsSlot ? '<div class="pf-friends-slot" data-pf-friends></div>' : ''}
      </div>
    </article>`;
  }

  // ---- the editor ---------------------------------------------------------

  function editorMarkup(profile) {
    const accents = ['', '#ff731c', '#e8412f', '#f0b429', '#2fd07a', '#25b7d3', '#5865f2', '#a855f7', '#eb459e'];
    return `<div class="pf-modal" data-pf-modal hidden>
      <div class="pf-modal-backdrop" data-pf-close></div>
      <div class="pf-modal-card" role="dialog" aria-modal="true" aria-labelledby="pf-edit-title">
        <header class="pf-modal-head">
          <h3 id="pf-edit-title">Edit profile</h3>
          <button class="pf-icon-btn" type="button" data-pf-close aria-label="Close">${closeIcon()}</button>
        </header>
        <div class="pf-modal-preview">
          <div class="pf-banner" data-pf-preview-banner${bannerStyle(profile)}>
            <div class="pf-banner-empty">No banner yet</div>
          </div>
          <div class="pf-preview-avatar">${avatarBlock(profile, 84)}</div>
        </div>
        <form class="pf-form" data-pf-form>
          <label class="pf-field"><span>Display name</span>
            <input name="displayName" maxlength="24" value="${esc(profile?.displayName || profile?.username || '')}" placeholder="${esc(profile?.username || '')}">
          </label>
          <label class="pf-field"><span>About me</span>
            <textarea name="bio" rows="4" maxlength="${BIO_LIMIT}" placeholder="Tell people what you watch">${esc(profile?.bio || '')}</textarea>
            <small class="pf-count"><span data-pf-count>${String(profile?.bio || '').length}</span>/${BIO_LIMIT}</small>
          </label>
          <div class="pf-field"><span>Accent colour</span>
            <div class="pf-accents" data-pf-accents>
              ${accents.map((c) => `<button type="button" class="pf-accent${(profile?.accent || '') === c ? ' active' : ''}" data-pf-accent="${c}" style="--sw:${c || 'transparent'}" aria-label="${c || 'Default'}"></button>`).join('')}
            </div>
          </div>
          <div class="pf-upload-row">
            <button class="pf-btn ghost" type="button" data-pf-upload="avatar">Upload avatar</button>
            <button class="pf-btn ghost" type="button" data-pf-upload="banner">Upload banner</button>
            <button class="pf-btn ghost danger" type="button" data-pf-remove-banner>Remove banner</button>
          </div>
          <input type="file" accept="image/jpeg,image/png,image/webp" data-pf-file="avatar" hidden>
          <input type="file" accept="image/jpeg,image/png,image/webp" data-pf-file="banner" hidden>
          <div class="pf-gallery" data-pf-gallery>
            <span class="pf-gallery-title">Or pick a portrait</span>
            <div class="pf-gallery-grid" data-pf-portraits><div class="pf-gallery-loading">Loading…</div></div>
          </div>
          <p class="pf-error" data-pf-error role="status" aria-live="polite"></p>
          <footer class="pf-modal-actions">
            <button class="pf-btn ghost" type="button" data-pf-close>Cancel</button>
            <button class="pf-btn" type="submit">Save changes</button>
          </footer>
        </form>
      </div>
    </div>`;
  }

  // ---- icons --------------------------------------------------------------

  function gearIcon() {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 8.4a3.6 3.6 0 1 0 0 7.2 3.6 3.6 0 0 0 0-7.2Zm9 3.6c0 .5 0 1-.1 1.5l2 1.6-1.9 3.3-2.4-1a8.6 8.6 0 0 1-2.6 1.5l-.4 2.5h-3.8l-.4-2.5a8.6 8.6 0 0 1-2.6-1.5l-2.4 1L3.1 16l2-1.6a9 9 0 0 1 0-3L3.1 9.8 5 6.5l2.4 1a8.6 8.6 0 0 1 2.6-1.5L10.4 3.5h3.8l.4 2.5c.9.3 1.8.8 2.6 1.5l2.4-1 1.9 3.3-2 1.6c.1.5.1 1 .1 1.6Z"/></svg>`;
  }
  function closeIcon() {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
  }
  function cameraIcon() {
    return `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3h6l1.5 2H20a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3.5L9 3Zm3 5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Zm0 2.2a3.3 3.3 0 1 1 0 6.6 3.3 3.3 0 0 1 0-6.6Z"/></svg>`;
  }

  // ---- image helper -------------------------------------------------------

  /** Reads a file, crops it square (avatar) or 4:1 (banner) and shrinks it, so
   *  the upload stays small and the circle never stretches the picture. */
  function prepareImage(file, kind) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(Error('Choose an image first.'));
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return reject(Error('Choose a JPEG, PNG or WebP image.'));
      if (file.size > 12 * 1024 * 1024) return reject(Error('Keep the picture under 12 MB.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const ratio = kind === 'banner' ? 4 : 1;
        const outW = kind === 'banner' ? 1200 : 512;
        const outH = Math.round(outW / ratio);
        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(outW / img.width, outH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (outW - w) / 2, (outH - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(Error('That image could not be read.')); };
      img.src = url;
    });
  }

  window.KozuProfile = { profileCard, editorMarkup, prepareImage, avatarBlock, bannerStyle, gearIcon, cameraIcon, esc, api, statLine, bioBlock, sinceLine };
})();
