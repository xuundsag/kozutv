// Small in-memory, TTL/LRU cache for normalized genre pages. Concurrent requests
// for the same page share a promise; only a handful of distinct pages may hit
// upstream catalogs at once. Failures are never cached.
export function createGenrePageCache({ttlMs=600_000,maxEntries=160,maxConcurrent=6,maxPending=120,now=Date.now}={}) {
  const entries = new Map(), pending = new Map(), queue = [];
  let active = 0;
  function pump() {
    while (active < maxConcurrent && queue.length) {
      const job = queue.shift();
      active++;
      Promise.resolve().then(job.loader).then(value => {
        entries.delete(job.key);
        entries.set(job.key, {value, expires:now()+ttlMs});
        while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
        job.resolve(value);
      }, job.reject).finally(() => {
        active--;pending.delete(job.key);pump();
      });
    }
  }
  function get(key, loader) {
    const hit = entries.get(key);
    if (hit) {
      if (hit.expires > now()) { entries.delete(key);entries.set(key,hit);return Promise.resolve(hit.value); }
      entries.delete(key);
    }
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= maxPending) return Promise.reject(Error('Catalog is busy. Please try again.'));
    let resolve, reject;
    const promise = new Promise((yes,no)=>{resolve=yes;reject=no});
    pending.set(key,promise);
    queue.push({key,loader,resolve,reject});pump();
    return promise;
  }
  return {get, stats:()=>({entries:entries.size,pending:pending.size,active,queued:queue.length})};
}
