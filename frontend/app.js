const API = '';
let state = { user: null, token: null, requests: [], products: [] };
let currentTab = 'reportado';
let searchTimeout = null;
let selectedProduct = null;

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
function showLoading() {
  $('loading-screen').style.display = 'flex';
  $('login-screen').style.display = 'none';
  $('app-screen').style.display = 'none';
}

function showLogin() {
  $('loading-screen').style.display = 'none';
  $('login-screen').style.display = 'flex';
  $('app-screen').style.display = 'none';
}

function showApp() {
  $('loading-screen').style.display = 'none';
  $('login-screen').style.display = 'none';
  $('app-screen').style.display = 'block';
}

async function handleLogin() {
  const username = $('login-user').value.trim();
  const password = $('login-pass').value;
  const btn = $('login-btn');
  btn.disabled = true; btn.textContent = 'Ingresando...';
  try {
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('sgra_token', data.token);
    localStorage.setItem('sgra_user', JSON.stringify(data.user));
    await initApp();
  } catch (e) {
    alert(e.message);
  }
  btn.disabled = false; btn.textContent = 'Ingresar';
}

async function handleLogout() {
  try { await api('/api/logout', { method: 'POST' }); } catch (_) {}
  state.token = null; state.user = null;
  localStorage.removeItem('sgra_token');
  localStorage.removeItem('sgra_user');
  $('login-user').value = '';
  $('login-pass').value = '';
  showLogin();
}

/* ===== INIT ===== */
async function initApp() {
  showApp();
  renderTopbar();
  await loadData();
}

async function loadData() {
  try {
    state.requests = await api('/api/requests');
    state.products = await api('/api/products');
    renderDashboard();
  } catch (e) {
    if (e.message.includes('Token') || e.message.includes('401')) handleLogout();
  }
}

/* ===== TOPBAR ===== */
function renderTopbar() {
  const el = $('topbar');
  const roleLabel = state.user.role === 'admin' ? 'Admin' : 'Auxiliar';
  el.innerHTML = `
    <div class="topbar-left">
      <h2>📦 SGRA</h2>
    </div>
    <div class="topbar-right">
      <span class="user-badge">${state.user.name}</span>
      <button class="btn btn-sm btn-ghost" style="color:white" onclick="showModal('Historial', renderHistory)">📋 Historial</button>
      ${state.user.role === 'admin' ? `<button class="btn btn-sm btn-ghost" style="color:white" onclick="showModal('Panel Admin', renderAdminPanel)">⚙️ Admin</button>` : ''}
      <button class="btn btn-sm btn-ghost" style="color:white" onclick="handleLogout()">🚪 Salir</button>
    </div>
  `;
}

