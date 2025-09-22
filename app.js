// Estado y almacenamiento
const STORAGE_KEY = 'discoteca_app_v1';
const DEFAULT_VOTERS = [
  { id: 'jo', nombre: 'Jo' },
  { id: 'jorge', nombre: 'Jorge' },
  { id: 'willi', nombre: 'Willi' },
  { id: 'pablo', nombre: 'Pablo' },
  { id: 'chino', nombre: 'Chino' },
  { id: 'tuqui', nombre: 'Tuqui' },
  { id: 'tucan', nombre: 'Tucan' },
  { id: 'ramiro', nombre: 'Ramiro' },
  { id: 'poison', nombre: 'Poison' },
];

const FUN_PASSWORDS = {
  jo: 'jo-yoyo-yogur',
  jorge: 'jor-ghee-butter',
  willi: 'willi-wok-wasabi',
  pablo: 'pablo-pasta-pesto',
  chino: 'chino-chili-chow',
  tuqui: 'tuqui-taco-tuna',
  tucan: 'tucan-taco-tilapia',
  ramiro: 'ramiro-ramen-romero',
  poison: 'poison-pastry-picante',
};

const DEFAULT_SETTINGS = {
  tamGrupo: 9,
  votosRequeridos: 9,
};

let state = loadState();
let session = { userId: null };

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) {}
  }
  const initial = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    voters: DEFAULT_VOTERS.map(v => ({ id: v.id, nombre: v.nombre, activo: true, password: FUN_PASSWORDS[v.id] || funPassword(v.nombre) })),
    chefs: DEFAULT_VOTERS.map(v => ({ id: v.id, nombre: v.nombre, alias: '' })),
    platos: [], // {id, nombre, descripcion, chefId, fecha, fotoUrl, vuelta}
    votos: [], // {id, vuelta, userId, picks:[platoId1, platoId2, platoId3]}
  };
  saveState(initial);
  return initial;
}

function saveState(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function funPassword(nombre) {
  const foods = ['asado','taco','ramen','sushi','pesto','albondiga','chimichurri','parmesano','aji-molido','dulce'];
  const tools = ['cuchara','tenedor','wok','sartén','cuchillo','hornito','parrilla'];
  const a = nombre.toLowerCase().replace(/[^a-záéíóúñ]/g,'').slice(0,3);
  const b = foods[Math.floor(Math.random()*foods.length)];
  const c = tools[Math.floor(Math.random()*tools.length)];
  return `${a}-${b}-${c}`;
}

// Router básico
const views = {
  platos: document.getElementById('view-platos'),
  votar: document.getElementById('view-votar'),
  ranking: document.getElementById('view-ranking'),
  chefs: document.getElementById('view-chefs'),
  ajustes: document.getElementById('view-ajustes'),
  backup: document.getElementById('view-backup'),
};

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.route;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    Object.values(views).forEach(v => v.classList.remove('visible'));
    views[target].classList.add('visible');
    if (target === 'ranking') renderRanking();
    if (target === 'votar') refreshVoteForm();
  });
});

// Canvas hero
const heroCanvas = document.getElementById('heroCanvas');
const ctx = heroCanvas.getContext('2d');
function drawHero() {
  const w = heroCanvas.width = heroCanvas.clientWidth;
  const h = heroCanvas.height = heroCanvas.clientHeight;
  const grad = ctx.createLinearGradient(0,0,w,h);
  grad.addColorStop(0, 'rgba(230,57,70,0.25)');
  grad.addColorStop(1, 'rgba(255,209,102,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,w,h);
  for (let i=0;i<24;i++){
    const x = (i/24)*w;
    ctx.strokeStyle = `rgba(255,255,255,${0.05+0.02*Math.sin(i)})`;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 80*Math.sin(i*0.6), h);
    ctx.stroke();
  }
  ctx.font = '700 42px Playfair Display';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillText('Discoteca — Ranking 3•2•1', 18, h/2+12);
}
window.addEventListener('resize', drawHero);
drawHero();

