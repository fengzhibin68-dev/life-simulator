/**
 * life-simulator · 核心逻辑
 *
 * 这个文件不碰 DOM，可以单独在 Node 里跑（tools/simulate.js 就靠它做批量回归）。
 * 所有规则以 docs/接口.md 为准。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;

  const ATTRS = ['intelligence', 'charm', 'constitution', 'eq', 'will', 'luck'];
  const RESOURCES = ['money', 'health', 'stress', 'happiness'];

  // 每年压力自然缓解量（平衡参数，见 docs/需求.md 的待确认 Q3）
  const STRESS_RECOVERY = 3;

  // 开局属性分配（见 docs/接口.md「属性分配」）
  const ATTR_POINT_TOTAL = 300;
  const ATTR_ALLOC_MAX = 100;

  const ATTR_LABELS = {
    intelligence: '智力',
    charm: '魅力',
    constitution: '体质',
    eq: '情商',
    will: '意志',
    luck: '运气'
  };

  const RESOURCE_LABELS = {
    money: '金钱',
    health: '健康',
    stress: '压力',
    happiness: '幸福'
  };

  const TALENTS = {
    scholar: { name: '读书料', desc: '学习类判定 +8' },
    social: { name: '社交达人', desc: '社交类判定 +8' },
    iron: { name: '铁打身体', desc: '健康损失减半' },
    lucky: { name: '锦鲤', desc: '判定时运气 +10' }
  };

  const ORIGINS = {
    normal: {
      name: '普通家庭',
      desc: '起始金钱 1000，压力 0，幸福 50',
      start: { money: 1000, stress: 0, happiness: 50 }
    },
    rich: {
      name: '富裕家庭',
      desc: '起始金钱 6000，压力 +10',
      start: { money: 6000, stress: 10, happiness: 50 }
    },
    poor: {
      name: '困难家庭',
      desc: '起始金钱 0，没有启动资金',
      start: { money: 0, stress: 0, happiness: 50 }
    },
    custom: {
      name: '自定义',
      desc: '起始金钱 / 压力 / 幸福自己填',
      start: { money: 1000, stress: 0, happiness: 50 }
    }
  };

  // 年龄 -> 每年基础死亡概率
  function deathRiskByAge(age) {
    if (age >= 110) return 0.30;
    if (age >= 100) return 0.20;
    if (age >= 90) return 0.12;
    if (age >= 80) return 0.07;
    if (age >= 70) return 0.03;
    if (age >= 60) return 0.01;
    return 0;
  }

  // 年龄 -> 每年健康自然衰减
  function healthDecayByAge(age) {
    if (age >= 85) return 5;
    if (age >= 70) return 3;
    if (age >= 50) return 2;
    if (age >= 30) return 1;
    return 0;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  // ---------------------------------------------------------------- 随机数
  // mulberry32 的纯函数版：状态存在 state.rngState 里，存档后序列可复现
  function nextRandom(state) {
    let t = (state.rngState = (state.rngState + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randomInt(state, max) {
    return Math.floor(nextRandom(state) * max);
  }

  function pickWeighted(state, list, weightOf) {
    let total = 0;
    for (const item of list) total += weightOf(item);
    if (total <= 0) return null;
    let roll = nextRandom(state) * total;
    for (const item of list) {
      roll -= weightOf(item);
      if (roll < 0) return item;
    }
    return list[list.length - 1];
  }

  // ---------------------------------------------------------------- 属性分配
  /**
   * 校验开局的属性分配：每项取整并夹到 0~100，总和不得超过 300。
   * 返回 { ok, spent, remaining, values, errors }，values 可直接喂给 createGame。
   */
  function validateAttrs(attrs) {
    const values = {};
    const errors = [];
    let spent = 0;

    for (const key of ATTRS) {
      const raw = attrs ? Number(attrs[key]) : NaN;
      let value = isFinite(raw) ? Math.round(raw) : 0;

      if (value < 0) {
        errors.push(key + ' 不能小于 0');
        value = 0;
      } else if (value > ATTR_ALLOC_MAX) {
        errors.push(key + ' 不能大于 ' + ATTR_ALLOC_MAX);
        value = ATTR_ALLOC_MAX;
      }

      values[key] = value;
      spent += value;
    }

    const remaining = ATTR_POINT_TOTAL - spent;
    if (remaining < 0) {
      errors.push('属性点超出预算：已用 ' + spent + ' / ' + ATTR_POINT_TOTAL);
    }

    return { ok: errors.length === 0, spent: spent, remaining: remaining, values: values, errors: errors };
  }

  function numberOr(value, fallback) {
    const num = Number(value);
    return isFinite(num) ? num : fallback;
  }

  // ---------------------------------------------------------------- 初始化
  function createGame(seed, options) {
    const opts = options || {};
    const origin = ORIGINS[opts.origin] ? opts.origin : 'normal';
    const talent = TALENTS[opts.talent] ? opts.talent : 'scholar';
    const attrMode = opts.attrMode === 'random' ? 'random' : 'alloc';

    // 不传 attrs 时按全 50 兜底：tools/simulate.js 和旧调用都还按老方式跑
    const allocated = validateAttrs(opts.attrs || { intelligence: 50, charm: 50, constitution: 50, eq: 50, will: 50, luck: 50 });
    // 随机人生每项独立随机，不受 300 点预算约束；自由加点才校验
    if (attrMode !== 'random' && allocated.remaining < 0) {
      throw new Error('属性点超出预算：' + allocated.spent + ' / ' + ATTR_POINT_TOTAL);
    }

    const attrs = {};
    for (const key of ATTRS) attrs[key] = allocated.values[key];

    const base = ORIGINS[origin].start;
    const override = opts.startResources || {};
    const resources = {
      money: Math.max(0, Math.round(numberOr(override.money, base.money))),
      health: clamp(Math.round(numberOr(override.health, 100)), 0, 100),
      stress: clamp(Math.round(numberOr(override.stress, base.stress)), 0, 100),
      happiness: clamp(Math.round(numberOr(override.happiness, base.happiness)), 0, 100)
    };

    return {
      version: VERSION,
      seed: seed >>> 0,
      rngState: seed >>> 0,
      name: opts.name || '无名氏',
      age: 0,
      origin: origin,
      talent: talent,
      attrMode: attrMode,
      attrs: attrs,
      resources: resources,
      tags: [],
      flags: {},
      log: [],
      usedEvents: {},
      eventCounts: {},
      currentEventId: null,
      endingId: null,
      goodStreak: 0,
      yearsPlayed: 0,
      dead: false
    };
  }

  // ---------------------------------------------------------------- 数值改动
  function applyHealthDelta(state, delta) {
    let value = delta;
    if (value < 0 && state.talent === 'iron') {
      value = -Math.ceil(Math.abs(value) / 2);
    }
    state.resources.health = clamp(state.resources.health + value, 0, 100);
  }

  function applyEffects(state, effects) {
    if (!effects) return [];
    const changes = [];

    for (const key of Object.keys(effects)) {
      const delta = Number(effects[key]) || 0;
      if (delta === 0) continue;

      if (ATTRS.indexOf(key) >= 0) {
        const before = state.attrs[key];
        // 开局后属性只保留下限 0，不再夹上限（见 docs/需求.md「属性与资源」）
        state.attrs[key] = Math.max(0, before + delta);
        changes.push({ key: key, label: ATTR_LABELS[key], delta: state.attrs[key] - before });
      } else if (key === 'health') {
        const before = state.resources.health;
        applyHealthDelta(state, delta);
        changes.push({ key: key, label: '健康', delta: state.resources.health - before });
      } else if (RESOURCES.indexOf(key) >= 0) {
        const before = state.resources[key];
        const max = key === 'money' ? Number.MAX_SAFE_INTEGER : 100;
        state.resources[key] = clamp(before + delta, 0, max);
        changes.push({ key: key, label: RESOURCE_LABELS[key], delta: state.resources[key] - before });
      }
    }

    return changes.filter(function (c) { return c.delta !== 0; });
  }

  function addTag(state, tag) {
    if (tag && state.tags.indexOf(tag) < 0) state.tags.push(tag);
  }

  function addLog(state, text, kind) {
    state.log.push({ age: state.age, text: text, kind: kind || 'event' });
  }

  function formatText(text, state) {
    return String(text || '').replace(/\{name\}/g, state.name);
  }

  // ---------------------------------------------------------------- 判定
  function talentAttrBonus(state, attr) {
    if (state.talent === 'scholar' && attr === 'intelligence') return 8;
    if (state.talent === 'social' && (attr === 'charm' || attr === 'eq')) return 8;
    return 0;
  }

  function successRate(state, check) {
    let attrValue = state.attrs[check.attr];
    if (typeof attrValue !== 'number') attrValue = 50;
    attrValue += talentAttrBonus(state, check.attr);

    let luck = state.attrs.luck;
    if (state.talent === 'lucky') luck += 10;

    const difficulty = typeof check.difficulty === 'number' ? check.difficulty : 50;
    const rate = 0.5 + (attrValue - 50) * 0.006 + (luck - 50) * 0.002 - (difficulty - 50) * 0.01;
    return clamp(rate, 0.05, 0.95);
  }

  function judge(state, check) {
    const rate = successRate(state, check);
    const roll = nextRandom(state);
    return { rate: rate, roll: roll, success: roll < rate };
  }

  // ---------------------------------------------------------------- 条件
  function readTarget(state, target) {
    if (target.indexOf('tag:') === 0) {
      return state.tags.indexOf(target.slice(4)) >= 0 ? 1 : 0;
    }
    if (target.indexOf('flag:') === 0) {
      return state.flags[target.slice(5)] ? 1 : 0;
    }
    if (target === 'age') return state.age;
    if (Object.prototype.hasOwnProperty.call(state.attrs, target)) return state.attrs[target];
    if (Object.prototype.hasOwnProperty.call(state.resources, target)) return state.resources[target];
    return 0;
  }

  function matchCondition(state, cond) {
    const left = readTarget(state, cond.target);
    const right = Number(cond.value);
    switch (cond.op) {
      case '>=': return left >= right;
      case '<=': return left <= right;
      case '>': return left > right;
      case '<': return left < right;
      case '==': return left === right;
      case '!=': return left !== right;
      default: return false;
    }
  }

  function matchConditions(state, conditions) {
    if (!conditions || conditions.length === 0) return true;
    for (const cond of conditions) {
      if (!matchCondition(state, cond)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- 事件抽取
  function isAvailable(state, event) {
    const lastAge = state.usedEvents[event.id];
    const used = typeof lastAge === 'number';

    if (used && event.once) return false;

    const cooldown = typeof event.cooldown === 'number' ? event.cooldown : 3;
    if (used && state.age - lastAge <= cooldown) return false;

    // 60 岁以后，中年 / 通用事件不再受年龄区间限制，靠冷却控制重复。
    // 老年阶段的冷却要更严，否则同一张卡会连着刷十几年。
    const isOld = state.age > 60;
    const reusable = event.stage === 'middle' || event.stage === 'general';
    if (isOld && reusable) {
      const effective = Math.max(cooldown, 8);
      if (used && state.age - lastAge <= effective) return false;
      return matchConditions(state, event.conditions);
    }

    if (state.age < event.ageMin || state.age > event.ageMax) return false;

    return matchConditions(state, event.conditions);
  }

  function pickEvent(state, events) {
    const forced = events.filter(function (e) {
      return e.forced && isAvailable(state, e);
    });
    if (forced.length > 0) return forced[0];

    const pool = events.filter(function (e) { return isAvailable(state, e); });
    if (pool.length === 0) return null;

    const boostGood = state.goodStreak >= 3;
    const counts = state.eventCounts || {};

    return pickWeighted(state, pool, function (e) {
      let weight = Math.max(1, e.weight || 1);
      if (boostGood && e.tone === 'good') weight *= 1.8;
      // 见过的事件权重递减，避免同一个事件刷满一生
      weight = weight / (1 + (counts[e.id] || 0) * 0.6);
      return weight;
    });
  }

  // ---------------------------------------------------------------- 选择结算
  function resolveOption(state, event, index) {
    const option = event.options[index];
    if (!option) return null;

    const result = {
      optionText: option.text,
      judged: false,
      success: null,
      rate: null,
      changes: [],
      log: []
    };

    state.usedEvents[event.id] = state.age;
    if (!state.eventCounts) state.eventCounts = {};
    state.eventCounts[event.id] = (state.eventCounts[event.id] || 0) + 1;

    const directChanges = applyEffects(state, option.effects);
    result.changes = result.changes.concat(directChanges);

    if (option.tags) option.tags.forEach(function (t) { addTag(state, t); });
    if (option.log) {
      addLog(state, formatText(option.log, state), 'event');
      result.log.push(formatText(option.log, state));
    }

    if (option.check) {
      const outcome = judge(state, option.check);
      const branch = outcome.success ? option.check.success : option.check.fail;

      result.judged = true;
      result.success = outcome.success;
      result.rate = outcome.rate;

      if (branch) {
        result.changes = result.changes.concat(applyEffects(state, branch.effects));
        if (branch.tags) branch.tags.forEach(function (t) { addTag(state, t); });
        if (branch.log) {
          const text = formatText(branch.log, state);
          addLog(state, text, 'check');
          result.log.push(text);
        }
      }

      if (outcome.success && event.tone === 'good') state.goodStreak = 0;
      else if (!outcome.success && event.tone === 'bad') state.goodStreak += 1;
    } else if (event.tone === 'good') {
      state.goodStreak = 0;
    }

    state.currentEventId = null;
    return result;
  }

  // ---------------------------------------------------------------- 年份
  function settleYear(state) {
    state.age += 1;
    state.yearsPlayed += 1;

    const decay = healthDecayByAge(state.age);
    if (decay > 0) applyHealthDelta(state, -decay);

    // 压力每年自然缓解：没有这一条，压力只会单调涨到 100 并锁死
    state.resources.stress = clamp(state.resources.stress - STRESS_RECOVERY, 0, 100);

    if (state.resources.stress >= 80) {
      applyHealthDelta(state, -3);
      state.resources.happiness = clamp(state.resources.happiness - 5, 0, 100);
    }

    if (state.resources.money <= 0) {
      state.resources.happiness = clamp(state.resources.happiness - 3, 0, 100);
    }
  }

  function deathChance(state) {
    const base = deathRiskByAge(state.age);
    if (base <= 0) return 0;
    let chance = base;
    if (state.resources.health < 50) chance += 0.02;
    if (state.resources.health < 25) chance += 0.05;
    return clamp(chance, 0, 1);
  }

  function checkDeath(state) {
    if (state.resources.health <= 0) {
      state.dead = true;
      return { dead: true, cause: 'health' };
    }
    if (state.age >= 120) {
      state.dead = true;
      return { dead: true, cause: 'age' };
    }
    if (state.age >= 60) {
      const chance = deathChance(state);
      if (nextRandom(state) < chance) {
        state.dead = true;
        return { dead: true, cause: 'risk', chance: chance };
      }
    }
    return { dead: false, cause: null };
  }

  // ---------------------------------------------------------------- 结局
  const ENDING_ORDER = ['end_early', 'end_lonely', 'end_career', 'end_family', 'end_ordinary'];

  function hasAnyTag(state, names) {
    for (const name of names) {
      if (state.tags.indexOf(name) >= 0) return true;
    }
    return false;
  }

  function evaluateEnding(state) {
    const res = state.resources;

    if (res.health <= 0 || state.age < 60) return 'end_early';

    if (res.happiness < 40 && !hasAnyTag(state, ['已婚', '有子女', '挚友'])) return 'end_lonely';

    if (res.money >= 100000 || hasAnyTag(state, ['事业成功'])) return 'end_career';

    if (res.happiness >= 70 && hasAnyTag(state, ['已婚', '有子女'])) return 'end_family';

    return 'end_ordinary';
  }

  // ---------------------------------------------------------------- 一年
  /**
   * 推进一年：结算 -> 死亡判定 -> 抽事件
   * 返回 { dead, cause, event }
   */
  function advanceYear(state, events) {
    settleYear(state);
    const death = checkDeath(state);
    if (death.dead) {
      state.endingId = evaluateEnding(state);
      addLog(state, '你在 ' + state.age + ' 岁离开了这个世界。', 'life');
      return { dead: true, cause: death.cause, event: null };
    }

    const event = pickEvent(state, events);
    state.currentEventId = event ? event.id : null;
    if (event) addLog(state, formatText(event.title, state), 'event');
    return { dead: false, cause: null, event: event };
  }

  /**
   * 取人生高光：优先 check 类日志，其次事件日志，最多 n 条
   */
  function highlights(state, count) {
    const n = count || 3;
    const picks = [];
    const log = state.log || [];

    for (let i = log.length - 1; i >= 0 && picks.length < n; i--) {
      if (log[i].kind === 'check') picks.push(log[i]);
    }
    for (let i = log.length - 1; i >= 0 && picks.length < n; i--) {
      if (log[i].kind === 'event' && picks.indexOf(log[i]) < 0) picks.push(log[i]);
    }
    return picks.reverse();
  }

  return {
    VERSION: VERSION,
    ATTRS: ATTRS,
    RESOURCES: RESOURCES,
    ATTR_LABELS: ATTR_LABELS,
    RESOURCE_LABELS: RESOURCE_LABELS,
    TALENTS: TALENTS,
    ORIGINS: ORIGINS,
    ATTR_POINT_TOTAL: ATTR_POINT_TOTAL,
    ATTR_ALLOC_MAX: ATTR_ALLOC_MAX,
    ENDING_ORDER: ENDING_ORDER,
    createGame: createGame,
    validateAttrs: validateAttrs,
    applyEffects: applyEffects,
    applyHealthDelta: applyHealthDelta,
    addTag: addTag,
    addLog: addLog,
    formatText: formatText,
    successRate: successRate,
    judge: judge,
    deathChance: deathChance,
    healthDecayByAge: healthDecayByAge,
    matchConditions: matchConditions,
    isAvailable: isAvailable,
    pickEvent: pickEvent,
    resolveOption: resolveOption,
    settleYear: settleYear,
    checkDeath: checkDeath,
    evaluateEnding: evaluateEnding,
    advanceYear: advanceYear,
    highlights: highlights,
    nextRandom: nextRandom,
    randomInt: randomInt
  };
});
