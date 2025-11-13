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
  useFirebase: false,
};
const FIREBASE_CFG_KEY = 'discoteca_fb_cfg_v1';
const BACKUP_KEY = 'discoteca_backup_latest';
const DEFAULT_FIREBASE_CFG = {
  apiKey: "AIzaSyDDp4EMH6iK-SjoOZOaJRNCn-OcHgrwSzQ",
  authDomain: "discoteca-real.firebaseapp.com",
  projectId: "discoteca-real",
  storageBucket: "discoteca-real.appspot.com",
  appId: "1:468605215361:web:a00c2d8f0733f41ac92380",
  measurementId: "G-6JN5RNF4ME"
};

let state = loadState();
let session = { userId: null };
let fb = { app: null, storage: null };
let cloud = { unsub: null, started: false };
let isApplyingCloud = false;
const ENABLE_LOCAL_PHOTOS_PROBE = false;

function countEntries(s) {
  try {
    const platos = Array.isArray(s?.platos) ? s.platos.length : 0;
    const votos = Array.isArray(s?.votos) ? s.votos.length : 0;
    const chefs = Array.isArray(s?.chefs) ? s.chefs.length : 0;
    const voters = Array.isArray(s?.voters) ? s.voters.length : 0;
    return { platos, votos, chefs, voters, total: platos + votos + chefs + voters };
  } catch { return { platos:0, votos:0, chefs:0, voters:0, total:0 }; }
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      let parsed = JSON.parse(raw);
      // backfill de ajustes nuevos
      parsed.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings||{}) };
      if (!parsed.platos) parsed.platos = [];
      if (!parsed.votos) parsed.votos = [];

      // Intento de recuperación: si existe backup local más "grande", preferirlo
      try {
        const bakRaw = localStorage.getItem(BACKUP_KEY);
        if (bakRaw) {
          const bak = JSON.parse(bakRaw);
          const cParsed = countEntries(parsed);
          const cBak = countEntries(bak);
          if (cBak.total > cParsed.total) {
            parsed = { ...bak, settings: { ...DEFAULT_SETTINGS, ...(bak.settings||{}) } };
          }
        }
      } catch {}

      saveState(parsed, { skipCloud: true });
      return parsed;
    } catch (e) {}
  }
  const initial = {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    voters: DEFAULT_VOTERS.map(v => ({ id: v.id, nombre: v.nombre, activo: true, password: FUN_PASSWORDS[v.id] || funPassword(v.nombre) })),
    chefs: DEFAULT_VOTERS.map(v => ({ id: v.id, nombre: v.nombre, alias: '' })),
    platos: [], // {id, nombre, descripcion, chefId, fotoUrl, vuelta, orden}
    votos: [], // {id, vuelta, userId, picks:[platoId1, platoId2, platoId3]}
    baseScores: {},
  };
  saveState(initial, { skipCloud: true });
  return initial;
}

