import { quartzFamily } from './quartz-families.js';

const ELEMENTS = [...'地水火风时空幻'];
const vector = (attributes) => ELEMENTS.map((e) => attributes[e] ?? 0);
const reaches = (values, target) => values.every((v, i) => v >= target[i]);
const noSolution = (message) => ({ status: 'no-solution', solutions: [], message });

/** 精确搜索规则中的不可删、不可向下替换策略。空孔省略，所有链均返回。 */
export async function solveOrbment(request, context) {
  context.signal?.throwIfAborted();
  const character = context.characters.find((c) => c.id === request.characterId);
  if (!character) throw new Error('未知角色');
  const target = vector(request.minimumAttributes);
  if (!target.every((v) => Number.isSafeInteger(v) && v >= 0)) throw new Error('属性值需要是非负的安全整数');
  const required = new Set(request.requiredQuartzIds);
  const excluded = new Set(request.excludedQuartzIds);
  const all = context.quartz.map((q, index) => ({
    ...q, index, values: vector(q.attributes), family: quartzFamily(q.name),
    category: q.name.match(/之(刃|盾|理)$/)?.[1],
  }));
  const byId = new Map(all.map((q) => [q.id, q]));
  if ([...required].some((id) => excluded.has(id))) return noSolution('条件冲突：必选回路同时被排除。');
  if ([...required].some((id) => !byId.has(id))) return noSolution('条件冲突：必选回路不存在。');
  const mandatory = [...required].map((id) => byId.get(id));
  if (new Set(mandatory.map((q) => q.family)).size !== mandatory.length) return noSolution('条件冲突：必选回路属于同一功能系列。');
  if (mandatory.length > character.slots.length) return noSolution('必选回路数量超过孔位数量。');
  const available = all.filter((q) => !excluded.has(q.id));
  const optional = available.filter((q) => !required.has(q.id) && q.values.some((v, i) => v > 0 && target[i] > 0));

  // 按链成员关系分组，组内排列不产生新策略。单链中央孔也属于组内。
  const groups = [];
  for (const slot of character.slots) {
    const lines = character.lines.flatMap((line, i) => line.includes(slot.id) ? [i] : []);
    const key = lines.join(',');
    let group = groups.find((g) => g.key === key);
    if (!group) { group = { key, lines, slots: [] }; groups.push(group); }
    group.slots.push(slot);
  }
  const placement = groups.map(() => []);

  // 至多七孔的匹配；替代回路后也允许组内重排以满足限定孔。
  function fit(items, slots) {
    if (items.length > slots.length) return null;
    const ordered = [...items].sort((a, b) => a.index - b.index);
    const used = new Set(), result = [];
    function assign(i) {
      if (i === ordered.length) return true;
      for (const slot of slots) {
        if (used.has(slot.id) || (slot.required_element && slot.required_element !== ordered[i].element)) continue;
        used.add(slot.id); result.push({ slotId: slot.id, quartzId: ordered[i].id });
        if (assign(i + 1)) return true;
        used.delete(slot.id); result.pop();
      }
      return false;
    }
    return assign(0) ? result : null;
  }
  function legal(config) {
    const families = new Set();
    const categories = character.lines.map(() => new Set());
    for (let g = 0; g < groups.length; g++) {
      if (!fit(config[g], groups[g].slots)) return false;
      for (const q of config[g]) {
        if (families.has(q.family)) return false;
        families.add(q.family);
        if (q.category) for (const line of groups[g].lines) {
          if (categories[line].has(q.category)) return false;
          categories[line].add(q.category);
        }
      }
    }
    return true;
  }
  function sums(config) {
    const values = character.lines.map(() => ELEMENTS.map(() => 0));
    config.forEach((items, g) => items.forEach((q) => groups[g].lines.forEach((line) => {
      q.values.forEach((v, i) => { values[line][i] += v; });
    })));
    return values;
  }
  const satisfied = (config) => sums(config).some((values) => reaches(values, target));
  const lower = new Map(available.map((q) => [q.id, available.filter((r) =>
    r.values.every((v, i) => v <= q.values[i]) && r.values.some((v, i) => v < q.values[i]),
  )]));
  function* minimal(config) {
    for (let g = 0; g < config.length; g++) for (let i = 0; i < config[g].length; i++) {
      const q = config[g][i];
      if (required.has(q.id)) continue;
      const reduced = config.map((items) => [...items]);
      reduced[g].splice(i, 1);
      if (satisfied(reduced)) return false;
      for (const r of lower.get(q.id)) {
        yield;
        const replaced = config.map((items) => [...items]);
        replaced[g][i] = r;
        if (satisfied(replaced) && legal(replaced)) return false;
      }
    }
    return true;
  }
  const signature = (config) => JSON.stringify(config.map((items) => items.map((q) => q.values.join(',')).sort()));
  const equal = new Map();
  for (const q of available) {
    const key = q.values.join(',');
    if (!equal.has(key)) equal.set(key, []);
    equal.get(key).push(q);
  }
  // 等属性替代可能改变互斥关系，联合选择名称后再检查最小性。
  function* canonical(config) {
    const positions = config.flatMap((items, g) => items.map((q) => ({ g, q })));
    const candidate = groups.map(() => []);
    let best, bestOrder;
    function* visit(i) {
      yield;
      if (i === positions.length) {
        if (![...required].every((id) => candidate.some((items) => items.some((q) => q.id === id)))) return;
        const order = candidate.flat().map((q) => q.index).sort((a, b) => a - b);
        if (bestOrder) {
          const first = order.findIndex((value, j) => value !== bestOrder[j]);
          if (first < 0 || order[first] > bestOrder[first]) return;
        }
        if (!(yield* minimal(candidate))) return;
        best = candidate.map((items) => [...items]); bestOrder = order;
        return;
      }
      const { g, q } = positions[i];
      for (const replacement of equal.get(q.values.join(','))) {
        candidate[g].push(replacement);
        if (legal(candidate)) yield* visit(i + 1);
        candidate[g].pop();
      }
    }
    yield* visit(0);
    return best;
  }
  const solutions = [], seen = new Set();
  let truncated = false;
  function* accept() {
    const key = signature(placement);
    if (seen.has(key) || !(yield* minimal(placement))) return;
    seen.add(key);
    if (solutions.length === 20) { truncated = true; return; }
    const config = yield* canonical(placement);
    const attributes = sums(config);
    const slots = config.flatMap((items, g) => fit(items, groups[g].slots));
    slots.sort((a, b) => character.slots.findIndex((s) => s.id === a.slotId) - character.slots.findIndex((s) => s.id === b.slotId));
    solutions.push({ id: `solution-${solutions.length + 1}`, slots,
      lines: character.lines.map((slotIds, i) => ({ slotIds: [...slotIds], attributes: Object.fromEntries(ELEMENTS.map((e, j) => [e, attributes[i][j]])) })),
    });
  }
  function* extend(line, start) {
    yield;
    if (satisfied(placement)) { yield* accept(); return; }
    const active = groups.flatMap((g, i) => g.lines.includes(line) ? [i] : []);
    const free = active.reduce((n, g) => n + groups[g].slots.length - placement[g].length, 0);
    if (!free) return;
    const current = sums(placement)[line];
    // 乐观上界仅剪去必定不可达分支，不用于近似返回。
    for (let e = 0; e < ELEMENTS.length; e++) {
      let max = 0;
      for (let i = start; i < optional.length; i++) max = Math.max(max, optional[i].values[e]);
      if (current[e] + free * max < target[e]) return;
    }
    for (let i = start; i < optional.length && !truncated; i++) {
      const q = optional[i];
      for (const g of active) {
        placement[g].push(q);
        if (legal(placement)) yield* extend(line, i + 1);
        placement[g].pop();
        if (truncated) return;
      }
    }
  }
  function* placeRequired(i) {
    yield;
    if (i === mandatory.length) {
      // 最小解的非必选回路都在某条达标链上，否则可直接删除。
      for (let line = 0; line < character.lines.length && !truncated; line++) yield* extend(line, 0);
      return;
    }
    for (let g = 0; g < groups.length && !truncated; g++) {
      placement[g].push(mandatory[i]);
      if (legal(placement)) yield* placeRequired(i + 1);
      placement[g].pop();
    }
  }
  let deadline = performance.now() + 8;
  for (const _ of placeRequired(0)) {
    context.signal?.throwIfAborted();
    if (performance.now() >= deadline) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      context.signal?.throwIfAborted();
      deadline = performance.now() + 8;
    }
  }
  context.signal?.throwIfAborted();
  return solutions.length
    ? { status: 'solved', solutions, truncated, message: truncated ? '超过 20 个，已停止搜索' : `完整搜索，共 ${solutions.length} 个策略。` }
    : noSolution('完整搜索后没有满足条件的合法最小策略。');
}
