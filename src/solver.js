/**
 * @typedef {{characterId: string, minimumAttributes: Record<string, number>, requiredQuartzIds: string[], excludedQuartzIds: string[]}} SolverRequest
 * @typedef {{id: string, slots: {slotId: string, quartzId: string}[], lines: {slotIds: string[], attributes: Record<string, number>}[]}} Solution
 * @typedef {{status: 'not-implemented'|'solved'|'no-solution', solutions: Solution[], message?: string}} SolverResponse
 */

/**
 * 接入点：替换此函数为本地算法或后端请求，保持请求与响应结构。
 * context 提供原始角色与回路数据；signal 可用于取消已过期的请求。
 * 本模块不判断游戏规则，不返回虚构解。
 * @param {SolverRequest} request
 * @param {{characters: object[], quartz: object[], signal?: AbortSignal}} context
 * @returns {Promise<SolverResponse>}
 */
export async function solveOrbment(request, context) {
  context.signal?.throwIfAborted();
  return { status: 'not-implemented', solutions: [], message: '配置条件已就绪，求解器尚未接入。' };
}
