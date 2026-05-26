const API = '';
let state = { user: null, token: null, requests: [], allProducts: [] };
let currentTab = 'reportado';

function $(id) { return document.getElementById(id); }

async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Error de conexión' }));
    throw new Error(err.detail || `Error ${res.status}`);
  }
  return res.json();
}

/* ===== AUTH ===== */
function showLoading() { $('loading-screen').style.display = 'flex'; $('login-screen').style.display = 'none'; $('app-screen').style.display = 'none'; }
function showLogin() { $('loading-screen').style.display = 'none'; $('login-screen').style.display = 'flex'; $('app-screen').style.display = 'none'; }
function showApp() { $('loading-screen').style.display = 'none'; $('login-screen').style.display = 'none'; $('app-screen').style.display = 'block'; }

async function handleLogin() {
  const u = $('login-user').value.trim();
  const p = $('login-pass').value;
  const btn = $('login-btn'); btn.disabled = true; btn.textContent = 'Ingresando...';
  try {
    const data = await api('/api/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) });
    state.token = data.token; state.user = data.user;
    localStorage.setItem('sgra_token', data.token);
    localStorage.setItem('sgra_user', JSON.stringify(data.user));
    await initApp();
  } catch (e) { alert(e.message); }
  btn.disabled = false; btn.textContent = 'Ingresar';
}

async function handleLogout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
  state.token = null; state.user = null;
  localStorage.removeItem('sgra_token'); localStorage.removeItem('sgra_user');
  showLogin();
}

/* ===== INIT ===== */
async function initApp() { showApp(); renderTopbar(); await loadData(); }

async function loadData() {
  try {
    state.requests = await api('/api/requests');
    renderDashboard();
  } catch (e) { if (e.message.includes('Token') || e.message.includes('401')) handleLogout(); }
}

/* ===== TOPBAR ===== */
function renderTopbar() {
  $('topbar').innerHTML = `
    <div class="topbar-left"><h2>📦 SGRA</h2></div>
    <div class="topbar-right">
      <span class="user-badge">${state.user.name}</span>
      <button class="topbar-btn" onclick="showModal('Historial', renderHistory)" title="Historial">📋</button>
      ${state.user.role === 'admin' ? `<button class="topbar-btn" onclick="showModal('Panel Admin', renderAdminPanel)" title="Admin">⚙️</button>` : ''}
      <button class="topbar-btn" onclick="handleLogout()" title="Salir">🚪</button>
    </div>
  `;
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const reportados = state.requests.filter(r => r.status === 'reportado');
  const solicitados = state.requests.filter(r => r.status === 'solicitado');
  const recibidos = state.requests.filter(r => r.status === 'recibido');

  $('dashboard').innerHTML = `
    <div class="tabs" id="tabs">
      <button class="tab ${currentTab === 'reportado' ? 'active' : ''}" onclick="switchTab('reportado')">
        ⏳ Pendientes <span class="count">${reportados.length}</span>
      </button>
      <button class="tab ${currentTab === 'solicitado' ? 'active' : ''}" onclick="switchTab('solicitado')">
        📤 Solicitados <span class="count">${solicitados.length}</span>
      </button>
      <button class="tab ${currentTab === 'recibido' ? 'active' : ''}" onclick="switchTab('recibido')">
        ✅ Recibidos <span class="count">${recibidos.length}</span>
      </button>
    </div>
    <div class="kanban" id="kanban">
      ${renderCol('reportado', reportados)}
      ${renderCol('solicitado', solicitados)}
      ${renderCol('recibido', recibidos)}
    </div>
  `;
  switchTab(currentTab);
}

function renderCol(status, items) {
  const labels = { reportado: 'Por atender', solicitado: 'Solicitado a proveedor', recibido: 'Recibido' };
  return `<div class="kanban-col ${currentTab === status ? '' : 'hidden'}" data-col="${status}">
    <div class="section-title"><span class="status-dot ${status}"></span> ${labels[status]}<span class="count">${items.length}</span></div>
    ${items.length === 0 ? '<div class="empty-state"><div class="icon">📭</div><p>No hay solicitudes aquí</p></div>' : ''}
    ${items.map(r => renderCard(r)).join('')}
  </div>`;
}