function saveState(s, opts) {
  const options = opts || {};
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  if (options.skipCloud) return;
  // Evitar usar 'state' aquí (puede no estar inicializado durante loadState)
  const cloudFlag = isCloudEnabled(s);
  if (cloudFlag && !isApplyingCloud) {
    try {
      const inst = ensureFirebase();
      if (!inst || !firebase.firestore) return;
      const db = firebase.firestore();
      db.collection('discoteca').doc('main').set(s)
        .then(()=>{ try { console.info('CloudSync: estado enviado a Firestore'); } catch {} })
        .catch(()=>{});
    } catch {}
  }
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
  // Prellenar datalist de fotos locales si existen
  const fotoDatalist = byId('aj-foto-datalist');
  if (fotoDatalist && window.__localPhotos) {
    fotoDatalist.innerHTML = window.__localPhotos.map(p => `<option value="${p}"></option>`).join('');
  }

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
    .sort((a,b)=> (a.orden||0) - (b.orden||0))
    .map(p => {
      const chef = state.chefs.find(c => c.id===p.chefId);
      return `<tr>
        <td>${p.fotoUrl?`<img class="thumb" src="${p.fotoUrl}" alt="${p.nombre}">`:''}</td>
        <td>${p.nombre}<div class="muted">${p.descripcion||''}</div></td>
        <td>${chef?chef.nombre:''}</td>
        <td><span class="badge">${p.vuelta}</span></td>
      </tr>`;
    }).join('');
  tb.innerHTML = rows || '<tr><td colspan="4" class="muted">Sin platos aún</td></tr>';
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
  // Puntos base (permiten fijar un podio inicial por vuelta)
  if (!general && state.baseScores && state.baseScores[String(vuelta)]) {
    const base = state.baseScores[String(vuelta)];
    for (const [pid, score] of Object.entries(base)) {
      const num = Number(score)||0;
      if (num>0) puntos.set(pid, (puntos.get(pid)||0)+num);
    }
  }
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
  const hasBase = !!(state.baseScores && state.baseScores[String(vuelta)] && Object.keys(state.baseScores[String(vuelta)]).length>0);
  const reveal = totalVotos >= required || hasBase;
  const overlay = byId('ranking-blur');
  overlay.style.display = reveal ? 'none' : 'flex';
  byId('ranking-info').textContent = reveal ? `Votos: ${totalVotos}` : `Votos: ${totalVotos}/${required} — oculto hasta completar`;

  // Podio para Vuelta 1 (o para la vuelta seleccionada)
  const podium = byId('podium');
  if (podium) {
    const top3 = list.slice(0,3);
    if (top3.length) {
      podium.innerHTML = `
        <div class="podium-wrap">
          <div class="podium-item first"><div class="place">1</div><div class="name">${top3[0].nombre}</div><div class="pts">${top3[0].score} pts</div></div>
          ${top3[1]?`<div class="podium-item second"><div class="place">2</div><div class="name">${top3[1].nombre}</div><div class="pts">${top3[1].score} pts</div></div>`:''}
          ${top3[2]?`<div class="podium-item third"><div class="place">3</div><div class="name">${top3[2].nombre}</div><div class="pts">${top3[2].score} pts</div></div>`:''}
        </div>
      `;
    } else {
      podium.innerHTML = '';
    }
  }

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
  if (byId('aj-fb-flag')) byId('aj-fb-flag').checked = !!state.settings.useFirebase;

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
      .sort((a,b)=> (a.orden||0) - (b.orden||0));
    tbPl.innerHTML = list.map(p=>{
      const chef = state.chefs.find(c=>c.id===p.chefId);
      return `<tr>
        <td>${p.fotoUrl?`<img class="thumb" src="${p.fotoUrl}">`:''}</td>
        <td>${p.nombre}</td>
        <td>${chef?chef.nombre:''}</td>
        <td><span class="badge">${p.vuelta}</span></td>
        <td class="right">
          <button class="ghost" data-aj-edit="${p.id}">Editar</button>
          <button class="ghost" data-aj-del="${p.id}" style="color:#ef476f">Borrar</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="muted">Sin platos</td></tr>';

    tbPl.querySelectorAll('button[data-aj-edit]').forEach(btn=>btn.addEventListener('click', ()=>{
      const p = state.platos.find(x=>x.id===btn.dataset.ajEdit);
      if (!p) return;
      byId('aj-plato-id').value = p.id;
      byId('aj-plato-nombre').value = p.nombre;
      byId('aj-plato-chef').value = p.chefId;
      byId('aj-plato-vuelta').value = p.vuelta;
      byId('aj-plato-descripcion').value = p.descripcion||'';
      byId('aj-plato-foto').value = p.fotoUrl||'';
      if (byId('aj-plato-preview')) {
        if (p.fotoUrl) { byId('aj-plato-preview').src = p.fotoUrl; byId('aj-plato-preview').style.display = 'block'; }
        else { byId('aj-plato-preview').src = ''; byId('aj-plato-preview').style.display = 'none'; }
      }
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
  state.settings.useFirebase = !!(byId('aj-fb-flag') && byId('aj-fb-flag').checked);
  saveState(state);
  if (state.settings.useFirebase) startCloudSync(); else stopCloudSync();
  renderRanking();
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
    fotoUrl: byId('aj-plato-foto').value.trim(),
    vuelta: Number(byId('aj-plato-vuelta').value||1),
  };
  const idx = state.platos.findIndex(p=>p.id===id);
  if (idx>=0) {
    // conservar orden existente
    data.orden = state.platos[idx].orden || data.orden;
    state.platos[idx]=data;
  } else {
    // asignar siguiente orden dentro de la vuelta
    const maxOrden = Math.max(0, ...state.platos.filter(p=>p.vuelta===data.vuelta).map(p=>p.orden||0));
    data.orden = maxOrden + 1;
    state.platos.push(data);
  }
  saveState(state);
  (e.target).reset(); byId('aj-plato-id').value='';
  if (byId('aj-plato-preview')) { byId('aj-plato-preview').src=''; byId('aj-plato-preview').style.display='none'; }
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
    toggleFirebaseBlock();
  } else {
    alert('Contraseña incorrecta');
  }
});

// Dropzone para fotos de platos en Ajustes
let dropInited = false;
function initPhotoDropzone() {
  if (dropInited) return;
  const dz = byId('aj-plato-drop');
  const file = byId('aj-plato-file');
  const preview = byId('aj-plato-preview');
  const progress = byId('aj-plato-progress');
  const bar = byId('aj-plato-progress-bar');
  if (!dz || !file || !preview) return;
  const setImage = async (f) => {
    if (!f || !f.type?.startsWith('image/')) return;
    // Si hay Firebase configurado, subir a Storage, sino usar dataURL
    const cfg = loadFirebaseCfg();
    const useFb = !!state.settings.useFirebase && !!cfg;
    if (useFb) {
      try {
        progress.style.display = '';
        bar.style.width = '0%';
        const url = await uploadToFirebase(f, (pct)=>{ bar.style.width = pct+'%'; });
        byId('aj-plato-foto').value = url;
        preview.src = url; preview.style.display = 'block';
        progress.style.display = 'none';
      } catch (e) {
        progress.style.display = 'none';
        // fallback dataURL
        const reader = new FileReader();
        reader.onload = () => { const dataUrl = reader.result; byId('aj-plato-foto').value = dataUrl; preview.src = dataUrl; preview.style.display = 'block'; };
        reader.readAsDataURL(f);
      }
    } else {
      const reader = new FileReader();
      reader.onload = () => { const dataUrl = reader.result; byId('aj-plato-foto').value = dataUrl; preview.src = dataUrl; preview.style.display = 'block'; };
      reader.readAsDataURL(f);
    }
  };
  dz.addEventListener('click', ()=> file.click());
  dz.addEventListener('dragover', (e)=>{ e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', ()=> dz.classList.remove('dragover'));
  dz.addEventListener('drop', (e)=>{ e.preventDefault(); dz.classList.remove('dragover'); const f = e.dataTransfer.files[0]; setImage(f); });
  file.addEventListener('change', ()=> setImage(file.files[0]));
  dropInited = true;
}

// Inicializar dropzone cuando se muestre Ajustes
if (views.ajustes) {
  const obs = new MutationObserver(()=>{ if (views.ajustes.classList.contains('visible')) { initPhotoDropzone(); } });
  obs.observe(views.ajustes, { attributes: true, attributeFilter: ['class'] });
}

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
  state.platos = seed.map((nombre, i)=>({
    id: uid(), nombre, descripcion: '', chefId: state.chefs[i%state.chefs.length].id, fotoUrl: '', vuelta: Math.floor(i/10)+1, orden: i+1
  }));
  saveState(state);
}

// --- Firebase helpers ---
function loadFirebaseCfg() {
  try {
    const raw = localStorage.getItem(FIREBASE_CFG_KEY);
    if (!raw) {
      // si no hay config guardada, usar la por defecto provista
      localStorage.setItem(FIREBASE_CFG_KEY, JSON.stringify(DEFAULT_FIREBASE_CFG));
      return DEFAULT_FIREBASE_CFG;
    }
    const cfg = JSON.parse(raw);
    // Arreglar dominio de bucket si viene mal
    if (cfg && typeof cfg.storageBucket === 'string' && cfg.storageBucket.includes('firebasestorage.app')) {
      cfg.storageBucket = cfg.storageBucket.replace('firebasestorage.app', 'appspot.com');
      localStorage.setItem(FIREBASE_CFG_KEY, JSON.stringify(cfg));
    }
    return cfg && cfg.apiKey && cfg.storageBucket ? cfg : DEFAULT_FIREBASE_CFG;
  } catch { return null; }
}

function ensureFirebase() {
  if (fb.app) return fb;
  const cfg = loadFirebaseCfg();
  if (!cfg || !window.firebase) return null;
  try {
    fb.app = firebase.apps?.length ? firebase.app() : firebase.initializeApp(cfg);
    fb.storage = firebase.storage();
    try { console.info('Firebase: inicializado', { projectId: cfg.projectId, storageBucket: cfg.storageBucket }); } catch {}
    // no esperar aquí; se asegura antes de subir
    firebase.auth().signInAnonymously().catch(()=>{});
    return fb;
  } catch (e) { try { console.warn('Firebase: error al inicializar', e); } catch {} return null; }
}

function isCloudEnabled(explicitState) {
  // No requerimos ningún toggle; si hay config Firebase válida y Firestore cargado, habilitamos sync
  const cfg = loadFirebaseCfg();
  return !!cfg && !!window.firebase && !!firebase.firestore;
}

function refreshAll() {
  try {
    renderAuthUsers(); renderSettings(); renderChefs(); renderPlatos(); refreshVoteForm(); renderRanking(); initSelectors();
  } catch {}
}

function startCloudSync() {
  if (!isCloudEnabled()) { stopCloudSync(); return; }
  const inst = ensureFirebase();
  if (!inst || !firebase.firestore) return;
  const db = firebase.firestore();
  // habilitar persistencia offline si es posible (best effort)
  try { db.enablePersistence && db.enablePersistence({ synchronizeTabs: true }); } catch {}
  const docRef = db.collection('discoteca').doc('main');
  // Inicial: si no existe, sembrar con local; si existe pero está vacío y local tiene datos, subir local
  docRef.get().then((doc)=>{
    try {
      const localCounts = countEntries(state);
      if (!doc.exists) {
        if (localCounts.total > 0) docRef.set(state).catch(()=>{});
        return;
      }
      const remote = doc.data()||{};
      const remoteCounts = countEntries(remote);
      if (remoteCounts.total === 0 && localCounts.total > 0) {
        docRef.set(state).catch(()=>{});
      }
    } catch {}
  }).catch(()=>{});
  if (cloud.unsub) { try { cloud.unsub(); } catch {} }
  try { console.info('CloudSync: iniciando suscripción a discoteca/main'); } catch {}
  cloud.unsub = docRef.onSnapshot((snap)=>{
    if (!snap.exists) return;
    const data = snap.data();
    if (!data) return;
    try { console.info('CloudSync: snapshot recibido'); } catch {}
    try {
      const localStr = JSON.stringify(state);
      const remoteStr = JSON.stringify(data);
      if (localStr === remoteStr) return;
    } catch {}
    isApplyingCloud = true;
    // Guardar respaldo local antes de aplicar remoto
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(state)); console.info('CloudSync: respaldo local guardado'); } catch {}
    state = data;
    saveState(state, { skipCloud: true });
    refreshAll();
    isApplyingCloud = false;
  });
  cloud.started = true;
}

function stopCloudSync() {
  if (cloud.unsub) { try { cloud.unsub(); } catch {} cloud.unsub = null; }
  cloud.started = false;
}

// Controles rápidos (barra superior)
function quickSetStatus(msg) { try { const el = byId('qa-status'); if (el) el.textContent = msg||''; } catch {} }
function quickShowRanking() {
  try {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    Object.values(views).forEach(v => v.classList.remove('visible'));
    views.ranking.classList.add('visible');
    renderRanking();
    quickSetStatus('Mostrando Ranking');
  } catch {}
}
async function quickPushCloud() {
  try {
    const inst = ensureFirebase();
    if (!inst || !firebase.firestore) { alert('Configura Firebase primero'); return; }
    const db = firebase.firestore();
    await db.collection('discoteca').doc('main').set(state);
    quickSetStatus('Estado subido a la nube');
    console.info('Quick: push a Firestore OK');
  } catch (e) {
    quickSetStatus('Error al subir a la nube');
    console.warn('Quick push error', e);
  }
}
async function quickPullCloud() {
  try {
    const inst = ensureFirebase();
    if (!inst || !firebase.firestore) { alert('Configura Firebase primero'); return; }
    const db = firebase.firestore();
    const ref = db.collection('discoteca').doc('main');
    const snap = await ref.get();
    if (!snap.exists) { alert('No hay datos en la nube'); return; }
    const data = snap.data();
    if (!data) { alert('Documento vacío'); return; }
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(state)); } catch {}
    isApplyingCloud = true;
    state = data;
    saveState(state, { skipCloud: true });
    refreshAll();
    isApplyingCloud = false;
    quickSetStatus('Estado traído de la nube');
    console.info('Quick: pull de Firestore OK');
  } catch (e) {
    quickSetStatus('Error al traer de la nube');
    console.warn('Quick pull error', e);
  }
}

// Bind de barra rápida
if (byId('qa-ranking')) byId('qa-ranking').addEventListener('click', quickShowRanking);
if (byId('qa-export')) byId('qa-export').addEventListener('click', ()=>{
  try {
    const data = JSON.stringify(state, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `discoteca-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    quickSetStatus('Exportado JSON');
  } catch { quickSetStatus('Error al exportar'); }
});
if (byId('qa-import')) byId('qa-import').addEventListener('click', ()=>{
  const fi = byId('qa-file-import') || byId('file-import');
  if (fi) fi.click();
});
if (byId('qa-file-import')) byId('qa-file-import').addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    if (!data || !data.voters || !data.chefs || !data.platos || !data.votos) throw new Error('Formato inválido');
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(state)); } catch {}
    state = data; saveState(state, { skipCloud: true });
    renderAuthUsers(); renderSettings(); renderChefs(); renderPlatos(); refreshVoteForm(); renderRanking(); initSelectors();
    quickSetStatus('Importado JSON');
  } catch (e2) {
    quickSetStatus('Error al importar JSON');
  }
});
if (byId('qa-push')) byId('qa-push').addEventListener('click', quickPushCloud);
if (byId('qa-pull')) byId('qa-pull').addEventListener('click', quickPullCloud);
if (byId('qa-podio-v1')) byId('qa-podio-v1').addEventListener('click', ()=>{
  // Buscar/crear los 3 platos y fijar baseScores de Vuelta 1
  function findByTextContains(text) {
    const t = text.toLowerCase();
    return state.platos.find(p => (p.nombre||'').toLowerCase().includes(t));
  }
  function ensurePlato(nombre) {
    let p = findByTextContains(nombre);
    if (!p) {
      p = {
        id: uid(),
        nombre,
        descripcion: '',
        chefId: state.chefs[0]?.id || (state.chefs[0]={id:uid(), nombre:'Chef', alias:''}).id,
        fotoUrl: '',
        vuelta: 1,
        orden: (Math.max(0, ...state.platos.filter(x=>x.vuelta===1).map(x=>x.orden||0)) + 1)
      };
      state.platos.push(p);
    } else {
      p.vuelta = 1;
    }
    return p.id;
  }
  const idA = ensurePlato('Hamburguesa crujiente de pollo frito');
  const idB = ensurePlato('Osobuco braseado al Malbec');
  const idC = ensurePlato('Pechuguitas de pollo en reducción de Mostaza Dijon y Miel');
  if (!state.baseScores) state.baseScores = {};
  state.baseScores['1'] = { [idA]: 21, [idB]: 17, [idC]: 6 };
  saveState(state);
  renderPlatos(); renderRanking(); renderSettings();
  quickSetStatus('Podio V1 fijado (21/17/6)');
  // Empujar a la nube
  quickPushCloud();
});
if (byId('qa-restore')) byId('qa-restore').addEventListener('click', ()=>{
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    if (!raw) { alert('No hay respaldo local disponible'); return; }
    const data = JSON.parse(raw);
    if (!data || !data.voters || !data.chefs || !data.platos || !data.votos) { alert('Respaldo inválido'); return; }
    state = data;
    saveState(state, { skipCloud: true });
    refreshAll();
    quickSetStatus('Respaldo restaurado');
    console.info('Quick: respaldo restaurado desde BACKUP');
  } catch (e) {
    quickSetStatus('Error al restaurar respaldo');
  }
});
if (byId('qa-copy')) byId('qa-copy').addEventListener('click', async ()=>{
  try {
    const primary = localStorage.getItem(STORAGE_KEY);
    const backup = localStorage.getItem(BACKUP_KEY);
    const text = primary || backup || JSON.stringify(state, null, 2);
    await (navigator.clipboard && navigator.clipboard.writeText(text));
    quickSetStatus('JSON copiado al portapapeles');
  } catch {
    quickSetStatus('No se pudo copiar JSON');
  }
});

