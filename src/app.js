import { loadData } from './data.js';
import { solveOrbment } from './solver.js';

const $ = (selector) => document.querySelector(selector);
const colors = { 地: '#b38a43', 水: '#5389ac', 火: '#c56852', 风: '#58997b', 时: '#8b719d', 空: '#be9c42', 幻: '#ab7b99' };
const selected = { required: new Set(), excluded: new Set() };
let data, controller, revision = 0;
const pickers = [];
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

function emptyResult(title, message) {
  $('#results').innerHTML = `<div class="empty-state"><h3>${escape(title)}</h3><p>${escape(message)}</p></div>`;
}

function changed() {
  revision++;
  controller?.abort();
  $('#solve').disabled = false;
  $('#solve').innerHTML = '计算';
  const count = [...document.querySelectorAll('.element-input')].filter((input) => Number(input.value) > 0).length;
  $('#condition-summary').textContent = `${count} 项属性需求 · ${selected.required.size} 个必选 · ${selected.excluded.size} 个排除`;
  $('#result-badge').textContent = '等待配置';
  emptyResult('尚未计算', '设置条件后点击「计算」。');
}

function renderCharacter() {
  const character = data.characters.find((entry) => entry.id === $('#character').value);
  $('#character-info').innerHTML = `<div class="character-stats"><span>${character.slots.length} 孔</span><span>${character.lines.length} 条链</span></div>`;
  const positions = new Map([[character.center_slot, [150, 150]]]);
  const others = character.slots.filter((slot) => slot.id !== character.center_slot);
  others.forEach((slot, index) => { const angle = -Math.PI / 2 + index * Math.PI * 2 / others.length; positions.set(slot.id, [150 + 109 * Math.cos(angle), 150 + 109 * Math.sin(angle)]); });
  const lineColors = ['#638e88', '#c09d66', '#9b85ab', '#7399b3'];
  const paths = character.lines.map((line, index) => `<polyline points="${line.map((id) => positions.get(id).join(',')).join(' ')}" stroke="${lineColors[index % lineColors.length]}" fill="none" stroke-width="2"/>`).join('');
  const nodes = character.slots.map((slot, index) => { const [x, y] = positions.get(slot.id); const center = slot.id === character.center_slot; return `<g><title>${escape(slot.id)}${slot.required_element ? ` · ${slot.required_element}属性限定` : ' · 无属性限定'}</title><circle cx="${x}" cy="${y}" r="${center ? 25 : 21}" fill="${center ? '#285b55' : '#faf9f4'}" stroke="${slot.required_element ? colors[slot.required_element] : '#b9c8be'}" stroke-width="${slot.required_element ? 3 : 1.5}"/><text x="${x}" y="${y + 5}" text-anchor="middle" fill="${center ? '#fff' : '#48605b'}" font-size="14">${center ? '中' : index}</text></g>`; }).join('');
  $('#orbment').innerHTML = `<svg viewBox="0 0 300 300" role="img" aria-label="${escape(character.name)}的导力器链条，中央孔共用"><circle cx="150" cy="150" r="132" fill="none" stroke="#e2e5da"/><circle cx="150" cy="150" r="78" fill="none" stroke="#e2e5da" stroke-dasharray="3 6"/>${paths}${nodes}</svg>`;
  $('#line-legend').innerHTML = character.lines.map((_, index) => `<span><i style="background:${lineColors[index % lineColors.length]}"></i>链 ${index + 1}</span>`).join('');
  const limits = character.slots.filter((slot) => slot.required_element);
  if (limits.length) $('#line-legend').insertAdjacentHTML('beforeend', `<p class="slot-limits">属性限定：${limits.map((slot) => `${slot.id === character.center_slot ? '中央孔' : '孔 ' + character.slots.indexOf(slot)} · ${escape(slot.required_element)}`).join(' / ')}</p>`);
}

function createPicker(kind, title) {
  const root = $(`#${kind}-picker`);
  const other = kind === 'required' ? 'excluded' : 'required';
  root.innerHTML = `<details class="picker"><summary>${title}<span class="picker-count">0</span><span class="chevron">⌄</span></summary><div class="picker-popover"><input type="search" placeholder="搜索回路名称或属性…" aria-label="搜索${title}" class="quartz-search"><div class="quartz-options"></div></div></details><div class="selected-tags"></div>`;
  const details = root.querySelector('details');
  const search = root.querySelector('input');
  function renderOptions() {
    const query = search.value.trim().toLowerCase();
    const items = data.quartz.filter((quartz) => `${quartz.name}${quartz.element}`.toLowerCase().includes(query));
    root.querySelector('.quartz-options').innerHTML = items.length ? items.map((quartz) => `<label class="quartz-option ${selected[other].has(quartz.id) ? 'unavailable' : ''}"><input type="checkbox" value="${escape(quartz.id)}" ${selected[kind].has(quartz.id) ? 'checked' : ''} ${selected[other].has(quartz.id) ? 'disabled' : ''}><span class="element-dot" style="--element:${colors[quartz.element]}">${escape(quartz.element)}</span><span>${escape(quartz.name)}<small>${Object.entries(quartz.attributes).map(([element, value]) => `${element} ${value}`).join(' · ')}${selected[other].has(quartz.id) ? ' · 已在另一列表选择' : ''}</small></span></label>`).join('') : '<p class="no-matches">没有找到匹配的回路</p>';
  }
  function render() {
    root.querySelector('.picker-count').textContent = selected[kind].size;
    root.querySelector('.selected-tags').innerHTML = [...selected[kind]].map((id) => `<button type="button" class="tag" data-remove="${escape(id)}" aria-label="移除${escape(id)}">${escape(id)} <span>×</span></button>`).join('');
    renderOptions();
  }
  root.addEventListener('change', (event) => {
    if (event.target.type !== 'checkbox') return;
    if (event.target.checked) selected[kind].add(event.target.value); else selected[kind].delete(event.target.value);
    pickers.forEach((picker) => picker.render()); changed();
  });
  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove]');
    if (!button) return;
    selected[kind].delete(button.dataset.remove); pickers.forEach((picker) => picker.render()); changed();
    root.querySelector('summary').focus();
  });
  search.addEventListener('input', renderOptions);
  details.addEventListener('toggle', () => { if (details.open) { pickers.filter((picker) => picker.details !== details).forEach((picker) => { picker.details.open = false; }); search.focus(); } });
  root.addEventListener('keydown', (event) => { if (event.key === 'Escape') { details.open = false; root.querySelector('summary').focus(); } });
  const picker = { render, details, reset() { search.value = ''; details.open = false; render(); } };
  pickers.push(picker); render();
}

