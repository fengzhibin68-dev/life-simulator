/**
 * life-simulator · 界面
 * 只负责渲染和事件绑定；所有规则都在 src/core.js。
 */
(function () {
  'use strict';

  var C = window.GameCore;
  var S = window.GameStorage;

  var data = { events: [], endings: {} };
  var state = null;
  var currentEvent = null;
  var pendingOrigin = 'normal';
  var pendingTalent = null;
  var TALENT_POOL = ['scholar', 'social', 'iron', 'lucky'];

  function $(id) { return document.getElementById(id); }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === 'string') node.textContent = text;
    return node;
  }

  function show(screenId) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) {
      screens[i].classList.toggle('active', screens[i].id === screenId);
    }
    window.scrollTo(0, 0);
  }

  function stageLabel(age) {
    if (age <= 5) return '幼年';
    if (age <= 12) return '童年';
    if (age <= 18) return '少年';
    if (age <= 25) return '青年';
    if (age <= 40) return '成年';
    if (age <= 60) return '中年';
    return '老年';
  }

  function formatMoney(value) {
    return Number(value).toLocaleString('zh-CN');
  }

  // ------------------------------------------------------------ 启动
  function bootstrap() {
    Promise.all([
      fetch('data/events.json').then(function (r) {
        if (!r.ok) throw new Error('events.json ' + r.status);
        return r.json();
      }),
      fetch('data/endings.json').then(function (r) {
        if (!r.ok) throw new Error('endings.json ' + r.status);
        return r.json();
      })
    ]).then(function (results) {
      data.events = results[0].events;
      results[1].endings.forEach(function (e) { data.endings[e.id] = e; });

      var saved = S.load();
      if (saved && !saved.dead) {
        state = saved;
        enterGame();
        if (state.currentEventId) {
          var ev = findEvent(state.currentEventId);
          if (ev) { currentEvent = ev; renderEvent(ev); }
          else { renderFiller('你醒了过来，日子还要继续。'); }
        } else {
          renderFiller('你醒了过来，日子还要继续。');
        }
      } else {
        show('screen-start');
      }
    }).catch(function (err) {
      $('start-hint').textContent =
        '数据加载失败（' + err.message + '）。' +
        '请用本地服务器打开本页：在项目目录执行 python -m http.server 8000，然后访问 http://localhost:8000 。';
      show('screen-start');
    });
  }

  function findEvent(id) {
    for (var i = 0; i < data.events.length; i++) {
      if (data.events[i].id === id) return data.events[i];
    }
    return null;
  }

  // ------------------------------------------------------------ 创建页
  var pendingMode = 'alloc';
  var pendingAttrs = null;
  var pendingOrigin = 'normal';
  var pendingCustom = { money: 1000, stress: 0, happiness: 50 };
  var pendingTalent = null;

  function clampNumber(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function blankAttrs(value) {
    var attrs = {};
    C.ATTRS.forEach(function (key) { attrs[key] = value; });
    return attrs;
  }

  function randomTalent() {
    return TALENT_POOL[Math.floor(Math.random() * TALENT_POOL.length)];
  }

  function enterCreate() {
    pendingMode = 'alloc';
    pendingAttrs = blankAttrs(Math.floor(C.ATTR_POINT_TOTAL / C.ATTRS.length));
    pendingOrigin = 'normal';
    pendingCustom = { money: 1000, stress: 0, happiness: 50 };
    pendingTalent = randomTalent();
    renderModes();
    renderAttrEditor();
    renderOrigins();
    renderTalents();
    show('screen-create');
  }

  function renderModes() {
    var box = $('mode-list');
    box.innerHTML = '';
    [
      { key: 'alloc', name: '自由加点', desc: '自己把 300 点分到六项属性，天赋自选' },
      { key: 'random', name: '随机人生', desc: '属性和天赋随机，开局前看不到' }
    ].forEach(function (mode) {
      var card = make('div', 'origin' + (mode.key === pendingMode ? ' selected' : ''));
      card.appendChild(make('strong', '', mode.name));
      card.appendChild(make('em', '', mode.desc));
      card.addEventListener('click', function () {
        if (pendingMode === mode.key) return;
        pendingMode = mode.key;
        renderModes();
        renderAttrEditor();
        renderTalents();
      });
      box.appendChild(card);
    });
  }

  function renderAttrEditor() {
    var box = $('attr-editor');
    var tools = $('attr-tools');
    var budget = $('attr-budget');
    var hint = $('attr-hint');
    box.innerHTML = '';
    tools.innerHTML = '';
    budget.textContent = '';
    hint.textContent = '';

    if (pendingMode === 'random') {
      box.appendChild(make('p', 'random-note', '属性和天赋随机生成，开始前不显示，点「开始人生」后揭晓。'));
      return;
    }

    var stats = C.validateAttrs(pendingAttrs);
    budget.textContent = '已用 ' + stats.spent + ' / ' + C.ATTR_POINT_TOTAL + '，剩余 ' + stats.remaining;

    C.ATTRS.forEach(function (key) {
      var value = pendingAttrs[key];
      var row = make('div', 'attr-row');

      var head = make('div', 'attr-head');
      head.appendChild(make('span', 'attr-name', C.ATTR_LABELS[key]));
      head.appendChild(make('span', 'attr-value', String(value)));
      row.appendChild(head);

      var bar = make('div', 'bar');
      var fill = make('i');
      fill.style.width = Math.round(value / C.ATTR_ALLOC_MAX * 100) + '%';
      bar.appendChild(fill);
      row.appendChild(bar);

      var ctrl = make('div', 'stepper');
      var minus = make('button', 'step', '−');
      minus.type = 'button';
      minus.disabled = value <= 0;
      minus.addEventListener('click', function () { adjustAttr(key, -1); });
      var plus = make('button', 'step', '+');
      plus.type = 'button';
      plus.disabled = value >= C.ATTR_ALLOC_MAX || stats.remaining <= 0;
      plus.addEventListener('click', function () { adjustAttr(key, 1); });
      ctrl.appendChild(minus);
      ctrl.appendChild(plus);
      row.appendChild(ctrl);

      box.appendChild(row);
    });

    if (stats.remaining > 0) {
      hint.textContent = '还剩 ' + stats.remaining + ' 点未分配，也可以直接开始。';
    }

    var clear = make('button', 'btn tiny ghost', '清空');
    clear.type = 'button';
    clear.addEventListener('click', function () {
      pendingAttrs = blankAttrs(0);
      renderAttrEditor();
    });
    var even = make('button', 'btn tiny ghost', '均分');
    even.type = 'button';
    even.addEventListener('click', function () {
      pendingAttrs = blankAttrs(Math.floor(C.ATTR_POINT_TOTAL / C.ATTRS.length));
      renderAttrEditor();
    });
    var rand = make('button', 'btn tiny ghost', '随机分配');
    rand.type = 'button';
    rand.addEventListener('click', function () {
      pendingAttrs = randomAllocation();
      renderAttrEditor();
    });
    tools.appendChild(clear);
    tools.appendChild(even);
    tools.appendChild(rand);
  }

  function adjustAttr(key, delta) {
    var stats = C.validateAttrs(pendingAttrs);
    if (delta > 0 && stats.remaining <= 0) return;
    pendingAttrs[key] = clampNumber(pendingAttrs[key] + delta, 0, C.ATTR_ALLOC_MAX);
    renderAttrEditor();
  }

  // 把 300 点在 0~100 之间随机铺开，保证不超预算
  function randomAllocation() {
    var attrs = blankAttrs(0);
    var left = C.ATTR_POINT_TOTAL;
    while (left > 0) {
      var key = C.ATTRS[Math.floor(Math.random() * C.ATTRS.length)];
      if (attrs[key] >= C.ATTR_ALLOC_MAX) continue;
      attrs[key] += 1;
      left -= 1;
    }
    return attrs;
  }

  function renderOrigins() {
    var box = $('origin-list');
    box.innerHTML = '';
    ['normal', 'rich', 'poor', 'custom'].forEach(function (key) {
      var info = C.ORIGINS[key];
      var card = make('div', 'origin' + (key === pendingOrigin ? ' selected' : ''));
      card.appendChild(make('strong', '', info.name));
      card.appendChild(make('em', '', info.desc));
      card.addEventListener('click', function () {
        pendingOrigin = key;
        renderOrigins();
      });
      box.appendChild(card);
    });
    renderCustomOrigin();
  }

  function renderCustomOrigin() {
    var box = $('origin-custom');
    box.innerHTML = '';
    box.classList.toggle('hidden', pendingOrigin !== 'custom');
    if (pendingOrigin !== 'custom') return;

    [
      { key: 'money', label: '起始金钱', min: 0, max: 100000 },
      { key: 'stress', label: '起始压力', min: 0, max: 50 },
      { key: 'happiness', label: '起始幸福', min: 0, max: 100 }
    ].forEach(function (field) {
      var label = make('label', 'field inline');
      label.appendChild(make('span', '', field.label));
      var input = document.createElement('input');
      input.type = 'number';
      input.min = String(field.min);
      input.max = String(field.max);
      input.value = String(pendingCustom[field.key]);
      input.addEventListener('input', function () {
        var value = Math.round(Number(input.value));
        if (!isFinite(value)) value = field.min;
        pendingCustom[field.key] = clampNumber(value, field.min, field.max);
      });
      label.appendChild(input);
      box.appendChild(label);
    });
  }

  function renderTalents() {
    var box = $('talent-list');
    box.innerHTML = '';
    if (pendingMode === 'random') {
      box.appendChild(make('p', 'random-note', '天赋随机，开始后揭晓。'));
      return;
    }
    TALENT_POOL.forEach(function (key) {
      var info = C.TALENTS[key];
      var card = make('div', 'talent-card' + (key === pendingTalent ? ' selected' : ''));
      card.appendChild(make('strong', '', info.name));
      card.appendChild(make('em', '', info.desc));
      card.addEventListener('click', function () {
        pendingTalent = key;
        renderTalents();
      });
      box.appendChild(card);
    });
  }

  function startLife() {
    var nameInput = $('input-name');
    var name = (nameInput.value || '').trim() || '无名氏';
    var seed = ((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

    var attrs;
    var talent;
    if (pendingMode === 'random') {
      attrs = {};
      C.ATTRS.forEach(function (key) {
        attrs[key] = Math.floor(Math.random() * (C.ATTR_ALLOC_MAX + 1));
      });
      talent = randomTalent();
    } else {
      attrs = pendingAttrs;
      talent = pendingTalent;
    }

    state = C.createGame(seed, {
      origin: pendingOrigin,
      talent: talent,
      name: name,
      attrs: attrs,
      attrMode: pendingMode,
      startResources: pendingOrigin === 'custom' ? pendingCustom : null
    });
    currentEvent = null;
    S.save(state);
    enterGame();
    step();
  }

  // ------------------------------------------------------------ 游戏页
  function enterGame() {
    renderHud();
    renderStats();
    renderLog();
    show('screen-game');
  }

  function renderHud() {
    $('hud-name').textContent = state.name;
    $('hud-age').textContent = state.age + ' 岁';
    $('hud-stage').textContent = stageLabel(state.age);
  }

  function renderStats() {
    var attrBox = $('stat-attrs');
    attrBox.innerHTML = '';
    C.ATTRS.forEach(function (key) {
      var row = make('div', 'stat-row');
      row.appendChild(make('span', '', C.ATTR_LABELS[key]));
      row.appendChild(make('span', 'val', String(state.attrs[key])));
      attrBox.appendChild(row);
    });

    var resBox = $('stat-resources');
    resBox.innerHTML = '';
    C.RESOURCES.forEach(function (key) {
      var value = state.resources[key];
      var row = make('div', 'stat-row');
      row.appendChild(make('span', '', C.RESOURCE_LABELS[key]));
      row.appendChild(make('span', 'val', key === 'money' ? formatMoney(value) : String(value)));
      resBox.appendChild(row);
    });

    var tagBox = $('tag-list');
    tagBox.innerHTML = '';
    state.tags.slice(-8).forEach(function (tag) {
      tagBox.appendChild(make('span', 'tag', tag));
    });
  }

  function renderLog() {
    var list = $('log-list');
    list.innerHTML = '';
    var items = state.log.slice(-40).reverse();
    items.forEach(function (item) {
      var li = make('li', item.kind === 'life' ? 'kind-life' : '');
      li.appendChild(make('span', 'age', item.age + ' 岁'));
      li.appendChild(document.createTextNode(item.text));
      list.appendChild(li);
    });
  }

  function step() {
    if (!state || state.dead) return;
    var guard = 0;

    while (guard++ < 200) {
      var result = C.advanceYear(state, data.events);
      if (result.dead) {
        S.save(state);
        renderHud();
        renderStats();
        renderLog();
        finish();
        return;
      }
      if (result.event) {
        currentEvent = result.event;
        S.save(state);
        renderHud();
        renderStats();
        renderLog();
        renderEvent(result.event);
        return;
      }
    }
    // 理论上到不了这里；兜底避免死循环
    renderFiller('日子就这么过去了。');
  }

  function renderEvent(ev) {
    var card = $('event-card');
    card.innerHTML = '';
    card.appendChild(make('h2', 'event-title', C.formatText(ev.title, state)));

    var text = make('p', 'event-text');
    text.textContent = C.formatText(ev.text, state);
    card.appendChild(text);

    ev.options.forEach(function (option, index) {
      var btn = make('button', 'choice', option.text);
      if (option.check) {
        var rate = Math.round(C.successRate(state, option.check) * 100);
        var attrLabel = C.ATTR_LABELS[option.check.attr] || option.check.attr;
        btn.appendChild(make('span', 'meta',
          attrLabel + ' 判定 · 难度 ' + option.check.difficulty + ' · 成功率 ' + rate + '%'));
      }
      btn.addEventListener('click', function () { choose(index); });
      card.appendChild(btn);
    });
  }

  function choose(index) {
    if (!currentEvent) return;
    var result = C.resolveOption(state, currentEvent, index);
    currentEvent = null;
    S.save(state);

    renderHud();
    renderStats();
    renderLog();
    renderResult(result);
  }

  function renderResult(result) {
    var card = $('event-card');
    card.innerHTML = '';

    if (result.judged) {
      var badge = make('span', 'result-badge ' + (result.success ? 'good' : 'bad'),
        result.success ? '判定成功' : '判定失败');
      card.appendChild(badge);
      card.appendChild(make('p', 'filler', '成功率 ' + Math.round(result.rate * 100) + '%'));
    } else {
      card.appendChild(make('span', 'result-badge plain', '你做出了选择'));
    }

    if (result.changes.length > 0) {
      var box = make('div', 'changes');
      result.changes.forEach(function (change) {
        var sign = change.delta > 0 ? '+' : '';
        box.appendChild(make('span', 'chip ' + (change.delta > 0 ? 'up' : 'down'),
          sign + change.delta + ' ' + change.label));
      });
      card.appendChild(box);
    }

    if (result.log.length > 0) {
      var logs = make('div', 'result-log');
      result.log.forEach(function (line) { logs.appendChild(make('p', '', line)); });
      card.appendChild(logs);
    }

    var btn = make('button', 'btn primary', '继续');
    btn.addEventListener('click', function () { step(); });
    card.appendChild(btn);
  }

  function renderFiller(text) {
    var card = $('event-card');
    card.innerHTML = '';
    card.appendChild(make('p', 'filler', text || '这一年很平静，什么也没发生。'));
    var btn = make('button', 'btn primary', '继续');
    btn.addEventListener('click', function () { step(); });
    card.appendChild(btn);
  }

  // ------------------------------------------------------------ 结局
  function finish() {
    if (!state.endingId) state.endingId = C.evaluateEnding(state);
    var ending = data.endings[state.endingId];
    S.clear();
    renderEnding(ending || data.endings.end_ordinary);
    show('screen-ending');
  }

  function renderEnding(ending) {
    $('ending-title').textContent = ending.title;

    var text = ending.text;
    if (ending.id === 'end_ordinary' && state.resources.happiness >= 60 && ending.warmText) {
      text = ending.warmText;
    }
    $('ending-text').textContent = text;
    $('ending-epitaph').textContent = '「' + ending.epitaph + '」';

    var stats = $('ending-stats');
    stats.innerHTML = '';
    [
      ['死亡年龄', state.age + ' 岁'],
      ['金钱', formatMoney(state.resources.money)],
      ['健康', state.resources.health],
      ['幸福', state.resources.happiness]
    ].forEach(function (pair) {
      var box = make('div');
      box.appendChild(make('dt', '', pair[0]));
      box.appendChild(make('dd', '', String(pair[1])));
      stats.appendChild(box);
    });

    if (state.tags.length > 0) {
      var tagBox = make('div');
      tagBox.appendChild(make('dt', '', '标签'));
      tagBox.appendChild(make('dd', '', state.tags.slice(-4).join(' / ')));
      stats.appendChild(tagBox);
    }

    var list = $('ending-highlights');
    list.innerHTML = '';
    var picks = C.highlights(state, 3);
    if (picks.length === 0) {
      list.appendChild(make('li', '', '这一生没什么可讲的。'));
    } else {
      picks.forEach(function (item) {
        list.appendChild(make('li', '', item.age + ' 岁 · ' + item.text));
      });
    }
  }

  // ------------------------------------------------------------ 绑定
  function bind() {
    $('btn-begin').addEventListener('click', enterCreate);
    $('btn-start-life').addEventListener('click', startLife);

    $('btn-again').addEventListener('click', function () {
      S.clear();
      state = null;
      currentEvent = null;
      enterCreate();
    });

    $('btn-restart').addEventListener('click', function () {
      if (!window.confirm('要放弃这一生，重新开始吗？')) return;
      S.clear();
      state = null;
      currentEvent = null;
      enterCreate();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    bind();
    bootstrap();
  });
})();
