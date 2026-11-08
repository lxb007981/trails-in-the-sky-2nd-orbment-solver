# 空之轨迹 the 2nd 导力器求解器

原生 HTML / CSS / JavaScript 页面，无需安装依赖。使用仓库已有的角色 JSON 和制表符分隔回路文件；本轮仅实现界面，不实现求解算法、配装合法性判断或魔法规则。

## 本地启动

需要 Node.js 22 或更新版本。

```sh
npm run dev
```

访问 http://127.0.0.1:5173 。页面通过 fetch 读取数据，因此请通过 HTTP 启动，不要直接双击 HTML。静态部署时保留 index.html、src/ 和两个数据文件的相对路径即可。字体使用本机字体，无需访问外部字体服务。

## 已实现

- 角色选择、按角色数据绘制链条、中央孔与属性限定提示。
- 地、水、火、风、时、空、幻七种非负整数属性需求。
- 可搜索的回路多选下拉框、必选与排除互斥、标签移除、条件重置。
- 待配置、求解中、待接入、无解、结果及错误状态。
- 窄屏布局、键盘操作、表单校验。条件改变时取消旧请求，避免旧结果覆盖新条件。

## 求解接口

替换 `src/solver.js` 中的异步 `solveOrbment(request, context)` 即可，页面无需调整。默认返回 `not-implemented`，不提供模拟结果。

请求示例：

```js
{
  characterId: 'estelle',
  minimumAttributes: { 地: 0, 水: 3, 火: 0, 风: 0, 时: 0, 空: 0, 幻: 0 },
  requiredQuartzIds: ['防御1'],
  excludedQuartzIds: ['防御2']
}
```

当前一个请求代表一组需由同一条链达到的最低属性值。回路 ID 使用数据中唯一的名称；未来若数据提供稳定 ID，应同步替换解析器与算法。`context.characters` 为原始角色数据；`context.quartz` 包含 `{ id, name, element, attributes }`；`context.signal` 用于取消请求。后端接入可使用 `fetch('/api/solve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: context.signal })`，并检查 HTTP 状态。

响应约定：

```js
// 未接入
{ status: 'not-implemented', solutions: [], message: '求解器尚未接入' }
// 无解
{ status: 'no-solution', solutions: [], message: '可选说明' }
// 有解（以下仅表示数据结构，实际应返回角色全部孔位与链条）
{
  status: 'solved',
  solutions: [{
    id: 'solution-1',
    slots: [{ slotId: 'center', quartzId: '防御1' }],
    lines: [{ slotIds: ['center', '1-1', '1-2', '1-3'], attributes: { 地: 1, 水: 3 } }]
  }]
}
```

算法负责属性汇总、孔位限制、重复装备限制及所有游戏规则。页面只展示返回的方案与链属性，不推导可行性。异常可以直接抛出，由界面显示错误。

执行 `npm test` 可检查真实数据解析与默认接口行为。