/* ===== DASHBOARD ===== */
function renderDashboard() {
  const container = $('dashboard');
  const reportados = state.requests.filter(r => r.status === 'reportado');
  const solicitados = state.requests.filter(r => r.status === 'solicitado');
  const recibidos = state.requests.filter(r => r.status === 'recibido');

  container.innerHTML = `
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
  return `
    <div class="kanban-col ${currentTab === status ? '' : 'hidden'}" data-col="${status}">
      <div class="section-title">
        <span class="status-dot ${status}"></span> ${labels[status]}
        <span class="count">${items.length}</span>
      </div>
      ${items.length === 0 ? `<div class="empty-state"><div class="icon">✓</div><p>No hay solicitudes aquí</p></div>` : ''}
      ${items.map(r => renderCard(r)).join('')}
    </div>
  `;
}

function renderCard(r) {
  const attention = r.requires_attention ? 'attention' : '';
  const badgeCls = r.requires_attention ? 'badge-attention' : `badge-${r.status}`;
  const badgeText = r.requires_attention ? '⚠️ Requiere atención' : r.status.charAt(0).toUpperCase() + r.status.slice(1);
  let timeText = '';
  if (r.hours_elapsed < 1) timeText = 'Ahora';
  else if (r.hours_elapsed < 24) timeText = `Hace ${Math.floor(r.hours_elapsed)}h`;
  else timeText = `Hace ${Math.floor(r.hours_elapsed / 24)}d`;

  const hasNote = r.note && r.note.trim();
  return `
    <div class="card ${r.status} ${attention}" onclick="showDetail(${r.id})">
      <div class="card-header">
        <div>
          <div class="card-title">${r.product_name}</div>
          ${r.product_code ? `<div class="card-code">${r.product_code}</div>` : ''}
        </div>
        <span class="card-badge ${badgeCls}">${badgeText}</span>
      </div>
      <div class="card-meta">
        <span>📦 ${r.quantity} uds</span>
        <span>👤 ${r.requester_name}</span>
        <span>⏱ ${timeText}</span>
      </div>
      ${hasNote ? `<div style="font-size:.8125rem;color:var(--gray-500);margin-top:.5rem;padding-top:.5rem;border-top:1px solid var(--gray-100)">💬 ${r.note}</div>` : ''}
      <div class="card-actions" onclick="event.stopPropagation()">
        ${r.status === 'reportado' ? `<button class="btn btn-sm btn-amber" onclick="advance(${r.id},'solicitado')">📤 Solicitar</button>` : ''}
        ${r.status === 'solicitado' ? `<button class="btn btn-sm btn-green" onclick="advance(${r.id},'recibido')">✅ Recibido</button>` : ''}
      </div>
    </div>
  `;
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.textContent.includes(tab === 'reportado' ? 'Pendientes' : tab === 'solicitado' ? 'Solicitados' : 'Recibidos')));
  document.querySelectorAll('.kanban-col').forEach(c => c.classList.toggle('hidden', c.dataset.col !== tab));
}

async function advance(id, status) {
  try {
    await api(`/api/requests/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
    await loadData();
  } catch (e) { alert(e.message); }
}

/* ===== DETAIL MODAL ===== */
async function showDetail(id) {
  const r = state.requests.find(req => req.id === id);
  if (!r) return;
  const canDelete = state.user.role === 'admin' || r.requested_by === state.user.id;

  const statusIcons = { reportado: '⏳', solicitado: '📤', recibido: '✅' };
  let html = `
    <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:1.25rem">
      <div style="font-size:2rem">${statusIcons[r.status] || '📦'}</div>
      <div>
        <h3 style="margin:0">${r.product_name}</h3>
        ${r.product_code ? `<div style="font-size:.8125rem;color:var(--gray-400)">Código: ${r.product_code}</div>` : ''}
      </div>
    </div>
    <div class="detail-field"><div class="detail-label">Cantidad</div><div class="detail-value">${r.quantity} uds</div></div>
    ${r.note ? `<div class="detail-field"><div class="detail-label">Nota</div><div class="detail-value">${r.note}</div></div>` : ''}
    <div class="detail-field"><div class="detail-label">Reportado por</div><div class="detail-value">${r.requester_name}</div></div>
    <div class="detail-field"><div class="detail-label">Estado</div><div class="detail-value" style="text-transform:capitalize">${r.status}</div></div>
    <div class="detail-field"><div class="detail-label">Tiempo transcurrido</div><div class="detail-value">${r.hours_elapsed}h</div></div>
    <div style="display:flex;gap:.5rem;margin-top:1.25rem;flex-wrap:wrap">
      ${r.status === 'reportado' ? `<button class="btn btn-amber flex-1" onclick="closeModal('modal-overlay');advance(${r.id},'solicitado')">📤 Solicitar a proveedor</button>` : ''}
      ${r.status === 'solicitado' ? `<button class="btn btn-green flex-1" onclick="closeModal('modal-overlay');advance(${r.id},'recibido')">✅ Marcar como recibido</button>` : ''}
      ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="closeModal('modal-overlay');deleteReq(${r.id})">🗑 Eliminar</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-overlay')">Cerrar</button>
    </div>
  `;
  showModalContent('Detalle de solicitud', html);
}

async function deleteReq(id) {
  if (!confirm('¿Eliminar esta solicitud?')) return;
  try { await api(`/api/requests/${id}`, { method: 'DELETE' }); await loadData(); } catch (e) { alert(e.message); }
}

function closeModal(id) { document.getElementById(id).classList.remove('open'); }

