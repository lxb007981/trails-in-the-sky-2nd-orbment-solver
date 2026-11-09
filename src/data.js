export function parseQuartz(text) {
  return text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, element, values] = line.split('\t');
    if (!name || !element || !values) throw new Error('回路数据格式不正确');
    return { id: name, name, element, attributes: Object.fromEntries([...values.matchAll(/([地水火风时空幻])×(\d+)/g)].map((m) => [m[1], Number(m[2])])) };
  });
}

export function parseArts(text) {
  const [header, ...rows] = text.replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  if (header !== '名字,属性,属性需求') throw new Error('魔法数据格式不正确');
  return parseQuartz(rows.filter(Boolean).map((row) => row.replaceAll(',', '\t')).join('\n'));
}

export function completeAttributes(current, arts) {
  const result = { ...current };
  for (const art of arts) {
    for (const [element, value] of Object.entries(art.attributes)) {
      result[element] = Math.max(result[element] || 0, value);
    }
  }
  return result;
}

export async function loadData() {
  const responses = await Promise.all([fetch('./sora-2nd-orbments.json'), fetch('./sora-2nd-quartz.csv'), fetch('./sora-2nd-arts.csv')]);
  if (responses.some((response) => !response.ok)) throw new Error('无法加载角色、回路或魔法数据，请刷新重试。');
  const [orbments, quartzText, artsText] = await Promise.all([responses[0].json(), responses[1].text(), responses[2].text()]);
  return { ...orbments, quartz: parseQuartz(quartzText), arts: parseArts(artsText) };
}
