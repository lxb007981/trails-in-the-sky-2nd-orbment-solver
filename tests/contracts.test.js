import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseQuartz, parseArts, completeAttributes } from '../src/data.js';
import { solveOrbment } from '../src/solver.js';

test('仓库数据可用于所有选择列表，回路 ID 唯一且属性被完整解析', async () => {
  const text = await readFile(new URL('../sora-2nd-quartz.csv', import.meta.url), 'utf8');
  const quartz = parseQuartz(text);
  assert.ok(quartz.length > 0);
  assert.equal(new Set(quartz.map((q) => q.id)).size, quartz.length);
  quartz.forEach((q) => { assert.ok(Object.keys(q.attributes).length); assert.ok(Object.values(q.attributes).every(Number.isSafeInteger)); });
  assert.deepEqual(quartz.find((q) => q.id === '阳炎').attributes, { 幻: 4, 时: 4, 空: 4 });
  const data = JSON.parse(await readFile(new URL('../sora-2nd-orbments.json', import.meta.url), 'utf8'));
  data.characters.forEach((character) => {
    const ids = new Set(character.slots.map((slot) => slot.id));
    character.lines.forEach((line) => { assert.ok(line.includes(character.center_slot)); line.forEach((id) => assert.ok(ids.has(id))); });
  });
});

test('魔法 CSV 跳过表头并完整解析各魔法独立需求', async () => {
  const text = await readFile(new URL('../sora-2nd-arts.csv', import.meta.url), 'utf8');
  const arts = parseArts('\uFEFF' + text);
  assert.equal(arts.length, text.trim().split(/\r?\n/).length - 1);
  assert.equal(new Set(arts.map((art) => art.id)).size, arts.length);
  const selected = ['石化吐息', '泰坦之咆哮'].map((id) => arts.find((art) => art.id === id));
  assert.deepEqual(selected[0].attributes, { 地: 3, 风: 2 });
  assert.deepEqual(selected[1].attributes, { 地: 6, 空: 4 });
});

test('接口拒绝未知角色，支持取消', async () => {
  const request = { characterId: 'estelle', minimumAttributes: { 水: 3 }, requiredQuartzIds: [], excludedQuartzIds: [] };
  await assert.rejects(solveOrbment(request, { characters: [], quartz: [] }), /未知角色/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(solveOrbment(request, { characters: [], quartz: [], signal: controller.signal }), { name: 'AbortError' });
});


test('魔法属性汇总随选择变化，清空选择后无属性要求', () => {
  const arts = [{ attributes: { 时: 9 } }, { attributes: { 时: 5, 空: 5 } }, { attributes: { 水: 3, 风: 3, 空: 3, 幻: 6 } }];
  assert.deepEqual(completeAttributes(arts), { 水: 3, 时: 9, 空: 5, 风: 3, 幻: 6 });
  assert.deepEqual(completeAttributes(arts.slice(1)), { 水: 3, 时: 5, 空: 5, 风: 3, 幻: 6 });
  assert.deepEqual(completeAttributes([]), {});
});
