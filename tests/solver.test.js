import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { solveOrbment } from '../src/solver.js';
import { parseQuartz, parseArts } from '../src/data.js';
import { quartzFamily } from '../src/quartz-families.js';

const q = (name, attributes, element = Object.keys(attributes)[0]) => ({ id: name, name, attributes, element });
const character = (lines, limits = {}) => ({ id: 'test', center_slot: 'c', lines,
  slots: [...new Set(lines.flat())].map((id) => ({ id, required_element: limits[id] ?? null })),
});
const single = character([['c', 'a', 'b']]);
const split = character([['c', 'a'], ['c', 'b']]);
const solve = (quartz, minimumAttributes = {}, requiredQuartzIds = [], excludedQuartzIds = [], c = single, signal) =>
  solveOrbment({ characterId: c.id, minimumAttributes, requiredQuartzIds, excludedQuartzIds }, { characters: [c], quartz, signal });
const names = (solution) => solution.slots.map((s) => s.quartzId).sort();

test('全零唯一空解；必选精确保留；冲突及不可达返回无解', async () => {
  const quartz = [q('防御1', { 地: 1 }), q('破坏1', { 地: 1 }), q('防御2', { 地: 2 })];
  assert.deepEqual((await solve(quartz)).solutions.map(names), [[]]);
  assert.deepEqual((await solve(quartz, {}, ['破坏1'])).solutions.map(names), [['破坏1']]);
  for (const required of [['防御1', '防御2'], ['不存在']]) assert.equal((await solve(quartz, {}, required)).status, 'no-solution');
  assert.equal((await solve(quartz, {}, ['防御1'], ['防御1'])).status, 'no-solution');
  assert.equal((await solve(quartz, { 水: 1 })).status, 'no-solution');
});

test('功能系列明确包含高级珠，且跨链互斥', async () => {
  for (const name of ['EP1', 'EP4', '贤王珠', '真・贤王珠']) assert.equal(quartzFamily(name), 'EP1');
  const quartz = [q('EP1', { 幻: 1 }), q('真・贤王珠', { 幻: 5 })];
  assert.equal((await solve(quartz, {}, quartz.map((v) => v.id), [], split)).status, 'no-solution');
});

test('刃盾理独立共存，同类别单链互斥，分支可分别装备', async () => {
  const quartz = [q('白银之盾', { 幻: 3 }), q('冻结之刃', { 水: 2 }), q('冻结之理', { 水: 5 }), q('苍玉之盾', { 水: 3 })];
  assert.equal((await solve(quartz, {}, quartz.slice(0, 3).map((v) => v.id))).status, 'solved');
  const shields = ['白银之盾', '苍玉之盾'];
  assert.equal((await solve(quartz, {}, shields)).status, 'no-solution');
  const result = await solve(quartz, {}, shields, [], split);
  assert.equal(result.solutions.length, 2);
  result.solutions.forEach((s) => assert.ok(s.slots.every((slot) => slot.slotId !== 'c')));
});

test('目标不跨链拼凑；中央属性共享；多链中央移动保留不同策略', async () => {
  const quartz = [q('甲', { 地: 1 }), q('乙', { 水: 1 })];
  const c = character([['c', 'a'], ['c', 'b']], { c: '火', a: '地', b: '水' });
  assert.equal((await solve(quartz, { 地: 1, 水: 1 }, [], [], c)).status, 'no-solution');
  const result = await solve(quartz.slice(0, 1), { 地: 1 }, [], [], split);
  assert.equal(result.solutions.length, 3);
  const center = result.solutions.find((s) => s.slots[0].slotId === 'c');
  assert.ok(center.lines.every((l) => l.attributes.地 === 1));
});

test('不可再删而非全局最少孔；逐回路去重而非总和去重', async () => {
  const quartz = [q('防御1', { 地: 1 }), q('防御2', { 地: 2 }), q('破坏1', { 地: 1 })];
  assert.deepEqual((await solve(quartz, { 地: 2 })).solutions.map(names), [['破坏1', '防御1'].sort(), ['防御2']]);
});

test('向下替换遵守必选、排除、功能互斥、限定孔；混合增减不算向下', async () => {
  const quartz = [q('防御1', { 地: 1 }), q('防御2', { 地: 2 }), q('破坏1', { 地: 1 }), q('甲', { 地: 2, 水: 1 }), q('乙', { 地: 1, 水: 2 })];
  assert.deepEqual((await solve(quartz.slice(0, 2), { 地: 1 })).solutions.map(names), [['防御1']]);
  assert.deepEqual((await solve(quartz.slice(0, 2), { 地: 1 }, ['防御2'])).solutions.map(names), [['防御2']]);
  assert.deepEqual((await solve(quartz.slice(0, 2), { 地: 1 }, [], ['防御1'])).solutions.map(names), [['防御2']]);
  assert.deepEqual((await solve(quartz.slice(0, 3), { 地: 3 })).solutions.map(names), [['破坏1', '防御2'].sort()]);
  assert.equal((await solve(quartz.slice(3), { 地: 1, 水: 1 })).solutions.length, 2);
  const limited = character([['c']], { c: '水' });
  assert.deepEqual((await solve([q('低', { 地: 1 }, '地'), q('高', { 地: 2 }, '水')], { 地: 1 }, [], [], limited)).solutions.map(names), [['高']]);
});

