import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseQuartz } from '../src/data.js';
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

test('默认接口明确返回未实现，不提供虚构配置；支持取消', async () => {
  const request = { characterId: 'estelle', minimumAttributes: { 水: 3 }, requiredQuartzIds: [], excludedQuartzIds: [] };
  const response = await solveOrbment(request, { characters: [], quartz: [] });
  assert.equal(response.status, 'not-implemented');
  assert.deepEqual(response.solutions, []);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(solveOrbment(request, { characters: [], quartz: [], signal: controller.signal }), { name: 'AbortError' });
});