/* ===== MODAL ===== */
function showModal(title, renderFn) {
  $('modal-overlay').classList.add('open');
  $('modal-inner').innerHTML = `<div class="text-center" style="padding:2rem"><div class="spinner"></div></div>`;
  setTimeout(() => {
    const content = renderFn();
    $('modal-inner').innerHTML = content;
  }, 50);
}

function showModalContent(title, html) {
  $('modal-overlay').classList.add('open');
  $('modal-inner').innerHTML = `<div class="modal-header"><h3>${title}</h3><button class="btn btn-ghost btn-sm" onclick="closeModal('modal-overlay')">✕</button></div>${html}`;
}

/* ===== NEW REQUEST ===== */
function openNewRequest() {
  selectedProduct = null;
  showModalContent('Nuevo reporte', `
    <div style="margin-bottom:1rem">
      <label class="form-group" style="margin-bottom:0">
        <label>Buscar producto por código o nombre</label>
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="search-input" placeholder="Escribe código o nombre..." autocomplete="off" oninput="onSearchInput()">
          <div class="search-results" id="search-results"></div>
        </div>
      </label>
    </div>
    <div id="selected-product-area"></div>
    <div class="form-group">
      <label>Cantidad</label>
      <input type="number" id="new-qty" value="1" min="1" inputmode="numeric">
    </div>
    <div class="form-group">
      <label>Nota (opcional)</label>
      <textarea id="new-note" placeholder="Ej: urgente, se acaba mañana..."></textarea>
    </div>
    <button class="btn btn-primary btn-block" id="submit-req-btn" onclick="submitRequest()" disabled>Reportar faltante</button>
  `);
  setTimeout(() => { const inp = $('search-input'); if (inp) inp.focus(); }, 300);
}

function onSearchInput() {
  clearTimeout(searchTimeout);
  const q = $('search-input').value.trim();
  if (q.length < 1) { $('search-results').classList.remove('show'); $('search-results').innerHTML = ''; return; }
  searchTimeout = setTimeout(async () => {
    try {
      const results = await api(`/api/products/search?q=${encodeURIComponent(q)}`);
      const container = $('search-results');
      if (results.length === 0) {
        container.innerHTML = `<div style="padding:.75rem;color:var(--gray-400);font-size:.875rem;text-align:center">Sin resultados</div>`;
      } else {
        container.innerHTML = results.map(p => `
          <div class="search-result-item" onclick="selectProduct(${p.id},'${p.code || ''}','${p.name.replace(/'/g,"\\'")}','${(p.category || '').replace(/'/g,"\\'")}')">
            ${p.code ? `<span class="item-code">${p.code}</span>` : ''}
            <span class="item-name">${p.name}</span>
            <span class="item-cat">${p.category || ''}</span>
          </div>
        `).join('');
      }
      container.classList.add('show');
    } catch (_) {}
  }, 200);
}

function selectProduct(id, code, name, category) {
  selectedProduct = { id, code, name };
  $('search-input').value = `${code ? code + ' - ' : ''}${name}`;
  $('search-results').classList.remove('show');
  $('selected-product-area').innerHTML = `
    <div class="selected-product-chip">
      <span class="code">${code || '—'}</span>
      <span class="name">${name}</span>
      <button class="remove" onclick="clearSelectedProduct()">×</button>
    </div>
  `;
  $('submit-req-btn').disabled = false;
}

function clearSelectedProduct() {
  selectedProduct = null;
  $('selected-product-area').innerHTML = '';
  $('search-input').value = '';
  $('submit-req-btn').disabled = true;
}

async function submitRequest() {
  if (!selectedProduct) return alert('Selecciona un producto');
  const qty = parseInt($('new-qty').value) || 1;
  const note = $('new-note').value.trim();
  const btn = $('submit-req-btn');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify({ product_id: selectedProduct.id, quantity: qty, note }),
    });
    closeModal('modal-overlay');
    await loadData();
  } catch (e) { alert(e.message); }
  btn.disabled = false; btn.textContent = 'Reportar faltante';
}