function renderCard(r) {
  const attn = r.requires_attention ? 'attention' : '';
  const badgeCls = r.requires_attention ? 'badge-attention' : `badge-${r.status}`;
  const badgeText = r.requires_attention ? '⚠️ Urgente' : r.status === 'reportado' ? 'Pendiente' : r.status === 'solicitado' ? 'Solicitado' : 'Recibido';
  let timeText = r.hours_elapsed < 1 ? 'Ahora' : r.hours_elapsed < 24 ? `Hace ${Math.floor(r.hours_elapsed)}h` : `Hace ${Math.floor(r.hours_elapsed/24)}d`;
  const hasNote = r.note && r.note.trim();
  return `<div class="card ${r.status} ${attn}" onclick="showDetail(${r.id})">
    <div class="card-header">
      <div class="card-title">${r.product_name}</div>
      <span class="card-badge ${badgeCls}">${badgeText}</span>
    </div>
    <div class="card-meta">
      <span>📦 ${r.quantity} uds</span>
      <span>👤 ${r.requester_name}</span>
      <span>⏱ ${timeText}</span>
    </div>
    ${hasNote ? `<div class="card-note">💬 ${r.note}</div>` : ''}
    <div class="card-actions" onclick="event.stopPropagation()">
      ${r.status === 'reportado' ? `<button class="btn btn-amber" onclick="advance(${r.id},'solicitado')">📤 Solicitar</button>` : ''}
      ${r.status === 'solicitado' ? `<button class="btn btn-green" onclick="advance(${r.id},'recibido')">✅ Recibido</button>` : ''}
    </div>
  </div>`;
}

function switchTab(tab) { currentTab = tab; document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); document.querySelectorAll('.tab').forEach(t => { if (t.textContent.includes(tab==='reportado'?'Pendientes':tab==='solicitado'?'Solicitados':'Recibidos')) t.classList.add('active'); }); document.querySelectorAll('.kanban-col').forEach(c => c.classList.toggle('hidden', c.dataset.col !== tab)); }