// Utilidades
const byId = (id) => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2,10);

// Inicializar selects y tablas
function initSelectors() {
  // Chefs para formularios en Ajustes
  const chefSelectAj = byId('aj-plato-chef');
  if (chefSelectAj) chefSelectAj.innerHTML = state.chefs.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');

  // Filtros en Ajustes
  const filtroChefAj = byId('aj-filtro-chef');
  if (filtroChefAj) filtroChefAj.innerHTML = ['<option value="">Todos</option>']
    .concat(state.chefs.map(c=>`<option value="${c.id}">${c.nombre}</option>`)).join('');

  // Vueltas para varios selects
  const maxVuelta = Math.max(1, ...state.platos.map(p => p.vuelta||1));
  const vueltas = Array.from({length:maxVuelta}, (_,i)=>i+1);
  const filtroVuelta = byId('filtro-vuelta');
  const votoVuelta = byId('voto-vuelta');
  const rankingVuelta = byId('ranking-vuelta');
  const ajFiltroVuelta = byId('aj-filtro-vuelta');
  [filtroVuelta, votoVuelta, rankingVuelta, ajFiltroVuelta].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = vueltas.map(v => `<option value="${v}">Vuelta ${v}</option>`).join('');
  });
}

function renderPlatos() {
  initSelectors();
  const tb = byId('tabla-platos').querySelector('tbody');
  const v = Number(byId('filtro-vuelta').value || 1);
  const rows = state.platos
    .filter(p => p.vuelta === v || !byId('filtro-vuelta').value)
    .sort((a,b)=> new Date(a.fecha) - new Date(b.fecha))
    .map(p => {
      const chef = state.chefs.find(c => c.id===p.chefId);
      return `<tr>
        <td>${p.fotoUrl?`<img class="thumb" src="${p.fotoUrl}" alt="${p.nombre}">`:''}</td>
        <td>${p.nombre}<div class="muted">${p.descripcion||''}</div></td>
        <td>${chef?chef.nombre:''}</td>
        <td>${p.fecha||''}</td>
        <td><span class="badge">${p.vuelta}</span></td>
      </tr>`;
    }).join('');
  tb.innerHTML = rows || '<tr><td colspan="5" class="muted">Sin platos aún</td></tr>';
}

// Filtro en vista pública de platos
if (byId('filtro-vuelta')) byId('filtro-vuelta').addEventListener('change', renderPlatos);

// Autenticación
function renderAuthUsers() {
  const sel = byId('auth-user');
  sel.innerHTML = state.voters.filter(v=>v.activo).map(v => `<option value="${v.id}">${v.nombre}</option>`).join('');
}
renderAuthUsers();

byId('btn-login').addEventListener('click', () => {
  const id = byId('auth-user').value;
  const pass = byId('auth-pass').value;
  const user = state.voters.find(v => v.id===id && v.activo);
  if (!user) return;
  if ((user.password||'').trim() !== (pass||'').trim()) {
    byId('auth-status').textContent = 'Contraseña incorrecta';
    return;
  }
  session.userId = user.id;
  byId('auth-status').textContent = `Hola, ${user.nombre}!`;
  byId('auth-box').style.display = 'none';
  byId('form-voto').style.display = '';
  refreshVoteForm();
});

byId('btn-logout').addEventListener('click', () => {
  session.userId = null;
  byId('auth-pass').value = '';
  byId('auth-status').textContent = '';
  byId('auth-box').style.display = '';
  byId('form-voto').style.display = 'none';
});

