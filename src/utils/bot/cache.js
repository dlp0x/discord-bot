const store = new Map();
let hits = 0;
let misses = 0;

function set (key, value, ttlMs = 300000) {
  const expiresAt = typeof ttlMs === 'number' && ttlMs > 0 ? Date.now() + ttlMs : null;
  store.set(key, { value, expiresAt });
}

function get (key) {
  const entry = store.get(key);
  if (!entry) {
    misses += 1;
    return null;
  }

  if (entry.expiresAt && entry.expiresAt <= Date.now()) {
    store.delete(key);
    misses += 1;
    return null;
  }

  hits += 1;
  return entry.value;
}

function clear (key) {
  if (typeof key === 'string') {
    store.delete(key);
    return;
  }

  store.clear();
}

function getStats () {
  return {
    size: store.size,
    hits,
    misses
  };
}

export default { set, get, clear, getStats };