async function advance(id, status) { try { await api(`/api/requests/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }); await loadData(); } catch (e) { alert(e.message); } }

/* ===== DETAIL ===== */
async function showDetail(id) {
  const r = state.requests.find(req => req.id === id);
  if (!r) return;
  const canDelete = state.user.role === 'admin' || r.requested_by === state.user.id;
  const icons = { reportado: '⏳', solicitado: '📤', recibido: '✅' };
  showModalContent('Detalle', `
    <div class="detail-head"><span style="font-size:2rem">${icons[r.status]||'📦'}</span><div><h3 style="margin:0">${r.product_name}</h3></div></div>
    <div class="detail-field"><div class="detail-label">Cantidad</div><div class="detail-value">${r.quantity} uds</div></div>
    ${r.note ? `<div class="detail-field"><div class="detail-label">Nota</div><div class="detail-value">${r.note}</div></div>` : ''}
    <div class="detail-field"><div class="detail-label">Reportado por</div><div class="detail-value">${r.requester_name}</div></div>
    <div class="detail-field"><div class="detail-label">Estado</div><div class="detail-value" style="text-transform:capitalize">${r.status}</div></div>
    <div class="detail-field"><div class="detail-label">Tiempo</div><div class="detail-value">${r.hours_elapsed}h</div></div>
    <div class="detail-actions">
      ${r.status === 'reportado' ? `<button class="btn btn-amber btn-block" onclick="closeModal('modal-overlay');advance(${r.id},'solicitado')">📤 Solicitar a proveedor</button>` : ''}
      ${r.status === 'solicitado' ? `<button class="btn btn-green btn-block" onclick="closeModal('modal-overlay');advance(${r.id},'recibido')">✅ Marcar como recibido</button>` : ''}
      ${canDelete ? `<button class="btn btn-danger" onclick="closeModal('modal-overlay');deleteReq(${r.id})">🗑 Eliminar</button>` : ''}
      <button class="btn btn-ghost" onclick="closeModal('modal-overlay')">Cerrar</button>
    </div>
  `);
}

async function deleteReq(id) { if (!confirm('¿Eliminar?')) return; try { await api(`/api/requests/${id}`, { method: 'DELETE' }); await loadData(); } catch (e) { alert(e.message); } }

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ===== MODAL ===== */
function showModal(title, renderFn) { $('modal-overlay').classList.add('open'); $('modal-inner').innerHTML = '<div class="load-spinner"></div>'; setTimeout(() => { $('modal-inner').innerHTML = renderFn(); }, 50); }

function showModalContent(title, html) { $('modal-overlay').classList.add('open'); $('modal-inner').innerHTML = `<div class="modal-header"><h3>${title}</h3><button class="btn btn-ghost btn-sm modal-x" onclick="closeModal('modal-overlay')">✕</button></div>${html}`; }

/* ===== NEW REQUEST - Free text ===== */
function openNewRequest() {
  $('modal-overlay').classList.add('open');
  $('modal-inner').innerHTML = `
    <div class="modal-header"><h3>📦 Reportar faltante</h3><button class="btn btn-ghost btn-sm modal-x" onclick="closeModal('modal-overlay')">✕</button></div>
    <div class="form-group"><label>¿Qué falta?</label><textarea id="nr-desc" placeholder="Ej: Caja de guantes talla L, 10 paquetes" rows="2" style="resize:vertical"></textarea></div>
    <div class="form-group"><label>Cantidad</label><input type="number" id="nr-qty" value="1" min="1" inputmode="numeric"></div>
    <div class="form-group"><label>Nota (opcional)</label><textarea id="nr-note" placeholder="Ej: urgente para pedido de mañana" rows="2" style="resize:vertical"></textarea></div>
    <button class="btn btn-primary btn-block" id="nr-submit" onclick="submitRequest()">📦 Reportar faltante</button>
  `;
  setTimeout(() => { const inp = $('nr-desc'); if (inp) inp.focus(); }, 300);
}

async function submitRequest() {
  const desc = $('nr-desc').value.trim();
  if (!desc) return alert('Escribe qué falta');
  const qty = parseInt($('nr-qty').value) || 1;
  const note = $('nr-note').value.trim();
  const btn = $('nr-submit');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    await api('/api/requests', { method: 'POST', body: JSON.stringify({ description: desc, quantity: qty, note }) });
    closeModal('modal-overlay'); await loadData();
  } catch (e) { alert(e.message); }
  btn.disabled = false; btn.textContent = '📦 Reportar faltante';
}

/* ===== HISTORY ===== */
function renderHistory() {
  api('/api/requests/history').then(h => {
    if (h.length === 0) { $('modal-inner').innerHTML = `<div class="modal-header"><h3>📋 Historial</h3><button class="btn btn-ghost btn-sm modal-x" onclick="closeModal('modal-overlay')">✕</button></div><div class="empty-state"><div class="icon">📋</div><p>Vacío</p></div>`; return; }
    $('modal-inner').innerHTML = `<div class="modal-header"><h3>📋 Historial (${h.length})</h3><button class="btn btn-ghost btn-sm modal-x" onclick="closeModal('modal-overlay')">✕</button></div>${
      h.map(x => `<div class="history-item"><div class="info"><strong>${x.product_name}</strong><small>${x.quantity} uds — ${x.requester_name}</small></div><div class="date">${x.completed_at ? new Date(x.completed_at).toLocaleDateString() : ''}</div></div>`).join('')
    }`;
  }).catch(e => { $('modal-inner').innerHTML = `<div class="alert alert-error">${e.message}</div>`; });
  return '<div class="load-spinner"></div>';
}

/* ===== ADMIN ===== */
function renderAdminPanel() {
  loadAllProducts();
  return `<div class="modal-header"><h3>⚙️ Panel Admin</h3><button class="btn btn-ghost btn-sm modal-x" onclick="closeModal('modal-overlay')">✕</button></div>
    <div class="admin-tabs">
      <button class="tab active" onclick="switchAdminTab('users',this)">👥 Usuarios</button>
      <button class="tab" onclick="switchAdminTab('products',this)">📦 Productos</button>
      <button class="tab" onclick="switchAdminTab('import',this)">📥 Importar</button>
      <button class="tab" onclick="switchAdminTab('settings',this)">⚙️ Ajustes</button>
    </div>
    <div id="admin-content"></div>`;
}

function switchAdminTab(tab, btn) { document.querySelectorAll('.admin-tabs .tab').forEach(t => t.classList.remove('active')); btn.classList.add('active'); if (tab==='users') renderAdminUsers(); else if (tab==='products') renderAdminProducts(); else if (tab==='import') renderAdminImport(); else renderAdminSettings(); }

async function loadAllProducts() {
  try { state.allProducts = await api('/api/products'); } catch (_) { state.allProducts = []; }
}

async function renderAdminUsers() {
  try {
    const users = await api('/api/users');
    $('admin-content').innerHTML = `
      <div class="admin-section"><h4>👥 Usuarios</h4>${users.map(u => `<div class="user-row"><div class="info"><strong>${u.name}</strong><small>@${u.username}</small></div><span class="role-badge ${u.role==='admin'?'role-admin':'role-worker'}">${u.role==='admin'?'Admin':'Aux'}</span>${state.user.id!==u.id?`<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑</button>`:''}</div>`).join('')}</div>
      <div class="admin-section"><h4>➕ Nuevo usuario</h4>
        <div class="form-group"><label>Nombre</label><input type="text" id="nu-name" placeholder="Ej: Luis Fernández"></div>
        <div class="form-group"><label>Usuario</label><input type="text" id="nu-user" placeholder="Ej: luis"></div>
        <div class="form-group"><label>Contraseña</label><input type="text" id="nu-pass" placeholder="Mín. 4 caracteres"></div>
        <div class="form-group"><label>Rol</label><select id="nu-role"><option value="worker">Auxiliar</option><option value="admin">Admin</option></select></div>
        <button class="btn btn-primary btn-block" onclick="createUser()">Crear usuario</button>
      </div>`;
  } catch (e) { $('admin-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function createUser() {
  const name = $('nu-name').value.trim(); const username = $('nu-user').value.trim(); const password = $('nu-pass').value; const role = $('nu-role').value;
  if (!name||!username||!password) return alert('Completa todos los campos');
  if (password.length<4) return alert('Mínimo 4 caracteres');
  try { await api('/api/users', { method: 'POST', body: JSON.stringify({name,username,password,role}) }); $('nu-name').value='';$('nu-user').value='';$('nu-pass').value=''; renderAdminUsers(); } catch(e) { alert(e.message); }
}

async function deleteUser(id) { if (!confirm('¿Eliminar usuario?')) return; try { await api(`/api/users/${id}`, { method: 'DELETE' }); renderAdminUsers(); } catch (e) { alert(e.message); } }

/* ADMIN PRODUCTS */
async function renderAdminProducts() {
  try {
    const products = await api('/api/products');
    const cats = {}; products.forEach(p => { if (!cats[p.category]) cats[p.category] = []; cats[p.category].push(p); });
    let html = `<div class="admin-section"><div style="display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-bottom:.75rem"><h4 style="margin:0">📦 Productos (${products.length})</h4><button class="btn btn-sm btn-soft" onclick="showAddProductForm()">+ Agregar</button></div>
      <div style="margin-bottom:.75rem"><input type="text" placeholder="Buscar..." style="width:100%;padding:.75rem;border:2px solid var(--gray-200);border-radius:var(--radius);font-size:1rem" oninput="filterAdminProducts(this.value)"></div>`;
    for (const [cat, items] of Object.entries(cats)) {
      html += `<div class="cat-title">${cat}</div>`;
      items.forEach(p => { html += `<div class="admin-prod" data-n="${p.name.toLowerCase()}" data-c="${(p.code||'').toLowerCase()}"><div style="display:flex;align-items:center;gap:.5rem;flex:1;min-width:0">${p.code?`<span class="prod-code">${p.code}</span>`:''}<span style="font-size:.875rem">${p.name}</span></div><button class="btn btn-sm btn-danger" onclick="adminDeleteProduct(${p.id})">✕</button></div>`; });
    }
    $('admin-content').innerHTML = html + '</div>';
  } catch (e) { $('admin-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

function filterAdminProducts(q) { q = q.toLowerCase(); document.querySelectorAll('.admin-prod').forEach(el => { el.style.display = (!q || el.dataset.n.includes(q) || el.dataset.c.includes(q)) ? 'flex' : 'none'; }); }

function showAddProductForm() { showModalContent('Agregar producto', `<div class="form-group"><label>Código</label><input type="text" id="ap-code" placeholder="G-013"></div><div class="form-group"><label>Nombre</label><input type="text" id="ap-name" placeholder="Nombre del producto"></div><div class="form-group"><label>Categoría</label><input type="text" id="ap-cat" placeholder="Categoría" value="General"></div><button class="btn btn-primary btn-block" onclick="adminAddProduct()">Guardar</button>`); }

async function adminAddProduct() { const code=$('ap-code').value.trim();const name=$('ap-name').value.trim();const cat=$('ap-cat').value.trim()||'General';if(!name) return alert('Nombre requerido');try{await api('/api/products',{method:'POST',body:JSON.stringify({code,name,category:cat})});closeModal('modal-overlay');renderAdminProducts();}catch(e){alert(e.message);}}

async function adminDeleteProduct(id) { if (!confirm('¿Eliminar producto?')) return; try { await api(`/api/products/${id}`, { method: 'DELETE' }); renderAdminProducts(); } catch (e) { alert(e.message); } }

/* ADMIN IMPORT */
function renderAdminImport() { $('admin-content').innerHTML = `<div class="admin-section"><h4>📥 Importar desde CSV</h4><p class="text-sm text-muted mb-1">Pega datos copiados de Excel. Formato: <code>código,nombre,categoría</code></p><textarea class="import-area" id="csv-data" placeholder="G-013,Nombre del producto,Categoría"></textarea><button class="btn btn-primary btn-block mt-1" onclick="importProducts()">Importar</button><div id="import-result" class="mt-1"></div></div>`; }

async function importProducts() {
  const text = $('csv-data').value.trim();
  if (!text) return alert('Pega los datos primero');
  const products = text.split('\n').filter(l=>l.trim()).map(l => { const p = l.split(',').map(s=>s.trim()); return { code: p[0]||'', name: p[1]||'', category: p[2]||'General' }; }).filter(p => p.name);
  if (!products.length) return alert('No hay productos válidos');
  try { const r = await api('/api/products/import', { method: 'POST', body: JSON.stringify({products}) }); $('import-result').innerHTML = `<div class="alert alert-success">✅ ${r.imported} importados</div>`; setTimeout(()=>switchAdminTab('products',document.querySelector('.admin-tabs .tab:nth-child(2)')),1500); } catch(e) { $('import-result').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

/* ADMIN SETTINGS */
async function renderAdminSettings() {
  try {
    const settings = await api('/api/settings');
    const email = settings.daily_report_email || '';
    $('admin-content').innerHTML = `
      <div class="admin-section"><h4>⚙️ Ajustes</h4>
        <div class="form-group"><label>📧 Correo del jefe (reporte diario)</label>
          <input type="email" id="set-email" value="${email}" placeholder="jefe@empresa.com" style="width:100%;padding:.75rem;border:2px solid var(--gray-200);border-radius:var(--radius);font-size:1rem">
        </div>
        <p class="text-sm text-muted mb-1">El reporte se envía automáticamente a las 7:00 AM (CDMX) con todos los faltantes pendientes.</p>
        <button class="btn btn-primary btn-block" onclick="saveEmailSettings()">💾 Guardar correo</button>
        ${email ? `<button class="btn btn-soft btn-block mt-1" onclick="sendTestReport()">📨 Enviar prueba ahora</button>` : ''}
        <div id="settings-result" class="mt-1"></div>
      </div>`;
  } catch (e) { $('admin-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function saveEmailSettings() {
  const email = $('set-email').value.trim();
  if (!email) return alert('Escribe un correo');
  const btn = document.querySelector('#admin-content .btn-primary');
  btn.disabled = true; btn.textContent = 'Guardando...';
  try {
    await api('/api/settings', { method: 'PUT', body: JSON.stringify({ daily_report_email: email }) });
    $('settings-result').innerHTML = '<div class="alert alert-success">✅ Guardado</div>';
    renderAdminSettings();
  } catch (e) { $('settings-result').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

async function sendTestReport() {
  const btn = document.querySelector('#admin-content .btn-soft');
  if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
  try {
    const r = await api('/api/cron/daily-report', { method: 'POST' });
    $('settings-result').innerHTML = `<div class="alert alert-success">✅ Enviado a ${r.sent_to}</div>`;
  } catch (e) { $('settings-result').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
  if (btn) { btn.disabled = false; btn.textContent = '📨 Enviar prueba ahora'; }
}

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  const t = localStorage.getItem('sgra_token');
  const u = localStorage.getItem('sgra_user');
  if (t && u) { state.token = t; state.user = JSON.parse(u); initApp().catch(() => handleLogout()); }
  else { showLogin(); }
  document.addEventListener('keydown', e => { if (e.key === 'Enter' && $('login-screen').style.display !== 'none') handleLogin(); if (e.key === 'Escape') closeModal('modal-overlay'); });
});

/* GLOBALS */
Object.assign(window, { handleLogin, handleLogout, switchTab, advance, showDetail, closeModal, openNewRequest, submitRequest, showModal, showModalContent, renderHistory, renderAdminPanel, switchAdminTab, createUser, deleteUser, renderAdminProducts, showAddProductForm, adminAddProduct, adminDeleteProduct, filterAdminProducts, renderAdminImport, renderAdminSettings, saveEmailSettings, sendTestReport, importProducts });
