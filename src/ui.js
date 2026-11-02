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
  function enterCreate() {
    pendingOrigin = 'normal';
    pendingTalent = TALENT_POOL[Math.floor(Math.random() * TALENT_POOL.length)];
    renderOrigins();
    renderTalent();
    renderAttrPreview();
    show('screen-create');
  }

  function renderOrigins() {
    var box = $('origin-list');
    box.innerHTML = '';
    ['normal', 'rich', 'poor'].forEach(function (key) {
      var info = C.ORIGINS[key];
      var card = make('div', 'origin' + (key === pendingOrigin ? ' selected' : ''));
      card.appendChild(make('strong', '', info.name));
      card.appendChild(make('em', '', info.desc));
      card.addEventListener('click', function () {
        pendingOrigin = key;
        renderOrigins();
        renderAttrPreview();
      });
      box.appendChild(card);
    });
  }

  function renderTalent() {
    var info = C.TALENTS[pendingTalent];
    var box = $('talent-box');
    box.innerHTML = '';
    box.appendChild(make('strong', '', info.name));
    box.appendChild(document.createTextNode(' —— ' + info.desc));
  }

  function renderAttrPreview() {
    var box = $('create-attrs');
    box.innerHTML = '';
    var preview = { intelligence: 50, charm: 50, constitution: 50, eq: 50, will: 50, luck: 50 };
    if (pendingOrigin === 'poor') preview.will += 8;
    C.ATTRS.forEach(function (key) {
      var cell = make('div');
      cell.appendChild(make('b', '', String(preview[key])));
      cell.appendChild(document.createTextNode(C.ATTR_LABELS[key]));
      box.appendChild(cell);
    });
  }

  function startLife() {
    var nameInput = $('input-name');
    var name = (nameInput.value || '').trim() || '无名氏';
    var seed = ((Date.now() & 0xffffffff) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;

    state = C.createGame(seed, { origin: pendingOrigin, talent: pendingTalent, name: name });
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