// Votación 3-2-1
let tempVote = { vuelta: null, picks: [] }; // picks = [platoId3pts, platoId2pts, platoId1pt]
function refreshVoteForm() {
  initSelectors();
  const vueltaSel = byId('voto-vuelta');
  const vuelta = Number(vueltaSel.value || 1);
  if (tempVote.vuelta !== vuelta) tempVote = { vuelta, picks: [] };
  const platos = state.platos.filter(p => p.vuelta === vuelta);

  const info = byId('voto-aviso');
  const submitBtn = byId('voto-submit');
  if (!session.userId) {
    info.textContent = 'Ingresá para votar. No se puede repetir plato y solo un voto por vuelta.';
    submitBtn.disabled = true;
  } else {
    const ya = state.votos.find(v => v.vuelta===vuelta && v.userId===session.userId);
    if (ya) {
      info.textContent = 'Ya registraste tu voto para esta vuelta.';
      submitBtn.disabled = true;
    } else {
      info.textContent = 'Elegí 3 platos: 3pts, 2pts y 1pt';
      submitBtn.disabled = false;
    }
  }

  const grid = byId('voto-catalogo');
  grid.innerHTML = platos.map(p => {
    const chef = state.chefs.find(c=>c.id===p.chefId);
    const rank = tempVote.picks.indexOf(p.id);
    const cls = rank===0?'selected-3':rank===1?'selected-2':rank===2?'selected-1':'';
    const badge = rank>=0?`<div class="badge-slot">${rank===0?'3 pts':rank===1?'2 pts':'1 pt'}</div>`:'';
    return `<div class="catalog-card ${cls}" data-plato="${p.id}">
      ${p.fotoUrl?`<img src="${p.fotoUrl}" alt="${p.nombre}">`:`<img src="" alt="" style="background:linear-gradient(120deg, rgba(230,57,70,.2), rgba(255,209,102,.15));">`}
      ${badge}
      <div class="content">
        <div><strong>${p.nombre}</strong></div>
        <div class="chef">${chef?chef.nombre:''} · Vuelta ${p.vuelta}</div>
      </div>
    </div>`;
  }).join('') || '<div class="muted">No hay platos en esta vuelta</div>';

  grid.querySelectorAll('.catalog-card').forEach(card => {
    card.addEventListener('click', () => {
      if (!session.userId) return;
      const pid = card.dataset.plato;
      const idx = tempVote.picks.indexOf(pid);
      if (idx>=0) {
        tempVote.picks.splice(idx,1);
      } else {
        if (tempVote.picks.length<3) tempVote.picks.push(pid);
        else { tempVote.picks[2]=pid; }
      }
      refreshVoteForm();
    });
  });
}
if (byId('voto-vuelta')) byId('voto-vuelta').addEventListener('change', refreshVoteForm);
if (byId('voto-limpiar')) byId('voto-limpiar').addEventListener('click', ()=>{ tempVote.picks=[]; refreshVoteForm(); });

if (byId('form-voto')) byId('form-voto').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!session.userId) return;
  const vuelta = Number(byId('voto-vuelta').value||1);
  const picks = tempVote.picks.slice(0,3);
  if (picks.length!==3) { byId('voto-aviso').textContent = 'Elegí 3 platos.'; return; }
  const set = new Set(picks);
  if (set.size !== picks.length) { byId('voto-aviso').textContent = 'No podés repetir platos.'; return; }
  const ya = state.votos.find(v => v.vuelta===vuelta && v.userId===session.userId);
  if (ya) { byId('voto-aviso').textContent = 'Ya votaste esta vuelta.'; return; }
  state.votos.push({ id: uid(), vuelta, userId: session.userId, picks });
  saveState(state);
  byId('voto-aviso').textContent = 'Voto registrado!';
  renderRanking();
  refreshVoteForm();
});

