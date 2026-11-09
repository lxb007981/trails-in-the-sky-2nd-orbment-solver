import test from 'node:test';
import assert from 'node:assert/strict';
import { createSolverCache, requestKey, CACHE_STORAGE_KEY } from '../src/solver-cache.js';

const data = { characters: [], quartz: [], arts: [] };
const request = { characterId: 'estelle', minimumAttributes: {}, requiredQuartzIds: [], excludedQuartzIds: [] };
const result = { status: 'solved', solutions: [{ slots: [], lines: [{ attributes: {} }] }] };
function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test('条件归一化忽略选择和属性键顺序，但保留独立魔法与同链要求', () => {
  const a = { ...request, minimumAttributes: { 水: 0 }, requiredQuartzIds: ['b', 'a'], artRequirements: [{ 水: 3 }, { 火: 2 }] };
  const b = { ...request, requiredQuartzIds: ['a', 'b'], artRequirements: [{ 火: 2 }, { 水: 3 }] };
  assert.equal(requestKey(a), requestKey(b));
  for (const change of [{ characterId: 'other' }, { minimumAttributes: { 水: 3 } }, { requiredQuartzIds: [] }, { excludedQuartzIds: ['c'] }, { artRequirements: [{ 水: 3, 火: 2 }] }]) {
    assert.notEqual(requestKey(a), requestKey({ ...a, ...change }));
  }
});

test('缓存跨页面恢复，命中更新 LRU，容量最多 500 条', () => {
  const store = storage();
  const cache = createSolverCache(data, () => store);
  const at = (i) => ({ ...request, minimumAttributes: { 水: i } });
  for (let i = 0; i < 500; i++) cache.set(at(i), result);
  assert.deepEqual(cache.get(at(0)), result);
  cache.set(at(500), result);
  assert.equal(cache.size, 500);
  const restored = createSolverCache(data, () => store);
  assert.equal(restored.size, 500);
  assert.equal(restored.get(at(1)), undefined);
  assert.deepEqual(restored.get(at(0)), result);
  assert.deepEqual(restored.get(at(500)), result);
  restored.get(at(0)).solutions.pop();
  assert.deepEqual(restored.get(at(0)), result);
});

test('清除仅影响求解缓存，数据或版本变化不复用旧结果', () => {
  const store = storage();
  store.setItem('other-app', 'keep');
  const cache = createSolverCache(data, () => store);
  cache.set(request, result);
  assert.equal(createSolverCache({ ...data, quartz: [{ id: 'new' }] }, () => store).size, 0);
  cache.set(request, result);
  const saved = JSON.parse(store.getItem(CACHE_STORAGE_KEY));
  saved.identity = 'old-version';
  store.setItem(CACHE_STORAGE_KEY, JSON.stringify(saved));
  assert.equal(createSolverCache(data, () => store).size, 0);
  cache.set(request, result);
  assert.equal(cache.clear(), true);
  assert.equal(cache.get(request), undefined);
  assert.equal(createSolverCache(data, () => store).size, 0);
  assert.equal(store.getItem('other-app'), 'keep');
});

test('损坏缓存、存储拒绝访问或写满均不阻止使用', () => {
  const store = storage();
  store.setItem(CACHE_STORAGE_KEY, '{broken');
  assert.equal(createSolverCache(data, () => store).size, 0);
  for (const getStorage of [() => { throw new Error('denied'); }, () => ({ getItem: () => null, setItem: () => { throw new Error('quota'); } })]) {
    const cache = createSolverCache(data, getStorage);
    cache.set(request, result);
    assert.equal(cache.persistent, false);
    assert.deepEqual(cache.get(request), result);
    cache.clear();
    assert.equal(cache.get(request), undefined);
  }
});

test('只保存有效的求解结果，包括无解；忽略错误和损坏记录', () => {
  const store = storage();
  const cache = createSolverCache(data, () => store);
  for (const invalid of [null, { status: 'error', solutions: [] }, { status: 'solved', solutions: [{}] }, { status: 'solved', solutions: [null] }, { status: 'solved', solutions: [{ slots: [null], lines: [null] }] }]) cache.set(request, invalid);
  assert.equal(cache.size, 0);
  const noSolution = { status: 'no-solution', solutions: [], message: '无解' };
  cache.set(request, noSolution);
  assert.deepEqual(cache.get(request), noSolution);
  const saved = JSON.parse(store.getItem(CACHE_STORAGE_KEY));
  saved.entries.push(['bad', { status: 'solved', solutions: [{}] }]);
  store.setItem(CACHE_STORAGE_KEY, JSON.stringify(saved));
  assert.equal(createSolverCache(data, () => store).size, 1);
});
