// An explicit dismissal/completion is one atomic account-state mutation.
// A stale card must never advance an episode another tab has already changed.
export function dismissHistory(state, request) {
  const history = Array.isArray(state.history) ? state.history : [];
  const matches = row => row.type === request.type && String(row.id) === String(request.id);
  const old = history.find(matches);
  if (!old || Number(old.episode) !== Number(request.episode) || Number(old.season) !== Number(request.season)) return state;
  const next = request.next;
  if (next != null && (next.type !== old.type || !/^\d{1,10}$/.test(String(next.id)) ||
      !Number.isInteger(next.episode) || next.episode < 1 ||
      !Number.isInteger(next.season) || next.season < 0 ||
      (old.type === 'tv' && String(next.id) !== String(old.id)) ||
      (String(next.id) === String(old.id) && Number(next.season) === Number(old.season) && next.episode <= Number(old.episode)))) {
    throw new Error('Invalid next episode');
  }
  const remaining = history.filter(row => !matches(row));
  if (next) {
    const record = {
      ...old, id: String(next.id), episode: next.episode, season: next.season,
      title: String(next.title || old.title || '').slice(0, 200),
      poster: String(next.poster || old.poster || '').slice(0, 500),
      currentTime: 0, duration: 0, updated: Date.now()
    };
    state.history = [record, ...remaining.filter(row => !(row.type === record.type && String(row.id) === record.id))];
  } else state.history = remaining;
  // A manual X only clears Continue Watching. Finishing a movie also clears
  // its saved watchlist entry, as requested in report #13.
  if (request.completed === true && (old.type === 'movie' || old.isMovie || old.format === 'MOVIE')) {
    state.watchlist = (state.watchlist || []).filter(row => !matches(row));
  }
  return state;
}
