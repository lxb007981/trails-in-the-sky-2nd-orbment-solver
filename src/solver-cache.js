export const CACHE_LIMIT = 500;
export const CACHE_STORAGE_KEY = 'orbment-solver-cache';
// 求解规则或返回格式改变时递增，防止复用旧算法的结果。
const CACHE_VERSION = 1;
const elements = [...'地水火风时空幻'];
const vector = (attributes = {}) => elements.map((element) => attributes[element] ?? 0);

export function requestKey(request) {
  return JSON.stringify([
    request.characterId,
    vector(request.minimumAttributes),
    [...new Set((request.artRequirements ?? []).map((attributes) => JSON.stringify(vector(attributes))))].sort(),
    [...new Set(request.requiredQuartzIds)].sort(),
    [...new Set(request.excludedQuartzIds)].sort(),
  ]);
}

function validResult(result) {
  if (!result || !Array.isArray(result.solutions)) return false;
  if (result.status === 'no-solution') return result.solutions.length === 0 && (result.message === undefined || typeof result.message === 'string');
  return result.status === 'solved' && result.solutions.length > 0 && result.solutions.length <= 20 &&
    result.solutions.every((solution) => solution && Array.isArray(solution.slots) && Array.isArray(solution.lines) &&
      solution.slots.every((slot) => slot && typeof slot.slotId === 'string' && typeof slot.quartzId === 'string') &&
      solution.lines.every((line) => line && line.attributes && typeof line.attributes === 'object' && !Array.isArray(line.attributes) &&
        Object.values(line.attributes).every((value) => Number.isSafeInteger(value) && value >= 0)));
}

export function createSolverCache(data, getStorage = () => globalThis.localStorage) {
  const identity = JSON.stringify([CACHE_VERSION, data.characters, data.quartz, data.arts]);
  const entries = new Map();
  let storage;
  let persistent = false;
  try {
    storage = getStorage();
    const saved = JSON.parse(storage.getItem(CACHE_STORAGE_KEY) || 'null');
    if (saved?.identity === identity && Array.isArray(saved.entries)) {
      for (const entry of saved.entries.slice(-CACHE_LIMIT)) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && validResult(entry[1])) entries.set(...entry);
      }
    }
  } catch { /* 损坏或受限的存储不影响求解。 */ }

  function persist() {
    try {
      storage.setItem(CACHE_STORAGE_KEY, JSON.stringify({ identity, entries: [...entries] }));
      persistent = true;
    } catch {
      persistent = false;
      // 避免下次刷新误读写入失败前的旧记录。
      try { storage?.removeItem(CACHE_STORAGE_KEY); } catch { /* 浏览器禁止存储。 */ }
    }
  }
  persist();
  return {
    get size() { return entries.size; },
    get persistent() { return persistent; },
    get(request) {
      const key = requestKey(request);
      if (!entries.has(key)) return undefined;
      const result = entries.get(key);
      entries.delete(key);
      entries.set(key, result);
      persist();
      return structuredClone(result);
    },
    set(request, result) {
      if (!validResult(result)) return;
      const key = requestKey(request);
      entries.delete(key);
      entries.set(key, structuredClone(result));
      while (entries.size > CACHE_LIMIT) entries.delete(entries.keys().next().value);
      persist();
    },
    clear() {
      entries.clear();
      persist();
      return persistent;
    },
  };
}
