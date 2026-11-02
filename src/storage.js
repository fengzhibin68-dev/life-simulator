/**
 * life-simulator · 存档
 * localStorage 自动存档：每次玩家做出选择后写入。
 */
(function (root) {
  'use strict';

  const KEY = 'life-sim.save.v1';

  function save(state) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      return false;
    }
  }

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      if (!raw) return null;
      const state = JSON.parse(raw);
      if (!state || state.version !== 1) return null;
      return state;
    } catch (err) {
      return null;
    }
  }

  function clear() {
    try {
      root.localStorage.removeItem(KEY);
    } catch (err) {
      /* 忽略：隐私模式下不可用 */
    }
  }

  root.GameStorage = { KEY: KEY, save: save, load: load, clear: clear };
  if (typeof module === 'object' && module.exports) module.exports = root.GameStorage;
})(typeof globalThis !== 'undefined' ? globalThis : this);
