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
  const targets = [request.minimumAttributes ?? {}, ...(request.artRequirements ?? [])].map(vector);
  if (!targets.every((target) => target.every((v) => Number.isSafeInteger(v) && v >= 0))) throw new Error('属性值需要是非负的安全整数');
  // 优先补齐需求最高的目标，尽早暴露短链和限定孔的瓶颈。
  targets.sort((a, b) => b.reduce((n, v) => n + v, 0) - a.reduce((n, v) => n + v, 0));
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
  const optional = available.filter((q) => !required.has(q.id) && q.values.some((v, i) => v > 0 && targets.some((target) => target[i] > 0)));

  // 多目标优先尝试贡献较大的回路，仅改变遍历顺序，不删候选。
  if (targets.filter((target) => target.some(Boolean)).length > 1) {
    const score = (q) => targets.reduce((sum, target) => sum + target.reduce((n, v, e) => n + (v ? Math.min(q.values[e], v) / v : 0), 0), 0);
    optional.sort((a, b) => score(b) - score(a) || a.index - b.index);
  }

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

  // 限定孔仅要求单一属性，匹配可由计数精确判定，无需枚举孔位排列。
  for (const group of groups) {
    group.restricted = new Map();
    group.unrestricted = 0;
    for (const slot of group.slots) {
      if (slot.required_element) group.restricted.set(slot.required_element, (group.restricted.get(slot.required_element) ?? 0) + 1);
      else group.unrestricted++;
    }
  }
  function canFit(items, group) {
    if (items.length > group.slots.length) return false;
    const counts = new Map();
    let overflow = 0;
    for (const q of items) {
      const count = (counts.get(q.element) ?? 0) + 1;
      counts.set(q.element, count);
      if (count > (group.restricted.get(q.element) ?? 0)) overflow++;
    }
    return overflow <= group.unrestricted;
  }

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
      if (!canFit(config[g], groups[g])) return false;
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
  const satisfied = (config) => {
    const lines = sums(config);
    return targets.every((target) => lines.some((values) => reaches(values, target)));
  };
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
    // 将可行配置收缩到合法最小策略，避免先穷举大量可向下降级的配置。
    let reduced = placement.map((items) => [...items]);
    let changed = true;
    while (changed) {
      changed = false;
      outer: for (let g = 0; g < reduced.length; g++) for (let i = 0; i < reduced[g].length; i++) {
        const q = reduced[g][i];
        if (required.has(q.id)) continue;
        for (const replacement of [null, ...lower.get(q.id)]) {
          yield;
          const candidate = reduced.map((items) => [...items]);
          if (replacement) candidate[g][i] = replacement;
          else candidate[g].splice(i, 1);
          if (satisfied(candidate) && legal(candidate)) {
            reduced = candidate;
            changed = true;
            break outer;
          }
        }
      }
    }
    const key = signature(reduced);
    if (seen.has(key)) return;
    seen.add(key);
    if (solutions.length === 20) { truncated = true; return; }
    const config = yield* canonical(reduced);
    const attributes = sums(config);
    const slots = config.flatMap((items, g) => fit(items, groups[g].slots));
    slots.sort((a, b) => character.slots.findIndex((s) => s.id === a.slotId) - character.slots.findIndex((s) => s.id === b.slotId));
    solutions.push({ id: `solution-${solutions.length + 1}`, slots,
      lines: character.lines.map((slotIds, i) => ({ slotIds: [...slotIds], attributes: Object.fromEntries(ELEMENTS.map((e, j) => [e, attributes[i][j]])) })),
    });
  }
  function* extend(target, line, start) {
    yield;
    const totals = sums(placement);
    if (reaches(totals[line], target)) { yield* search(); return; }
    // 所有目标都必须仍有可达链；上界忽略类别冲突，保持乐观。
    const usedFamilies = new Set(placement.flat().map((q) => q.family));
    const remaining = optional.filter((q) => !usedFamilies.has(q.family));
    // 每条链的乐观上界与目标无关；各属性共享同一次孔位可行性检查。
    const upperBounds = new Map();
    function upperBound(l, e) {
      if (!upperBounds.has(l)) {
        const freeGroups = groups.flatMap((g, i) => g.lines.includes(l) && placement[i].length < g.slots.length ? [i] : []);
        const capacity = freeGroups.reduce((n, g) => n + groups[g].slots.length - placement[g].length, 0);
        const candidates = remaining.filter((q) => freeGroups.some((g) => canFit([...placement[g], q], groups[g])));
        upperBounds.set(l, { capacity, candidates, values: [] });
      }
      const { capacity, candidates, values } = upperBounds.get(l);
      if (values[e] !== undefined) return values[e];
      const best = new Map();
      for (const q of candidates) {
        if (q.values[e] > (best.get(q.family) ?? 0)) best.set(q.family, q.values[e]);
      }
      return values[e] = totals[l][e] + [...best.values()]
        .sort((a, b) => b - a).slice(0, capacity).reduce((a, b) => a + b, 0);
    }
    for (const goal of targets) {
      if (totals.some((values) => reaches(values, goal))) continue;
      const possible = character.lines.some((_, l) => {
        return goal.every((value, e) => totals[l][e] >= value || upperBound(l, e) >= value);
      });
      if (!possible) return;
    }
    const active = groups.flatMap((g, i) => g.lines.includes(line) ? [i] : []);
    const free = active.reduce((n, g) => n + groups[g].slots.length - placement[g].length, 0);
    if (!free) return;
    const current = totals[line];
    // 乐观上界仅剪去必定不可达分支，不用于近似返回。
    for (let e = 0; e < ELEMENTS.length; e++) {
      let max = 0;
      for (let i = start; i < optional.length; i++) max = Math.max(max, optional[i].values[e]);
      if (current[e] + free * max < target[e]) return;
    }
    for (let i = start; i < optional.length && !truncated; i++) {
      const q = optional[i];
      if (!q.values.some((v, e) => v > 0 && current[e] < target[e])) continue;
      for (const g of active) {
        placement[g].push(q);
        if (legal(placement)) yield* extend(target, line, i + 1);
        placement[g].pop();
        if (truncated) return;
      }
    }
  }
  // 每次补齐一个尚未满足的目标；不同魔法可以使用不同链。
  const visited = new Set();
  function* search() {
    yield;
    const key = JSON.stringify(placement.map((items) => items.map((q) => q.index).sort((a, b) => a - b)));
    if (visited.has(key)) return;
    visited.add(key);
    const lines = sums(placement);
    const target = targets.find((target) => !lines.some((values) => reaches(values, target)));
    if (!target) { yield* accept(); return; }
    for (let line = 0; line < character.lines.length && !truncated; line++) yield* extend(target, line, 0);
  }
  function* placeRequired(i) {
    yield;
    if (i === mandatory.length) {
      yield* search();
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