// Esperar a que la auth anónima esté lista antes de subir
function waitForAnonymousAuth(timeoutMs = 7000) {
  const inst = ensureFirebase();
  if (!inst) return Promise.reject(new Error('Firebase no configurado'));
  if (firebase.auth().currentUser) return Promise.resolve(firebase.auth().currentUser);
  return new Promise((resolve, reject) => {
    let settled = false;
    const off = firebase.auth().onAuthStateChanged((u) => {
      if (u && !settled) { settled = true; off(); resolve(u); }
    });
    firebase.auth().signInAnonymously().catch(() => {});
    setTimeout(() => { if (!settled) { try { off(); } catch {} reject(new Error('Auth anónima no disponible')); } }, timeoutMs);
  });
}

async function uploadToFirebase(file, onProgress) {
  const fbi = ensureFirebase();
  if (!fbi) throw new Error('Firebase no configurado');
  await waitForAnonymousAuth();
  const ext = (file.name.split('.').pop()||'jpg').toLowerCase();
  const path = `platos/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const ref = fbi.storage.ref().child(path);
  return await new Promise((resolve, reject)=>{
    const task = ref.put(file, { contentType: file.type });
    task.on('state_changed', (snap)=>{
      const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
      if (onProgress) onProgress(pct);
    }, reject, async ()=>{
      const url = await ref.getDownloadURL();
      resolve(url);
    });
  });
}

// Guardar/mostrar config Firebase en Ajustes
if (byId('fb-guardar')) byId('fb-guardar').addEventListener('click', ()=>{
  const cfg = {
    apiKey: byId('fb-apiKey').value.trim(),
    authDomain: byId('fb-authDomain').value.trim(),
    projectId: byId('fb-projectId').value.trim(),
    storageBucket: byId('fb-storageBucket').value.trim(),
    appId: byId('fb-appId').value.trim(),
  };
  localStorage.setItem(FIREBASE_CFG_KEY, JSON.stringify(cfg));
  byId('fb-status').textContent = 'Firebase guardado';
  ensureFirebase();
  // Iniciar/actualizar sincronización siempre que haya config válida
  startCloudSync();
  byId('fb-status').textContent = 'Firebase guardado y sincronización activa';
});

function populateFirebaseForm() {
  const cfg = loadFirebaseCfg();
  if (!cfg) return;
  if (byId('fb-apiKey')) byId('fb-apiKey').value = cfg.apiKey||'';
  if (byId('fb-authDomain')) byId('fb-authDomain').value = cfg.authDomain||'';
  if (byId('fb-projectId')) byId('fb-projectId').value = cfg.projectId||'';
  if (byId('fb-storageBucket')) byId('fb-storageBucket').value = cfg.storageBucket||'';
  if (byId('fb-appId')) byId('fb-appId').value = cfg.appId||'';
}
populateFirebaseForm();
ensureFirebase();
startCloudSync();

// Ocultar bloque Firebase por defecto; mostrar solo si session.isAdmin
function toggleFirebaseBlock() {
  const show = !!session.isAdmin;
  if (byId('fb-block')) byId('fb-block').style.display = show ? '' : 'none';
  if (byId('fb-block-title')) byId('fb-block-title').style.display = show ? '' : 'none';
}
toggleFirebaseBlock();

// Migración: corregir URLs antiguas de fotos con dominio incorrecto
(function migratePhotoUrls() {
  let changed = false;
  for (const p of state.platos) {
    if (p.fotoUrl && typeof p.fotoUrl === 'string' && p.fotoUrl.includes('discoteca-real.firebasestorage.app')) {
      p.fotoUrl = p.fotoUrl.replace('discoteca-real.firebasestorage.app', 'discoteca-real.appspot.com');
      changed = true;
    }
  }
  if (changed) saveState(state);
})();

// Primera renderización
renderPlatos();
renderChefs();
renderSettings();
renderRanking();
refreshVoteForm();

// Detectar fotos estáticas desplegadas en /fotos/ (si existe la carpeta)
(async function probeLocalPhotos(){
  if (!ENABLE_LOCAL_PHOTOS_PROBE) return;
  const candidates = [
    'fotos/1.jpg','fotos/1.jpeg','fotos/1.png','fotos/01.jpg','fotos/01.jpeg','fotos/01.png'
  ];
  const found = [];
  await Promise.all(candidates.map(async (p)=>{
    try { const r = await fetch(p, { method: 'HEAD' }); if (r.ok) found.push('/'+p.replace(/^\/?/,'')); } catch {}
  }));
  if (found.length) {
    window.__localPhotos = found;
    renderSettings();
  }
})();

// Migración: subir fotos embebidas (data URL) a Firebase para que se vean en otros dispositivos
async function migrateEmbeddedPhotos() {
  const cfg = loadFirebaseCfg();
  const useFb = !!cfg; // usar Firebase si hay config
  const status = byId('aj-migrar-status');
  if (!useFb) { if (status) status.textContent = 'Configura Firebase primero.'; return; }
  let done = 0, total = 0;
  for (const p of state.platos) {
    if (p.fotoUrl && typeof p.fotoUrl === 'string' && p.fotoUrl.startsWith('data:')) total++;
  }
  if (!total) { if (status) status.textContent = 'No hay fotos embebidas para migrar.'; return; }
  if (status) status.textContent = `Migrando ${total} fotos...`;
  for (const p of state.platos) {
    if (!(p.fotoUrl && p.fotoUrl.startsWith('data:'))) continue;
    try {
      const blob = await (await fetch(p.fotoUrl)).blob();
      const ext = blob.type.split('/')[1]||'jpg';
      const file = new File([blob], `migrada.${ext}`, { type: blob.type });
      const url = await uploadToFirebase(file);
      p.fotoUrl = url; done++; saveState(state);
      if (status) status.textContent = `Migradas ${done}/${total}`;
    } catch (e) {
      if (status) status.textContent = `Error en una foto, continúa ${done}/${total}`;
    }
  }
  if (status) status.textContent = `Listo: ${done}/${total} migradas.`;
  renderPlatos(); renderSettings();
}
if (byId('aj-migrar')) byId('aj-migrar').addEventListener('click', migrateEmbeddedPhotos);



// Asignar foto automáticamente a platos conocidos (si falta foto)
(function autoAssignKnownPhotos(){
  try {
    const mappings = [
      { text: 'Filet especiado al Malbec', url: '/FOTOS/file.jpeg' },
    ];
    let changed = false;
    for (const m of mappings) {
      const p = state.platos.find(x => (x.nombre||'').toLowerCase().includes(m.text.toLowerCase()));
      if (p && (!p.fotoUrl || p.fotoUrl.trim()==='')) { p.fotoUrl = m.url; changed = true; }
    }
    if (changed) { saveState(state); renderPlatos(); renderSettings(); }
  } catch {}
})();

// Botón manual para asignar por nombre
async function autoAssignByButton() {
  const status = byId('aj-auto-assign-status');
  if (status) status.textContent = 'Buscando archivos en /FOTOS y /fotos...';
  let count = 0;
  const folders = ['/FOTOS/','/fotos/'];
  const exts = ['.jpg','.jpeg','.png'];
  async function findUrl(base) {
    for (const folder of folders) {
      for (const ext of exts) {
        const url = `${folder}${base}${ext}`;
        try { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) return url; } catch {}
      }
    }
    return null;
  }
  for (const p of state.platos) {
    if (p.fotoUrl && p.fotoUrl.trim()!=='') continue;
    const base = (p.nombre||'').toLowerCase().split(/[\s\"\'\,\(\)]+/).find(w=>w.length>3);
    if (!base) continue;
    const url = await findUrl(base);
    if (url) { p.fotoUrl = url; count++; }
  }
  if (count>0) { saveState(state); renderPlatos(); renderSettings(); }
  if (status) status.textContent = count>0 ? `Asignadas ${count} fotos.` : 'No se encontraron archivos coincidentes.';
}
if (byId('aj-auto-assign')) byId('aj-auto-assign').addEventListener('click', autoAssignByButton);