/* ===== HISTORY ===== */
function renderHistory() {
  api('/api/requests/history').then(history => {
    if (history.length === 0) {
      $('modal-inner').innerHTML = `<div class="modal-header"><h3>📋 Historial</h3><button class="btn btn-ghost btn-sm" onclick="closeModal('modal-overlay')">✕</button></div><div class="empty-state"><div class="icon">📋</div><p>Aún no hay solicitudes completadas</p></div>`;
      return;
    }
    let html = history.map(h => `
      <div class="history-item">
        <div class="info">
          <strong>${h.product_name}</strong>
          ${h.product_code ? `<span class="code">${h.product_code}</span>` : ''}
          <small>${h.quantity} uds — ${h.requester_name}</small>
        </div>
        <div class="date">${h.completed_at ? new Date(h.completed_at).toLocaleDateString() : ''}</div>
      </div>
    `).join('');
    $('modal-inner').innerHTML = `<div class="modal-header"><h3>📋 Historial (${history.length})</h3><button class="btn btn-ghost btn-sm" onclick="closeModal('modal-overlay')">✕</button></div>${html}`;
  }).catch(e => {
    $('modal-inner').innerHTML = `<div class="modal-header"><h3>📋 Historial</h3><button class="btn btn-ghost btn-sm" onclick="closeModal('modal-overlay')">✕</button></div><div class="alert alert-error">Error: ${e.message}</div>`;
  });
  return `<div class="text-center" style="padding:2rem"><div class="spinner"></div></div>`;
}

/* ===== ADMIN PANEL ===== */
function renderAdminPanel() {
  let adminTab = 'users';
  const html = `
    <div class="modal-header"><h3>⚙️ Panel de Administración</h3><button class="btn btn-ghost btn-sm" onclick="closeModal('modal-overlay')">✕</button></div>
    <div class="admin-panel-tabs">
      <button class="tab active" onclick="switchAdminTab('users',this)">👥 Usuarios</button>
      <button class="tab" onclick="switchAdminTab('products',this)">📦 Productos</button>
      <button class="tab" onclick="switchAdminTab('import',this)">📥 Importar</button>
    </div>
    <div id="admin-content"></div>
  `;
  setTimeout(() => { renderAdminUsers(); }, 50);
  return html;
}

function switchAdminTab(tab, btn) {
  document.querySelectorAll('.admin-panel-tabs .tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  if (tab === 'users') renderAdminUsers();
  else if (tab === 'products') renderAdminProducts();
  else if (tab === 'import') renderAdminImport();
}

/* ADMIN: USERS */
async function renderAdminUsers() {
  try {
    const users = await api('/api/users');
    const container = $('admin-content');
    let html = `
      <div class="admin-section">
        <h4>👥 Usuarios del sistema</h4>
        ${users.map(u => `
          <div class="user-row">
            <div class="info">
              <strong>${u.name}</strong>
              <small>@${u.username}</small>
            </div>
            <span class="role-badge ${u.role === 'admin' ? 'role-admin' : 'role-worker'}">${u.role === 'admin' ? 'Admin' : 'Auxiliar'}</span>
            ${state.user.id !== u.id ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">🗑</button>` : ''}
          </div>
        `).join('')}
      </div>
      <div class="admin-section">
        <h4>➕ Crear nuevo usuario</h4>
        <div class="form-group">
          <label>Nombre completo</label>
          <input type="text" id="new-user-name" placeholder="Ej: Luis Fernández">
        </div>
        <div class="form-group">
          <label>Usuario</label>
          <input type="text" id="new-user-username" placeholder="Ej: luis">
        </div>
        <div class="form-group">
          <label>Contraseña</label>
          <input type="text" id="new-user-pass" placeholder="Mínimo 4 caracteres">
        </div>
        <div class="form-group">
          <label>Rol</label>
          <select id="new-user-role">
            <option value="worker">Auxiliar</option>
            <option value="admin">Administrador</option>
          </select>
        </div>
        <button class="btn btn-primary btn-block" onclick="createUser()">Crear usuario</button>
      </div>
    `;
    container.innerHTML = html;
  } catch (e) {
    $('admin-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`;
  }
}

async function createUser() {
  const name = $('new-user-name').value.trim();
  const username = $('new-user-username').value.trim();
  const password = $('new-user-pass').value;
  const role = $('new-user-role').value;
  if (!name || !username || !password) return alert('Completa todos los campos');
  if (password.length < 4) return alert('La contraseña debe tener al menos 4 caracteres');
  try {
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ name, username, password, role }),
    });
    $('new-user-name').value = '';
    $('new-user-username').value = '';
    $('new-user-pass').value = '';
    renderAdminUsers();
  } catch (e) { alert(e.message); }
}