// Ranking
function computeRanking({ general=false, vuelta=1 }) {
  const puntos = new Map();
  const counts = new Map(); // {platoId: {p3,p2,p1}}
  const votos = general ? state.votos : state.votos.filter(v=>v.vuelta===vuelta);
  for (const v of votos) {
    const [p3,p2,p1] = v.picks; // top1=3pts, top2=2pts, top3=1pt
    if (!p3 || !p2 || !p1) continue;
    const pts = [ [p3,3], [p2,2], [p1,1] ];
    for (const [pid, score] of pts) {
      puntos.set(pid, (puntos.get(pid)||0)+score);
      const c = counts.get(pid)||{p3:0,p2:0,p1:0};
      if (score===3) c.p3++; else if (score===2) c.p2++; else c.p1++;
      counts.set(pid, c);
    }
  }
  const list = Array.from(puntos.entries()).map(([platoId, score])=>{
    const p = state.platos.find(x=>x.id===platoId);
    const chef = p ? state.chefs.find(c=>c.id===p.chefId) : null;
    const c = counts.get(platoId)||{p3:0,p2:0,p1:0};
    return { platoId, nombre: p?p.nombre:'(plato eliminado)', chef: chef?chef.nombre:'', score, ...c };
  }).sort((a,b)=> b.score - a.score || b.p3 - a.p3 || b.p2 - a.p2 || a.nombre.localeCompare(b.nombre));

  return { list, totalVotos: votos.length };
}

