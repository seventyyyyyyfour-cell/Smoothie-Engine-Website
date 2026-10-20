(() => {
  const demo = document.getElementById('node-demo');
  if (!demo) return;

  const svg = demo.querySelector('.node-wires');
  const SVGNS = 'http://www.w3.org/2000/svg';

  const TYPES = {
    key:   { title: 'Key',     color: '#8C5AB4FF', lines: ['Key: Right', 'Held'],            in: false, out: true  },
    start: { title: 'Start',   color: '#2E965AFF', lines: ['Runs once on play', ''],  in: false,  out: true  },
    move:  { title: 'Move',    color: '#2C5D87FF', lines: ['Self', '200, 0/s'],       in: true,  out: true  },
    update: { title: 'Update',   color: '#2896A0FF', lines: ['Runs every frame', ''], in: false, out: true }
  };

  const nodes = [];
  const conns = [];
  const counters = {};
  let selected = null;   
  let drag = null;       
  let link = null;      
  let spawnCount = 0;

  const logList = document.getElementById('node-log-list');

  function log(message, kind) {
    if (!logList) return;
    const li = document.createElement('li');
    if (kind) li.className = 'log-' + kind;
    const time = document.createElement('span');
    time.className = 'log-time';
    time.textContent = new Date().toLocaleTimeString([], { hour12: false });
    const text = document.createElement('span');
    text.textContent = message;
    li.append(time, text);
    logList.prepend(li);                      
    while (logList.children.length > 60) logList.lastChild.remove();
  }

  const clearBtn = document.getElementById('node-log-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => { logList.textContent = ''; });

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  function portPos(node, which) {
    const port = node.el.querySelector(which === 'out' ? '.port-out' : '.port-in');
    if (!port) return null;
    const p = port.getBoundingClientRect();
    const d = demo.getBoundingClientRect();
    return { x: p.left + p.width / 2 - d.left, y: p.top + p.height / 2 - d.top };
  }

  function bezier(a, b) {
    const dx = Math.max(40, Math.abs(b.x - a.x) / 2);
    return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`;
  }

  function makePath(cls) {
    const p = document.createElementNS(SVGNS, 'path');
    p.setAttribute('class', cls);
    svg.appendChild(p);
    return p;
  }

  function addNode(type, x, y) {
    const t = TYPES[type];
    counters[type] = (counters[type] || 0) + 1;

    const el = document.createElement('div');
    el.className = 'node';
    el.innerHTML =
      `<div class="node-header" style="background:${t.color}">${t.title} ${counters[type]}</div>` +
      `<div class="node-body"><div>${t.lines[0]}</div><div class="node-muted">${t.lines[1]}</div></div>` +
      (t.in ? '<span class="port port-in"></span>' : '') +
      (t.out ? '<span class="port port-out"></span>' : '');
    demo.appendChild(el);

    const node = { type, x, y, el, name: `${t.title} ${counters[type]}` };
    nodes.push(node);
    place(node);
    log(`Added ${node.name}`, 'add');
    return node;
  }

  function place(node) {
    const maxX = demo.clientWidth - node.el.offsetWidth;
    const maxY = demo.clientHeight - node.el.offsetHeight;
    node.x = clamp(node.x, 0, Math.max(0, maxX));
    node.y = clamp(node.y, 0, Math.max(0, maxY));
    node.el.style.left = node.x + 'px';
    node.el.style.top = node.y + 'px';
    redraw();
  }

  function removeNode(node) {
    for (let i = conns.length - 1; i >= 0; i--) {
      if (conns[i].from === node || conns[i].to === node) removeConn(conns[i]);
    }
    node.el.remove();
    nodes.splice(nodes.indexOf(node), 1);
    log(`Deleted ${node.name}`, 'remove');
  }

  function addConn(from, to) {
    if (from === to) return;
    if (!from.el.querySelector('.port-out') || !to.el.querySelector('.port-in')) return;
    if (conns.some(c => c.from === from && c.to === to)) return;
    conns.push({
      from, to,
      path: makePath('wire'),
      hit: makePath('wire-hit')
    });
    redraw();
    log(`Connected ${from.name} → ${to.name}`, 'connect');
  }

  function removeConn(conn) {
    conn.path.remove();
    conn.hit.remove();
    conns.splice(conns.indexOf(conn), 1);
    log(`Disconnected ${conn.from.name} → ${conn.to.name}`, 'remove');
  }

  function redraw() {
    for (const c of conns) {
      const a = portPos(c.from, 'out');
      const b = portPos(c.to, 'in');
      if (!a || !b) continue;
      const d = bezier(a, b);
      c.path.setAttribute('d', d);
      c.hit.setAttribute('d', d);
    }
  }

  function select(sel) {
    selected = sel;
    nodes.forEach(n => n.el.classList.toggle('is-selected', !!sel && sel.kind === 'node' && sel.node === n));
    conns.forEach(c => c.path.classList.toggle('is-selected', !!sel && sel.kind === 'wire' && sel.conn === c));
  }

  function deleteSelected() {
    if (!selected) return;
    if (selected.kind === 'node') removeNode(selected.node);
    else removeConn(selected.conn);
    select(null);
  }

  const nodeFrom = target => {
    const el = target.closest && target.closest('.node');
    return el ? nodes.find(n => n.el === el) : null;
  };

  const localPoint = e => {
    const d = demo.getBoundingClientRect();
    return { x: e.clientX - d.left, y: e.clientY - d.top };
  };

  demo.addEventListener('contextmenu', e => e.preventDefault());

  demo.addEventListener('pointerdown', e => {
    demo.focus({ preventScroll: true });

    const hit = e.target.closest('.wire-hit');
    if (hit) {
      const conn = conns.find(c => c.hit === hit);
      select(conn ? { kind: 'wire', conn } : null);
      return;
    }

    const node = nodeFrom(e.target);
    if (!node) { select(null); return; }

    select({ kind: 'node', node });
    node.el.parentNode.appendChild(node.el);

    const startLink = e.button === 2 || e.target.classList.contains('port-out');
    demo.setPointerCapture(e.pointerId);

    if (startLink) {
      if (!node.el.querySelector('.port-out')) return;
      link = { from: node, tempPath: makePath('wire wire-temp') };
      demo.classList.add('is-linking');
      moveLink(e);
    } else if (e.button === 0) {
      const p = localPoint(e);
      drag = { node, dx: p.x - node.x, dy: p.y - node.y };
      node.el.classList.add('is-dragging');
    }
  });

  function moveLink(e) {
    const a = portPos(link.from, 'out');
    link.tempPath.setAttribute('d', bezier(a, localPoint(e)));
  }

  demo.addEventListener('pointermove', e => {
    if (drag) {
      const p = localPoint(e);
      drag.node.x = p.x - drag.dx;
      drag.node.y = p.y - drag.dy;
      drag.moved = true;
      place(drag.node);
    } else if (link) {
      moveLink(e);
    }
  });

  function endPointer(e) {
    if (drag) {
      drag.node.el.classList.remove('is-dragging');
      if (drag.moved) {
        log(`Moved ${drag.node.name} to (${Math.round(drag.node.x)}, ${Math.round(drag.node.y)})`, 'move');
      }
      drag = null;
    }
    if (link) {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const target = under && nodeFrom(under);
      if (target) addConn(link.from, target);
      link.tempPath.remove();
      link = null;
      demo.classList.remove('is-linking');
    }
  }
  demo.addEventListener('pointerup', endPointer);
  demo.addEventListener('pointercancel', endPointer);

  demo.addEventListener('keydown', e => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    }
  });

  window.addEventListener('resize', () => nodes.forEach(place));

  document.querySelectorAll('[data-add-node]').forEach(btn => {
    btn.addEventListener('click', () => {
      const offset = (spawnCount++ % 6) * 24;
      const node = addNode(btn.dataset.addNode, 24 + offset, 24 + offset);
      select({ kind: 'node', node });
    });
  });

  const k = addNode('key', 24, 40);
  const m = addNode('move', Math.max(200, Math.min(360, demo.clientWidth - 220)), 170);
  addConn(k, m);
})();