#!/usr/bin/env node
/**
 * 无头模拟器：批量跑局，校验数据，产出平衡数据。
 *
 *   node tools/simulate.js          # 默认 300 局
 *   node tools/simulate.js 1000     # 指定局数
 *
 * 退出码：数据校验失败 = 1，正常 = 0
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const Core = require(path.join(ROOT, 'src/core.js'));

const eventsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/events.json'), 'utf8'));
const endingsRaw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/endings.json'), 'utf8'));
const EVENTS = eventsRaw.events;
const ENDINGS = endingsRaw.endings;

// ---------------------------------------------------------------- 数据校验
function validate() {
  const problems = [];
  const ids = new Set();
  const ALLOWED_EFFECT_KEYS = new Set(Core.ATTRS.concat(Core.RESOURCES));
  const ALLOWED_STAGES = new Set(['child', 'teen', 'youth', 'adult', 'middle', 'general']);

  for (const e of EVENTS) {
    const at = `事件 ${e.id || '(无 id)'}`;

    if (!e.id) problems.push(`${at}: 缺少 id`);
    else if (ids.has(e.id)) problems.push(`${at}: id 重复`);
    else ids.add(e.id);

    if (!e.title) problems.push(`${at}: 缺少 title`);
    if (!e.text) problems.push(`${at}: 缺少 text`);
    if (!ALLOWED_STAGES.has(e.stage)) problems.push(`${at}: stage 非法（${e.stage}）`);
    if (typeof e.ageMin !== 'number' || typeof e.ageMax !== 'number') problems.push(`${at}: 年龄区间缺失`);
    if (e.ageMin > e.ageMax) problems.push(`${at}: ageMin > ageMax`);
    if (!Array.isArray(e.options) || e.options.length < 2) problems.push(`${at}: 选项少于 2 个`);
    if ((e.weight || 0) < 1) problems.push(`${at}: weight 必须 >= 1`);

    for (const [i, o] of (e.options || []).entries()) {
      const oat = `${at} 选项 ${i + 1}`;
      if (!o.text) problems.push(`${oat}: 缺少 text`);

      for (const key of Object.keys(o.effects || {})) {
        if (!ALLOWED_EFFECT_KEYS.has(key)) problems.push(`${oat}: effects 含未知字段 ${key}`);
      }

      if (o.check) {
        if (Core.ATTRS.indexOf(o.check.attr) < 0) problems.push(`${oat}: check.attr 非法（${o.check.attr}）`);
        if (typeof o.check.difficulty !== 'number') problems.push(`${oat}: check.difficulty 缺失`);
        if (!o.check.success) problems.push(`${oat}: 缺少 check.success`);
        if (!o.check.fail) problems.push(`${oat}: 缺少 check.fail`);
        for (const branch of ['success', 'fail']) {
          const b = o.check[branch];
          if (!b) continue;
          for (const key of Object.keys(b.effects || {})) {
            if (!ALLOWED_EFFECT_KEYS.has(key)) problems.push(`${oat}.${branch}: effects 含未知字段 ${key}`);
          }
        }
      }
    }
  }

  const endingIds = new Set(ENDINGS.map((e) => e.id));
  for (const id of Core.ENDING_ORDER) {
    if (!endingIds.has(id)) problems.push(`结局文案缺失：${id}`);
  }
  for (const e of ENDINGS) {
    if (!e.title || !e.text || !e.epitaph) problems.push(`结局 ${e.id}: 文案不完整`);
  }

  return { problems, ids };
}

// ---------------------------------------------------------------- 单局
function playOne(seed, strategy) {
  const state = Core.createGame(seed, {
    origin: ['normal', 'rich', 'poor'][seed % 3],
    talent: ['scholar', 'social', 'iron', 'lucky'][(seed >>> 7) % 4],
    name: '模拟体'
  });

  const seen = new Map();
  let steps = 0;

  while (!state.dead && steps < 500) {
    steps++;
    const year = Core.advanceYear(state, EVENTS);
    if (year.dead) break;
    if (!year.event) continue;

    const count = seen.get(year.event.id) || 0;
    seen.set(year.event.id, count + 1);

    const options = year.event.options;
    let index = 0;
    if (strategy === 'random') index = Core.randomInt(state, options.length);
    else if (strategy === 'last') index = options.length - 1;

    Core.resolveOption(state, year.event, index);
  }

  return {
    age: state.age,
    ending: state.endingId || Core.evaluateEnding(state),
    money: state.resources.money,
    health: state.resources.health,
    happiness: state.resources.happiness,
    tags: state.tags,
    distinctEvents: seen.size,
    maxRepeat: Math.max(0, ...seen.values()),
    years: state.yearsPlayed
  };
}

// ---------------------------------------------------------------- 统计
function median(list) {
  if (list.length === 0) return 0;
  const sorted = list.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function avg(list) {
  if (list.length === 0) return 0;
  return list.reduce((a, b) => a + b, 0) / list.length;
}

function runSuite(label, count, strategy) {
  const results = [];
  for (let i = 1; i <= count; i++) results.push(playOne(i * 2654435761 % 4294967296, strategy));

  const ages = results.map((r) => r.age);
  const endings = {};
  for (const r of results) endings[r.ending] = (endings[r.ending] || 0) + 1;

  return {
    label,
    count,
    ageMin: Math.min(...ages),
    ageMax: Math.max(...ages),
    ageAvg: Math.round(avg(ages)),
    ageMedian: median(ages),
    endings,
    moneyAvg: Math.round(avg(results.map((r) => r.money))),
    happinessAvg: Math.round(avg(results.map((r) => r.happiness))),
    eventsAvg: (avg(results.map((r) => r.distinctEvents))).toFixed(1),
    maxRepeat: Math.max(...results.map((r) => r.maxRepeat))
  };
}

// ---------------------------------------------------------------- 主流程
function main() {
  const count = Number(process.argv[2]) || 500;
  const { problems } = validate();

  console.log('');
  console.log('=== 数据校验 ===');
  if (problems.length === 0) {
    console.log(`  通过：${EVENTS.length} 个事件，${ENDINGS.length} 个结局`);
  } else {
    console.log(`  发现 ${problems.length} 个问题：`);
    problems.forEach((p) => console.log('   - ' + p));
  }

  console.log('');
  console.log(`=== 模拟 ${count} 局 × 3 种选择策略 ===`);

  const suites = [
    runSuite('随机选', count, 'random'),
    runSuite('总选第一个', count, 'first'),
    runSuite('总选最后一个', count, 'last')
  ];

  const allEndings = new Set();
  for (const s of suites) {
    console.log('');
    console.log(`[${s.label}]`);
    console.log(`  死亡年龄   平均 ${s.ageAvg}  中位 ${s.ageMedian}  区间 ${s.ageMin}~${s.ageMax}`);
    console.log(`  事件体验   平均去重 ${s.eventsAvg} 个，单个事件最多重复 ${s.maxRepeat} 次`);
    console.log(`  终局均值   金钱 ${s.moneyAvg}  幸福 ${s.happinessAvg}`);
    console.log('  结局分布   ' + Object.keys(s.endings).map((k) => `${k} ${s.endings[k]}`).join('  '));
    Object.keys(s.endings).forEach((k) => allEndings.add(k));
  }

  console.log('');
  console.log('=== 结局覆盖 ===');
  for (const id of Core.ENDING_ORDER) {
    console.log(`  ${id.padEnd(14)} ${allEndings.has(id) ? '已覆盖' : '⚠ 未触发'}`);
  }

  const missing = Core.ENDING_ORDER.filter((id) => !allEndings.has(id));
  console.log('');
  if (problems.length > 0) {
    console.log('数据校验未通过。');
    process.exit(1);
  }
  if (missing.length > 0) {
    console.log('提示：有结局在这轮模拟中没出现，可能是稀有结局，也可能是条件不可达。');
    console.log('     加局数再看：node tools/simulate.js 2000');
  }
  console.log('完成。');
}

main();
