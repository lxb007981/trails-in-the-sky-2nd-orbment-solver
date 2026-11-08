export function parseQuartz(text) {
  return text.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, element, values] = line.split('\t');
    if (!name || !element || !values) throw new Error('回路数据格式不正确');
    return { id: name, name, element, attributes: Object.fromEntries([...values.matchAll(/([地水火风时空幻])×(\d+)/g)].map((m) => [m[1], Number(m[2])])) };
  });
}

export async function loadData() {
  const responses = await Promise.all([fetch('./sora-2nd-orbments.json'), fetch('./sora-2nd-quartz.csv')]);
  if (responses.some((response) => !response.ok)) throw new Error('无法加载角色或回路数据，请刷新重试。');
  const [orbments, quartzText] = await Promise.all([responses[0].json(), responses[1].text()]);
  return { ...orbments, quartz: parseQuartz(quartzText) };
}