function renderSolutions(response) {
  if (response.status === 'not-implemented') { $('#result-badge').textContent = '待接入'; emptyResult('求解器尚未接入', response.message || '求解接口尚未实现。'); return; }
  if (response.status === 'no-solution') { $('#result-badge').textContent = '暂无可行配置'; emptyResult('没有找到满足条件的方案', response.message || '请尝试调整目标属性或回路偏好。'); return; }
  if (response.status !== 'solved' || !Array.isArray(response.solutions) || !response.solutions.length) throw new Error('求解器返回了无效的结果格式');
  $('#result-badge').textContent = `${response.solutions.length} 个方案`;
  $('#results').innerHTML = response.solutions.map((solution, index) => `<article class="solution"><h3>配置方案 ${index + 1}</h3><div class="solution-slots">${solution.slots.map((slot) => `<div><small>${escape(slot.slotId === 'center' ? '中央孔' : slot.slotId)}</small><strong>${escape(data.quartz.find((quartz) => quartz.id === slot.quartzId)?.name || slot.quartzId)}</strong></div>`).join('')}</div><div class="solution-lines">${solution.lines.map((line, lineIndex) => `<p>链 ${lineIndex + 1} <span>${Object.entries(line.attributes).map(([element, value]) => `${escape(element)} ${escape(value)}`).join(' · ')}</span></p>`).join('')}</div></article>`).join('');
}

$('#config-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!data) return;
  const values = [...document.querySelectorAll('.element-input')];
  if (values.some((input) => !Number.isSafeInteger(Number(input.value)) || Number(input.value) < 0)) { emptyResult('请检查属性值', '属性值需要是非负的安全整数。'); return; }
  const request = { characterId: $('#character').value, minimumAttributes: Object.fromEntries(values.map((input) => [input.dataset.element, Number(input.value)])), requiredQuartzIds: [...selected.required], excludedQuartzIds: [...selected.excluded] };
  controller?.abort(); controller = new AbortController();
  const currentRevision = ++revision;
  $('#solve').disabled = true; $('#solve').textContent = '正在求解…'; $('#result-badge').textContent = '求解中';
  emptyResult('正在计算', '正在根据当前角色与条件请求求解器。');
  pickers.forEach((picker) => { picker.details.open = false; });
  try {
    const response = await solveOrbment(request, { characters: data.characters, quartz: data.quartz, signal: controller.signal });
    if (revision === currentRevision) renderSolutions(response);
  } catch (error) {
    if (revision === currentRevision && error.name !== 'AbortError') { $('#result-badge').textContent = '请求失败'; emptyResult('暂时无法生成配置', error.message || '请稍后重试。'); }
  } finally {
    if (revision === currentRevision) { $('#solve').disabled = false; $('#solve').innerHTML = '计算'; }
  }
});

$('#reset').addEventListener('click', () => {
  if (!data) return;
  document.querySelectorAll('.element-input').forEach((input) => { input.value = 0; });
  selected.required.clear(); selected.excluded.clear(); pickers.forEach((picker) => picker.reset()); changed();
});
document.addEventListener('click', (event) => { pickers.forEach((picker) => { if (!picker.details.contains(event.target)) picker.details.open = false; }); });

try {
  data = await loadData();
  $('#character').innerHTML = data.characters.map((character) => `<option value="${escape(character.id)}">${escape(character.name)}</option>`).join('');
  $('#character').disabled = false;
  $('#character').addEventListener('change', () => { renderCharacter(); changed(); });
  $('#elements').innerHTML = data.elements.map((element) => `<label class="element-card" style="--element:${colors[element]}"><span class="element-symbol">${escape(element)}</span><input class="element-input" aria-label="${escape(element)}属性最低值" data-element="${escape(element)}" type="number" min="0" max="9007199254740991" step="1" value="0" required inputmode="numeric"></label>`).join('');
  $('#elements').addEventListener('input', changed);
  renderCharacter(); createPicker('required', '选择必选回路'); createPicker('excluded', '选择排除回路'); $('#solve').disabled = false;
} catch (error) { $('#result-badge').textContent = '数据加载失败'; emptyResult('无法加载配置数据', error.message); }