function renderRanking() {
  initSelectors();
  const general = byId('toggle-general').checked;
  const vuelta = Number(byId('ranking-vuelta').value||1);
  const { list, totalVotos } = computeRanking({ general, vuelta });

  const required = state.settings.votosRequeridos || DEFAULT_SETTINGS.votosRequeridos;
  const reveal = totalVotos >= required;
  const overlay = byId('ranking-blur');
  overlay.style.display = reveal ? 'none' : 'flex';
  byId('ranking-info').textContent = reveal ? `Votos: ${totalVotos}` : `Votos: ${totalVotos}/${required} — oculto hasta completar`;

  const tb = byId('tabla-ranking').querySelector('tbody');
  tb.innerHTML = list.map((row, i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${row.nombre}</td>
      <td>${row.chef}</td>
      <td><strong>${row.score}</strong></td>
      <td>${row.p3}</td>
      <td>${row.p2}</td>
      <td>${row.p1}</td>
    </tr>
  `).join('') || '<tr><td colspan="7" class="muted">Sin votos aún</td></tr>';
}
byId('ranking-vuelta').addEventListener('change', renderRanking);
byId('toggle-general').addEventListener('change', renderRanking);

// Chefs
function renderChefs() {
  const tb = byId('tabla-chefs').querySelector('tbody');
  const data = state.chefs.map(c => {
    const platos = state.platos.filter(p=>p.chefId===c.id);
    const total = computeRanking({ general: true }).list
      .filter(r => platos.some(p=>p.nombre===r.nombre))
      .reduce((acc,r)=>acc+r.score,0);
    return { ...c, platosCount: platos.length, total };
  }).sort((a,b)=> b.total - a.total || a.nombre.localeCompare(b.nombre));
  tb.innerHTML = data.map(c=>`
    <tr>
      <td>${c.nombre}${c.alias?` <span class="muted">(${c.alias})</span>`:''}</td>
      <td>${c.platosCount}</td>
      <td>${c.total}</td>
    </tr>
  `).join('') || '<tr><td colspan="3" class="muted">Agregá chefs</td></tr>';
}

// Ajustes: grupo y votantes
function renderSettings() {
  // Ajustes básicos
  if (byId('aj-grupo')) byId('aj-grupo').value = state.settings.tamGrupo;
  if (byId('aj-requeridos')) byId('aj-requeridos').value = state.settings.votosRequeridos;

  // Votantes
  const tb = byId('tabla-votantes')?.querySelector('tbody');
  if (tb) {
    tb.innerHTML = state.voters.map(v=>`
      <tr>
        <td><input data-name="${v.id}" value="${v.nombre}"></td>
        <td><input type="checkbox" data-activo="${v.id}" ${v.activo?'checked':''}></td>
        <td><input data-pass="${v.id}" value="${v.password||''}"></td>
        <td class="right">
          <button class="ghost" data-del-vot="${v.id}" style="color:#ef476f">Borrar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="muted">Sin votantes</td></tr>';

    tb.querySelectorAll('input[data-name]').forEach(inp => inp.addEventListener('change', ()=>{
      const v = state.voters.find(x=>x.id===inp.dataset.name);
      if (!v) return; v.nombre = inp.value; saveState(state); renderAuthUsers(); renderChefs();
    }));
    tb.querySelectorAll('input[data-activo]').forEach(inp => inp.addEventListener('change', ()=>{
      const v = state.voters.find(x=>x.id===inp.dataset.activo);
      if (!v) return; v.activo = inp.checked; saveState(state); renderAuthUsers();
    }));
    tb.querySelectorAll('input[data-pass]').forEach(inp => inp.addEventListener('change', ()=>{
      const v = state.voters.find(x=>x.id===inp.dataset.pass);
      if (!v) return; v.password = inp.value; saveState(state);
    }));
    tb.querySelectorAll('button[data-del-vot]').forEach(btn => btn.addEventListener('click', ()=>{
      const id = btn.dataset.delVot;
      if (state.votos.some(v=>v.userId===id)) { alert('No se puede borrar: tiene votos registrados'); return; }
      state.voters = state.voters.filter(v=>v.id!==id);
      saveState(state); renderSettings(); renderAuthUsers();
    }));
  }

  // Editor de Platos en Ajustes
  const chefSelectAj = byId('aj-plato-chef');
  if (chefSelectAj) chefSelectAj.innerHTML = state.chefs.map(c => `<option value="${c.id}">${c.nombre}</option>`).join('');
  const ajFiltroChef = byId('aj-filtro-chef');
  const ajFiltroVuelta = byId('aj-filtro-vuelta');
  const vChe = ajFiltroChef?.value || '';
  const vVua = Number(ajFiltroVuelta?.value||0);
  const tbPl = byId('aj-tabla-platos')?.querySelector('tbody');
  if (tbPl) {
    const list = state.platos.filter(p => (!vChe || p.chefId===vChe) && (!vVua || p.vuelta===vVua))
      .sort((a,b)=> new Date(a.fecha)-new Date(b.fecha));
    tbPl.innerHTML = list.map(p=>{
      const chef = state.chefs.find(c=>c.id===p.chefId);
      return `<tr>
        <td>${p.fotoUrl?`<img class="thumb" src="${p.fotoUrl}">`:''}</td>
        <td>${p.nombre}</td>
        <td>${chef?chef.nombre:''}</td>
        <td>${p.fecha||''}</td>
        <td><span class="badge">${p.vuelta}</span></td>
        <td class="right">
          <button class="ghost" data-aj-edit="${p.id}">Editar</button>
          <button class="ghost" data-aj-del="${p.id}" style="color:#ef476f">Borrar</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="muted">Sin platos</td></tr>';

    tbPl.querySelectorAll('button[data-aj-edit]').forEach(btn=>btn.addEventListener('click', ()=>{
      const p = state.platos.find(x=>x.id===btn.dataset.ajEdit);
      if (!p) return;
      byId('aj-plato-id').value = p.id;
      byId('aj-plato-nombre').value = p.nombre;
      byId('aj-plato-chef').value = p.chefId;
      byId('aj-plato-fecha').value = p.fecha;
      byId('aj-plato-vuelta').value = p.vuelta;
      byId('aj-plato-descripcion').value = p.descripcion||'';
      byId('aj-plato-foto').value = p.fotoUrl||'';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tbPl.querySelectorAll('button[data-aj-del]').forEach(btn=>btn.addEventListener('click', ()=>{
      const id = btn.dataset.ajDel;
      state.platos = state.platos.filter(p=>p.id!==id);
      state.votos = state.votos.filter(v=>!v.picks.includes(id));
      saveState(state); renderPlatos(); renderSettings(); refreshVoteForm(); renderRanking();
    }));
  }

  if (ajFiltroChef) ajFiltroChef.onchange = renderSettings;
  if (ajFiltroVuelta) ajFiltroVuelta.onchange = renderSettings;

  // Editor de Chefs en Ajustes
  const tbChe = byId('aj-tabla-chefs')?.querySelector('tbody');
  if (tbChe) {
    const data = state.chefs.map(c => {
      const platos = state.platos.filter(p=>p.chefId===c.id);
      const total = computeRanking({ general: true }).list
        .filter(r => platos.some(p=>p.nombre===r.nombre))
        .reduce((acc,r)=>acc+r.score,0);
      return { ...c, platosCount: platos.length, total };
    }).sort((a,b)=> b.total - a.total || a.nombre.localeCompare(b.nombre));
    tbChe.innerHTML = data.map(c=>`
      <tr>
        <td>${c.nombre}${c.alias?` <span class=\"muted\">(${c.alias})</span>`:''}</td>
        <td>${c.platosCount}</td>
        <td>${c.total}</td>
        <td class="right">
          <button class="ghost" data-aj-edit-chef="${c.id}">Editar</button>
          <button class="ghost" data-aj-del-chef="${c.id}" style="color:#ef476f">Borrar</button>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="muted">Agregá chefs</td></tr>';

    tbChe.querySelectorAll('button[data-aj-edit-chef]').forEach(btn=>btn.addEventListener('click', ()=>{
      const c = state.chefs.find(x=>x.id===btn.dataset.ajEditChef);
      if (!c) return;
      byId('aj-chef-id').value = c.id;
      byId('aj-chef-nombre').value = c.nombre;
      byId('aj-chef-alias').value = c.alias||'';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }));
    tbChe.querySelectorAll('button[data-aj-del-chef]').forEach(btn=>btn.addEventListener('click', ()=>{
      const id = btn.dataset.ajDelChef;
      if (state.platos.some(p=>p.chefId===id)) { alert('No se puede borrar: tiene platos asociados'); return; }
      state.chefs = state.chefs.filter(c=>c.id!==id);
      saveState(state); renderChefs(); renderSettings(); initSelectors();
    }));
  }
}

if (byId('aj-guardar')) byId('aj-guardar').addEventListener('click', ()=>{
  state.settings.tamGrupo = Math.max(1, Number(byId('aj-grupo').value||DEFAULT_SETTINGS.tamGrupo));
  state.settings.votosRequeridos = Math.max(1, Number(byId('aj-requeridos').value||DEFAULT_SETTINGS.votosRequeridos));
  saveState(state); renderRanking();
});

if (byId('votante-nuevo')) byId('votante-nuevo').addEventListener('click', ()=>{
  const id = uid();
  state.voters.push({ id, nombre: 'Nuevo votante', activo: true, password: funPassword('nuevo') });
  saveState(state); renderSettings(); renderAuthUsers();
});

// Editor en Ajustes: formularios
if (byId('aj-form-plato')) byId('aj-form-plato').addEventListener('submit', (e)=>{
  e.preventDefault();
  const id = byId('aj-plato-id').value || uid();
  const data = {
    id,
    nombre: byId('aj-plato-nombre').value.trim(),
    descripcion: byId('aj-plato-descripcion').value.trim(),
    chefId: byId('aj-plato-chef').value,
    fecha: byId('aj-plato-fecha').value,
    fotoUrl: byId('aj-plato-foto').value.trim(),
    vuelta: Number(byId('aj-plato-vuelta').value||1),
  };
  const idx = state.platos.findIndex(p=>p.id===id);
  if (idx>=0) state.platos[idx]=data; else state.platos.push(data);
  saveState(state);
  (e.target).reset(); byId('aj-plato-id').value='';
  renderPlatos(); renderSettings(); refreshVoteForm(); initSelectors();
});
if (byId('aj-plato-reset')) byId('aj-plato-reset').addEventListener('click', ()=>{ byId('aj-plato-id').value=''; });

if (byId('aj-form-chef')) byId('aj-form-chef').addEventListener('submit', (e)=>{
  e.preventDefault();
  const id = byId('aj-chef-id').value || uid();
  const c = { id, nombre: byId('aj-chef-nombre').value.trim(), alias: byId('aj-chef-alias').value.trim() };
  const idx = state.chefs.findIndex(x=>x.id===id);
  if (idx>=0) state.chefs[idx]=c; else state.chefs.push(c);
  saveState(state);
  (e.target).reset(); byId('aj-chef-id').value='';
  renderChefs(); renderSettings(); initSelectors();
});

// Proteger Ajustes con contraseña fija
session.isAdmin = false;
if (byId('aj-enter')) byId('aj-enter').addEventListener('click', ()=>{
  const pass = byId('aj-pass').value.trim();
  if (pass === 'discotecastu') {
    session.isAdmin = true;
    byId('aj-auth').style.display = 'none';
    byId('aj-content').style.display = '';
    renderSettings();
  } else {
    alert('Contraseña incorrecta');
  }
});

// Exportar / Importar
byId('btn-export').addEventListener('click', ()=>{
  const data = JSON.stringify(state, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `discoteca-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
});

byId('btn-import').addEventListener('click', async ()=>{
  const file = byId('file-import').files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (!data || !data.voters || !data.chefs || !data.platos || !data.votos) throw new Error('Formato inválido');
    state = data; saveState(state);
    // refresh UI
    renderAuthUsers(); renderSettings(); renderChefs(); renderPlatos(); refreshVoteForm(); renderRanking(); initSelectors();
    alert('Importación exitosa');
  } catch (e) {
    alert('Error al importar JSON');
  }
});

// Cargar seed inicial de platos históricos si está vacío (opcional)
if (state.platos.length === 0) {
  const seed = [
    'Filet especiado al Malbec sobre un colchon de vegetales con un cremoso de papas andinas',
    'Pechuguitas de Campo en crema de vino blanco, raíces de la huerta y hortalizas braseadas al disco',
    'Asado tradicional argentino',
    'Osobuco braseado al Malbec con puré rústico de papas criollas',
    'Sorrentinos de vacio braseado al malbec, cebollas asadas, mozzarella y gouda al disco con salsa bolognesa rosa',
    'Filet de Boga especiada grillé con salsa criolla aromática, acompañada de ensalada rústica de papas y huevos de campo',
    'Estofado criollo de Vacío al Malbec, emulsión de tomates y texturas de huerta en cocción lenta',
    'Guiso de lentejas Nacional y Popular (Dia de la Independencia)',
    'Hamburguesa crujiente de pollo frito extra crispy, coleslaw casera fresca y panceta ahumada premium laqueada en reducción de whisky, acompañada de skin-on fries',
    'Pechuguitas de pollo en reducción de Mostaza Dijon y Miel acompañadas por un aligot francés',
    'Lasaña "Bolognese Classico" al forno',
    'Costilla ancha ahumada en cocción lenta al horno de barro acompañada de esferas de papas a las finas hierbas',
    'Taquitos de Birria y al Pastor (Amor a la Mexicana)',
    'Picana rellena con hebras de mozzarella bufalina, jamón ibérico de bellota y portobellos salteados en manteca de salvia, acompañada de papas nativas crocantes',
    'Matambrito de novillo joven con crema de verdeo silvestre acompañado de papas doradas al horno'
  ];
  const hoy = new Date().toISOString().slice(0,10);
  state.platos = seed.map((nombre, i)=>({
    id: uid(), nombre, descripcion: '', chefId: state.chefs[i%state.chefs.length].id, fecha: hoy, fotoUrl: '', vuelta: Math.floor(i/10)+1
  }));
  saveState(state);
}

// Primera renderización
renderPlatos();
renderChefs();
renderSettings();
renderRanking();
refreshVoteForm();