test('等属性优先表格顺序，但不覆盖必选、功能互斥或孔位限制', async () => {
  const quartz = [q('防御1', { 地: 1 }), q('破坏1', { 地: 1 }), q('防御2', { 地: 2 })];
  assert.deepEqual((await solve(quartz, { 地: 1 })).solutions.map(names), [['防御1']]);
  assert.deepEqual((await solve(quartz, { 地: 1 }, ['破坏1'])).solutions.map(names), [['破坏1']]);
  assert.deepEqual((await solve(quartz, { 地: 3 }, ['防御2'])).solutions.map(names), [['破坏1', '防御2'].sort()]);
  const limited = character([['c']], { c: '水' });
  assert.deepEqual((await solve([q('甲', { 地: 1 }, '地'), q('乙', { 地: 1 }, '水')], { 地: 1 }, [], [], limited)).solutions.map(names), [['乙']]);
});

test('限定孔允许组内重排，单链中央孔排列去重', async () => {
  const c = character([['c', 'a']], { a: '地' });
  const quartz = [q('甲', { 地: 1 }), q('乙', { 水: 1 })];
  const result = await solve(quartz, { 地: 1, 水: 1 }, [], [], c);
  assert.equal(result.solutions.length, 1);
  assert.deepEqual(result.solutions[0].slots, [{ slotId: 'c', quartzId: '乙' }, { slotId: 'a', quartzId: '甲' }]);
});

test('恰好20个完整返回，第21个不同最小策略立即截断', async () => {
  for (const count of [20, 21]) {
    const quartz = Array.from({ length: count }, (_, i) => q(`回路${i}`, { 地: i + 1, 水: count - i }));
    const result = await solve(quartz, { 地: 1, 水: 1 }, [], [], character([['c']]));
    assert.equal(result.solutions.length, 20);
    assert.equal(result.truncated, count === 21);
    if (count === 21) assert.equal(result.message, '超过 20 个，已停止搜索');
  }
});

test('真实数据求解与运行中取消', async () => {
  const quartz = parseQuartz(await readFile(new URL('../sora-2nd-quartz.csv', import.meta.url), 'utf8'));
  const { characters } = JSON.parse(await readFile(new URL('../sora-2nd-orbments.json', import.meta.url), 'utf8'));
  const result = await solve(quartz, { 水: 3 }, [], [], characters[0]);
  assert.equal(result.status, 'solved');
  assert.ok(result.solutions.every((s) => s.lines.some((l) => l.attributes.水 >= 3)));
  const controller = new AbortController();
  const pending = solve(quartz, { 地: 20, 水: 20, 火: 20, 风: 20 }, [], [], characters.find((c) => c.id === 'kloe'), controller.signal);
  setTimeout(() => controller.abort(), 0);
  await assert.rejects(pending, { name: 'AbortError' });
});


test('艾丝蒂尔的三个魔法可分链配出，真实数据不再误报无解', async () => {
  const quartz = parseQuartz(await readFile(new URL('../sora-2nd-quartz.csv', import.meta.url), 'utf8'));
  const { characters } = JSON.parse(await readFile(new URL('../sora-2nd-orbments.json', import.meta.url), 'utf8'));
  const arts = parseArts(await readFile(new URL('../sora-2nd-arts.csv', import.meta.url), 'utf8'));
  const artRequirements = ['导力封锁', '时间加速改', '十二宫星环'].map((id) => arts.find((a) => a.id === id).attributes);
  const c = characters.find((c) => c.id === 'estelle');
  const example = [['省EP4', '薰风', '牙城', '阳炎'], ['省EP4', '行动力4', '驱动4', 'EP4']];
  const totals = example.map((line) => Object.fromEntries([...'地水火风时空幻'].map((e) => [e, line.reduce((sum, id) => sum + (quartz.find((q) => q.id === id).attributes[e] ?? 0), 0)])));
  assert.ok(artRequirements.every((target) => totals.some((line) => Object.entries(target).every(([e, v]) => line[e] >= v))));
  const result = await solveOrbment({ characterId: c.id, artRequirements, requiredQuartzIds: [], excludedQuartzIds: [] }, { characters, quartz });
  assert.equal(result.status, 'solved');
  for (const solution of result.solutions) {
    assert.ok(artRequirements.every((target) => solution.lines.some((line) => Object.entries(target).every(([e, v]) => line.attributes[e] >= v))));
  }
});


test('不同目标可分链，但单个目标不可跨链；手动属性与魔法同时约束', async () => {
  const c = character([['c', 'a'], ['c', 'b']], { c: '火', a: '地', b: '水' });
  const quartz = [q('甲', { 地: 1 }), q('乙', { 水: 1 })];
  const request = { characterId: c.id, minimumAttributes: {}, artRequirements: [{ 地: 1 }, { 水: 1 }], requiredQuartzIds: [], excludedQuartzIds: [] };
  const context = { characters: [c], quartz };
  const result = await solveOrbment(request, context);
  assert.deepEqual(result.solutions.map(names), [['乙', '甲'].sort()]);
  assert.equal((await solveOrbment({ ...request, artRequirements: [{ 地: 1, 水: 1 }] }, context)).status, 'no-solution');
  assert.equal((await solveOrbment({ ...request, minimumAttributes: { 地: 1, 水: 1 } }, context)).status, 'no-solution');
  assert.equal((await solveOrbment({ ...request, excludedQuartzIds: ['乙'] }, context)).status, 'no-solution');
  assert.deepEqual((await solveOrbment({ ...request, artRequirements: [] }, context)).solutions.map(names), [[]]);
  await assert.rejects(solveOrbment({ ...request, artRequirements: [{ 水: -1 }] }, context), /非负/);
});