async function deleteUser(id) {
  if (!confirm('¿Eliminar este usuario? Las solicitudes hechas por él se mantendrán.')) return;
  try { await api(`/api/users/${id}`, { method: 'DELETE' }); renderAdminUsers(); } catch (e) { alert(e.message); }
}

/* ADMIN: PRODUCTS */
async function renderAdminProducts() {
  try {
    const products = await api('/api/products');
    const container = $('admin-content');
    const cats = {};
    products.forEach(p => {
      if (!cats[p.category]) cats[p.category] = [];
      cats[p.category].push(p);
    });
    let html = `
      <div class="admin-section" style="margin-bottom:1rem">
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.75rem;flex-wrap:wrap">
          <h4 style="margin:0">📦 Productos (${products.length})</h4>
          <button class="btn btn-sm btn-soft" onclick="showAddProductForm()">+ Agregar</button>
        </div>
        <div style="margin-bottom:.75rem">
          <input type="text" placeholder="Buscar producto..." style="width:100%;padding:.625rem .75rem;border:2px solid var(--gray-200);border-radius:var(--radius);font-size:.875rem" oninput="filterProductList(this.value)">
        </div>
        <div id="product-list">
    `;
    for (const [cat, items] of Object.entries(cats)) {
      html += `<div style="font-size:.6875rem;font-weight:700;color:var(--gray-400);margin:.75rem 0 .375rem;text-transform:uppercase;letter-spacing:.05em">${cat}</div>`;
      items.forEach(p => {
        html += `
          <div class="product-chip" data-name="${p.name.toLowerCase()}" data-code="${(p.code||'').toLowerCase()}">
            <div style="display:flex;align-items:center;gap:.5rem;flex:1;min-width:0">
              ${p.code ? `<span style="font-size:.6875rem;font-weight:700;background:var(--gray-100);color:var(--gray-600);padding:.125rem .5rem;border-radius:6px;white-space:nowrap">${p.code}</span>` : ''}
              <span style="font-size:.875rem;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.name}</span>
            </div>
            <button class="del" onclick="adminDeleteProduct(${p.id})">×</button>
          </div>
        `;
      });
    }
    html += `</div></div>`;
    container.innerHTML = html;
  } catch (e) { $('admin-content').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

function filterProductList(q) {
  q = q.toLowerCase();
  document.querySelectorAll('.product-chip').forEach(chip => {
    const name = chip.dataset.name || '';
    const code = chip.dataset.code || '';
    chip.style.display = (!q || name.includes(q) || code.includes(q)) ? 'flex' : 'none';
  });
}

function showAddProductForm() {
  showModalContent('Agregar producto', `
    <div class="form-group"><label>Código</label><input type="text" id="new-prod-code" placeholder="Ej: G-013"></div>
    <div class="form-group"><label>Nombre del producto</label><input type="text" id="new-prod-name" placeholder="Ej: Caja de 50 guantes talla M"></div>
    <div class="form-group"><label>Categoría</label><input type="text" id="new-prod-cat" placeholder="Ej: Equipo protección" value="General"></div>
    <button class="btn btn-primary btn-block" onclick="adminAddProduct()">Guardar</button>
    <button class="btn btn-ghost btn-block mt-1" onclick="closeModal('modal-overlay')">Cancelar</button>
  `);
}

async function adminAddProduct() {
  const code = $('new-prod-code').value.trim();
  const name = $('new-prod-name').value.trim();
  const category = $('new-prod-cat').value.trim() || 'General';
  if (!name) return alert('Ingresa el nombre del producto');
  try {
    await api('/api/products', { method: 'POST', body: JSON.stringify({ code, name, category }) });
    closeModal('modal-overlay');
    renderAdminProducts();
  } catch (e) { alert(e.message); }
}

async function adminDeleteProduct(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try { await api(`/api/products/${id}`, { method: 'DELETE' }); renderAdminProducts(); } catch (e) { alert(e.message); }
}

/* ADMIN: IMPORT */
function renderAdminImport() {
  $('admin-content').innerHTML = `
    <div class="admin-section">
      <h4>📥 Importar productos desde CSV</h4>
      <p class="text-sm text-muted mb-1">Pega el contenido del archivo CSV. Formato: <code>código,nombre,categoría</code> (uno por línea)</p>
      <div class="form-group">
        <label>Datos CSV</label>
        <textarea class="import-area" id="csv-data" placeholder="G-013,Caja de 50 guantes talla M,Equipo protección&#10;G-014,Cinta masking tape 24mm,Empaque"></textarea>
      </div>
      <button class="btn btn-primary btn-block" onclick="importProducts()">Importar productos</button>
      <div id="import-result" class="mt-1"></div>
    </div>
  `;
}

async function importProducts() {
  const csvText = $('csv-data').value.trim();
  if (!csvText) return alert('Pega los datos CSV primero');
  const lines = csvText.split('\n').filter(l => l.trim());
  const products = [];
  for (const line of lines) {
    const parts = line.split(',').map(s => s.trim());
    if (parts.length >= 2) {
      products.push({
        code: parts[0] || '',
        name: parts[1] || '',
        category: parts[2] || 'General',
      });
    }
  }
  if (products.length === 0) return alert('No se encontraron productos válidos');
  try {
    const result = await api('/api/products/import', {
      method: 'POST',
      body: JSON.stringify({ products }),
    });
    $('import-result').innerHTML = `<div class="alert alert-success">✅ ${result.imported} productos importados correctamente</div>`;
    setTimeout(() => { switchAdminTab('products', document.querySelector('.admin-panel-tabs .tab:nth-child(2)')); }, 1500);
  } catch (e) { $('import-result').innerHTML = `<div class="alert alert-error">${e.message}</div>`; }
}

/* Product chip style for admin list */
const style = document.createElement('style');
style.textContent = `
  .product-chip {
    display: flex; align-items: center; justify-content: space-between;
    background: white; padding: .625rem .75rem; margin-bottom: .375rem;
    border-radius: var(--radius); box-shadow: var(--shadow);
    font-size: .875rem; gap: .5rem;
  }
  .product-chip .del {
    background: none; border: none; color: var(--gray-400);
    cursor: pointer; font-size: 1.25rem; line-height: 1;
    padding: .125rem; flex-shrink: 0;
  }
  .product-chip .del:hover { color: var(--red); }
`;
document.head.appendChild(style);

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  const savedToken = localStorage.getItem('sgra_token');
  const savedUser = localStorage.getItem('sgra_user');
  if (savedToken && savedUser) {
    state.token = savedToken;
    state.user = JSON.parse(savedUser);
    initApp().catch(() => handleLogout());
  } else {
    showLogin();
  }
});

/* GLOBAL FUNCTIONS */
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.switchTab = switchTab;
window.advance = advance;
window.showDetail = showDetail;
window.closeModal = closeModal;
window.openNewRequest = openNewRequest;
window.submitRequest = submitRequest;
window.onSearchInput = onSearchInput;
window.selectProduct = selectProduct;
window.clearSelectedProduct = clearSelectedProduct;
window.showModal = showModal;
window.showModalContent = showModalContent;
window.renderHistory = renderHistory;
window.renderAdminPanel = renderAdminPanel;
window.switchAdminTab = switchAdminTab;
window.createUser = createUser;
window.deleteUser = deleteUser;
window.renderAdminProducts = renderAdminProducts;
window.showAddProductForm = showAddProductForm;
window.adminAddProduct = adminAddProduct;
window.adminDeleteProduct = adminDeleteProduct;
window.filterProductList = filterProductList;
window.renderAdminImport = renderAdminImport;
window.importProducts = importProducts;

/* Enter key on login */
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && $('login-screen').style.display !== 'none') {
    handleLogin();
  }
  if (e.key === 'Escape') {
    closeModal('modal-overlay');
    $('search-results').classList.remove('show');
  }
});
