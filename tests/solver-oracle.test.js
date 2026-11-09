import test from 'node:test';
import assert from 'node:assert/strict';
import { solveOrbment } from '../src/solver.js';

// 独立逐孔穷举，不使用求解器的分组搜索、剪枝或合法性函数。
const elements = [...'地水火风时空幻'];
const values = (q) => elements.map((e) => q.attributes[e] ?? 0);
function oracle(character, quartz, targets, required, excluded) {
  const slotGroups = character.slots.map((slot) => character.lines.flatMap((line, i) => line.includes(slot.id) ? [i] : []).join(','));
  const groups = [...new Set(slotGroups)];
  const groupItems = (config) => groups.map((g) => config.filter((q, i) => q && slotGroups[i] === g));
  const nameKey = (config) => JSON.stringify(groupItems(config).map((items) => items.map((q) => q.id).sort()));
  const attrKey = (config) => JSON.stringify(groupItems(config).map((items) => items.map((q) => values(q).join(',')).sort()));
  function qualifies(config) {
    const items = config.filter(Boolean);
    if (!required.every((id) => items.some((q) => q.id === id))) return false;
    if (items.some((q) => excluded.includes(q.id))) return false;
    // 本测试数据明确约定防御1、防御2同系，其余独立。
    if (new Set(items.map((q) => q.name.startsWith('防御') ? '防御' : q.name)).size !== items.length) return false;
    const totals = [];
    for (const line of character.lines) {
      const lineItems = config.filter((q, i) => q && line.includes(character.slots[i].id));
      for (const suffix of ['之刃', '之盾', '之理']) if (lineItems.filter((q) => q.name.endsWith(suffix)).length > 1) return false;
      totals.push(Object.fromEntries(elements.map((e) => [e, lineItems.reduce((n, q) => n + (q.attributes[e] ?? 0), 0)])));
    }
    return targets.every((target) => totals.some((line) => elements.every((e) => line[e] >= (target[e] ?? 0))));
  }
  const valid = new Map(), config = [];
  function enumerate(i) {
    if (i === character.slots.length) {
      if (qualifies(config)) valid.set(nameKey(config), [...config]);
      return;
    }
    for (const q of [null, ...quartz]) {
      if (q && character.slots[i].required_element && character.slots[i].required_element !== q.element) continue;
      config.push(q); enumerate(i + 1); config.pop();
    }
  }
  enumerate(0);
  const result = new Map();
  for (const candidate of valid.values()) {
    let minimal = true;
    for (let i = 0; i < candidate.length && minimal; i++) {
      const q = candidate[i];
      if (!q || required.includes(q.id)) continue;
      const changed = [...candidate]; changed[i] = null;
      if (valid.has(nameKey(changed))) { minimal = false; break; }
      for (const r of quartz) {
        if (!values(r).every((v, j) => v <= values(q)[j]) || !values(r).some((v, j) => v < values(q)[j])) continue;
        changed[i] = r;
        if (valid.has(nameKey(changed))) { minimal = false; break; }
      }
    }
    if (!minimal) continue;
    const key = attrKey(candidate);
    const rank = candidate.filter(Boolean).map((q) => quartz.indexOf(q)).sort((a, b) => a - b).join(',');
    if (!result.has(key) || rank < result.get(key)) result.set(key, rank);
  }
  return { result, attrKey };
}

test('80组小规模条件与独立逐孔穷举的完整最小策略及名称优先级一致', async () => {
  let seed = 72931;
  const random = (n) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; };
  for (let trial = 0; trial < 80; trial++) {
    const names = ['防御1', '防御2', '甲之盾', '乙之盾', '丙之刃', '丁之理'];
    const quartz = names.map((name) => ({ id: name, name, element: ['地', '水'][random(2)], attributes: { 地: random(4), 水: random(4) } }));
    const character = { id: 'test', center_slot: 'c',
      slots: ['c', 'a', 'b'].map((id) => ({ id, required_element: [null, '地', '水'][random(3)] })),
      lines: trial % 2 ? [['c', 'a'], ['c', 'b']] : [['c', 'a', 'b']],
    };
    const target = { 地: random(6), 水: random(6) };
    const artRequirements = trial % 3 ? [{ 地: random(6), 水: random(6) }] : [];
    const targets = [target, ...artRequirements];
    const required = trial % 3 ? [] : [names[random(names.length)]];
    const excluded = trial % 4 ? [] : [names[random(names.length)]];
    const { result: expected, attrKey } = oracle(character, quartz, targets, required, excluded);
    const actual = await solveOrbment({ characterId: 'test', minimumAttributes: target, artRequirements, requiredQuartzIds: required, excludedQuartzIds: excluded }, { characters: [character], quartz });
    assert.ok(expected.size <= 20, '测试空间应能完整搜索');
    const found = new Map(actual.solutions.map((solution) => {
      const config = character.slots.map((slot) => quartz.find((q) => solution.slots.some((s) => s.slotId === slot.id && s.quartzId === q.id)) ?? null);
      const rank = config.filter(Boolean).map((q) => quartz.indexOf(q)).sort((a, b) => a - b).join(',');
      return [attrKey(config), rank];
    }));
    assert.equal(found.size, actual.solutions.length, `重复策略，case ${trial}`);
    assert.deepEqual(found, expected, `case ${trial}: ${JSON.stringify({ character, quartz, target, required, excluded })}`);
  }
});
