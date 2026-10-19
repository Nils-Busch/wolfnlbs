(() => {
  'use strict';
  const LEVELS = {
    s9: { w: 9, h: 9, m: 10, id: 'mines9', label: 'Klein 9×9' },
    s16: { w: 16, h: 16, m: 40, id: 'mines16', label: 'Groß 16×16' },
  };
  const $ = (id) => document.getElementById(id);
  const boardEl = $('board');
  const store = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };

  let lvlKey = LEVELS[store.get('gg-mines-level')] ? store.get('gg-mines-level') : 's9';
  let L, cells, first, over, flags, opened, startTime, clock, hs, buttons;
  let flagMode = false;

  function neighbors(i) {
    const r = Math.floor(i / L.w), c = i % L.w, out = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && rr < L.h && cc >= 0 && cc < L.w) out.push(rr * L.w + cc);
      }
    return out;
  }

  function placeMines(safe) {
    // Erster Klick ist immer sicher und öffnet eine Fläche
    const banned = new Set([safe, ...neighbors(safe)]);
    const pool = cells.map((_, i) => i).filter((i) => !banned.has(i));
    for (let k = 0; k < L.m; k++) {
      const j = k + Math.floor(Math.random() * (pool.length - k));
      [pool[k], pool[j]] = [pool[j], pool[k]];
      cells[pool[k]].mine = true;
    }
    cells.forEach((c, i) => (c.n = neighbors(i).filter((j) => cells[j].mine).length));
  }

  function start() {
    L = LEVELS[lvlKey];
    store.set('gg-mines-level', lvlKey);
    cells = Array.from({ length: L.w * L.h }, () => ({ mine: false, open: false, flag: false, n: 0 }));
    first = true; over = false; flags = 0; opened = 0; startTime = null;
    clearInterval(clock);
    $('time').textContent = '0';
    $('overlay').hidden = true;
    document.querySelectorAll('.levels button').forEach((b) => b.classList.toggle('on', b.dataset.lvl === lvlKey));
    hs = Scores.panel($('scores'), L.id, { unit: 's', title: `🏆 ${L.label} – schnellste Zeit` });
    build();
    render();
  }

  function build() {
    boardEl.className = 'ms ' + lvlKey;
    boardEl.style.gridTemplateColumns = `repeat(${L.w}, 1fr)`;
    boardEl.innerHTML = '';
    buttons = cells.map((_, i) => {
      const b = document.createElement('button');
      b.className = 'c';
      b.addEventListener('click', () => {
        if (b.dataset.longpress) { delete b.dataset.longpress; return; }
        act(i, flagMode ? 'flag' : 'open');
      });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); act(i, 'flag'); });
      // Lange drücken (Touch) = Fahne
      let t = null;
      b.addEventListener('touchstart', () => {
        t = setTimeout(() => { b.dataset.longpress = '1'; act(i, 'flag'); if (navigator.vibrate) navigator.vibrate(30); }, 420);
      }, { passive: true });
      ['touchend', 'touchmove', 'touchcancel'].forEach((ev) => b.addEventListener(ev, () => clearTimeout(t), { passive: true }));
      boardEl.appendChild(b);
      return b;
    });
  }

  function reveal(i) {
    const stack = [i];
    while (stack.length) {
      const k = stack.pop();
      const c = cells[k];
      if (c.open || c.flag) continue;
      c.open = true;
      opened++;
      if (c.n === 0) neighbors(k).forEach((j) => !cells[j].open && stack.push(j));
    }
  }

  function act(i, kind) {
    if (over) return;
    const c = cells[i];
    if (kind === 'flag') {
      if (c.open) return;
      c.flag = !c.flag;
      flags += c.flag ? 1 : -1;
      return render();
    }
    if (c.flag) return;
    if (first) {
      first = false;
      placeMines(i);
      startTime = Date.now();
      clock = setInterval(() => ($('time').textContent = Math.floor((Date.now() - startTime) / 1000)), 250);
    }
    if (c.open) {
      // Akkord: Zahl anklicken, wenn genug Fahnen drumherum stehen
      const nb = neighbors(i);
      if (c.n && nb.filter((j) => cells[j].flag).length === c.n) {
        for (const j of nb) {
          if (!cells[j].flag && !cells[j].open) {
            if (cells[j].mine) return lose(j);
            reveal(j);
          }
        }
      }
    } else if (c.mine) {
      return lose(i);
    } else {
      reveal(i);
    }
    render();
    if (opened === L.w * L.h - L.m) win();
  }

  function render() {
    cells.forEach((c, i) => {
      const b = buttons[i];
      let cls = 'c', txt = '';
      if (c.open) {
        cls += ' open';
        if (c.mine) { txt = '💣'; if (c.boom) cls += ' boom'; }
        else if (c.n) { txt = c.n; cls += ' n' + c.n; }
      } else if (c.flag) txt = over && !c.mine ? '❌' : '🚩';
      b.className = cls;
      b.textContent = txt;
      b.setAttribute('aria-label', c.open ? (c.mine ? 'Mine' : `${c.n} Minen in der Nähe`) : c.flag ? 'Fahne' : 'verdeckt');
    });
    $('mines').textContent = L.m - flags;
  }

  function lose(i) {
    over = true;
    clearInterval(clock);
    cells[i].boom = true;
    cells.forEach((c) => { if (c.mine && !c.flag) c.open = true; });
    render();
    showOverlay('💥 Boom! Leider verloren.');
  }

  function win() {
    over = true;
    clearInterval(clock);
    const secs = Math.max(1, Math.round((Date.now() - startTime) / 1000));
    $('time').textContent = secs;
    cells.forEach((c) => { if (c.mine) c.flag = true; });
    flags = L.m;
    render();
    showOverlay(`🎉 Geschafft in ${secs} Sekunden!`);
    hs.offer(secs);
  }

  function showOverlay(text) {
    $('ovText').textContent = text;
    setTimeout(() => ($('overlay').hidden = false), 400);
  }

  document.querySelectorAll('.levels button').forEach((b) => (b.onclick = () => { lvlKey = b.dataset.lvl; start(); }));
  $('flagMode').onclick = () => {
    flagMode = !flagMode;
    $('flagMode').classList.toggle('on', flagMode);
    $('flagMode').textContent = flagMode ? '🚩 Fahnen-Modus an' : '🚩 Fahnen-Modus';
  };
  $('ovBtn').onclick = start;
  $('newGame').onclick = start;
  start();
})();
