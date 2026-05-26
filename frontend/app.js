const API = '';
let state = { user: null, token: null, requests: [], products: [], users: [] };
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

/* ---- AUTH ---- */
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display = 'none';
}
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'block';
}

async function handleLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const btn = document.querySelector('#login-screen .btn-primary');
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
  state.token = null;
  state.user = null;
  localStorage.removeItem('sgra_token');
  localStorage.removeItem('sgra_user');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  showLogin();
}

/* ---- INIT ---- */
async function initApp() {
  showApp();
  renderTopbar();
  await loadData();
}

async function loadData() {
  try {
    [state.requests, state.products] = await Promise.all([
      api('/api/requests'),
      api('/api/products'),
    ]);
    renderDashboard();
  } catch (e) {
    if (e.message.includes('Token') || e.message.includes('401')) {
      handleLogout();
    }
  }
}

/* ---- TOPBAR ---- */
function renderTopbar() {
  const el = document.getElementById('topbar');
  const roleLabel = state.user.role === 'admin' ? 'Admin' : 'Auxiliar';
  el.innerHTML = `
    <div class="topbar-left">
      <h2>SGRA</h2>
    </div>
    <div class="topbar-right">
      <span class="user-badge">${state.user.name}</span>
      <button class="btn btn-sm btn-ghost" style="color:white" onclick="showHistory()">Historial</button>
      <button class="btn btn-sm btn-ghost" style="color:white" onclick="showProducts()">Productos</button>
      <button class="btn btn-sm btn-ghost" style="color:white" onclick="handleLogout()">Salir</button>
    </div>
  `;
}

/* ---- DASHBOARD ---- */
function renderDashboard() {
  const container = document.getElementById('dashboard');
  const reportados = state.requests.filter(r => r.status === 'reportado');
  const solicitados = state.requests.filter(r => r.status === 'solicitado');
  const recibidos = state.requests.filter(r => r.status === 'recibido');

  const counts = {
    reportado: reportados.length,
    solicitado: solicitados.length,
    recibido: recibidos.length,
  };

  container.innerHTML = `
    <div class="tabs" id="tabs">
      <button class="tab ${currentTab === 'reportado' ? 'active' : ''}" onclick="switchTab('reportado')">
        Pendientes <span class="count">${reportados.length}</span>
      </button>
      <button class="tab ${currentTab === 'solicitado' ? 'active' : ''}" onclick="switchTab('solicitado')">
        Solicitados <span class="count">${solicitados.length}</span>
      </button>
      <button class="tab ${currentTab === 'recibido' ? 'active' : ''}" onclick="switchTab('recibido')">
        Recibidos <span class="count">${recibidos.length}</span>
      </button>
    </div>
    <div class="kanban" id="kanban">
      ${renderColumn('reportado', reportados)}
      ${renderColumn('solicitado', solicitados)}
      ${renderColumn('recibido', recibidos)}
    </div>
  `;

  // On mobile, show only active tab
  switchTab(currentTab);
}

function renderColumn(status, items) {
  const labels = { reportado: 'Por atender', solicitado: 'Solicitado a proveedor', recibido: 'Recibido' };
  const isActive = currentTab === status;
  return `
    <div class="kanban-col ${isActive ? '' : 'hidden'}" data-col="${status}">
      <div class="section-title">
        <span class="status-dot ${status}"></span>
        ${labels[status]}
        <span class="count" style="font-size:.75rem;background:var(--gray-200);padding:0 .375rem;border-radius:100px;margin-left:auto">${items.length}</span>
      </div>
      ${items.length === 0 ? `<div class="empty-state"><div>✓</div><p>No hay solicitudes aquí</p></div>` : ''}
      ${items.map(r => renderCard(r)).join('')}
    </div>
  `;
}

function renderCard(r) {
  const attentionClass = r.requires_attention ? 'attention' : '';
  const badgeClass = r.requires_attention ? 'badge-attention' : `badge-${r.status}`;
  const badgeText = r.requires_attention ? '⚠️ Requiere atención' : r.status.charAt(0).toUpperCase() + r.status.slice(1);

  let timeText = '';
  if (r.hours_elapsed < 1) timeText = 'Hace unos minutos';
  else if (r.hours_elapsed < 24) timeText = `Hace ${Math.floor(r.hours_elapsed)}h`;
  else timeText = `Hace ${Math.floor(r.hours_elapsed / 24)}d`;

  const canAdvance =
    (r.status === 'reportado') ||
    (r.status === 'solicitado');

  return `
    <div class="card ${r.status} ${attentionClass}" onclick="showDetail(${r.id})">
      <div class="card-header">
        <div class="card-title">${r.product_name}</div>
        <span class="card-badge ${badgeClass}">${badgeText}</span>
      </div>
      <div class="card-meta">
        <span>📦 ${r.quantity} uds</span>
        <span>👤 ${r.requester_name}</span>
        <span>⏱ ${timeText}</span>
      </div>
      ${r.note ? `<div style="font-size:.8125rem;color:var(--gray-500);margin-top:.375rem">📝 ${r.note}</div>` : ''}
      ${canAdvance ? `
        <div class="card-actions" onclick="event.stopPropagation()">
          ${r.status === 'reportado' ? `<button class="btn btn-sm btn-amber" onclick="advanceStatus(${r.id}, 'solicitado')">Solicitar</button>` : ''}
          ${r.status === 'solicitado' ? `<button class="btn btn-sm btn-green" onclick="advanceStatus(${r.id}, 'recibido')">Recibido</button>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.getAttribute('onclick')?.includes(tab)));
  document.querySelectorAll('.kanban-col').forEach(col => {
    col.classList.toggle('hidden', col.dataset.col !== tab);
  });
}

async function advanceStatus(id, status) {
  try {
    await api(`/api/requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
    await loadData();
  } catch (e) {
    alert(e.message);
  }
}

/* ---- DETAIL MODAL ---- */
async function showDetail(id) {
  const r = state.requests.find(req => req.id === id);
  if (!r) return;

  const canDelete = state.user.role === 'admin' || r.requested_by === state.user.id;
  const canAdvance =
    (r.status === 'reportado') ||
    (r.status === 'solicitado');

  document.getElementById('detail-modal').classList.add('open');
  document.getElementById('detail-content').innerHTML = `
    <div class="detail-field">
      <div class="detail-label">Producto</div>
      <div class="detail-value">${r.product_name}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Cantidad</div>
      <div class="detail-value">${r.quantity} uds</div>
    </div>
    ${r.note ? `
    <div class="detail-field">
      <div class="detail-label">Nota</div>
      <div class="detail-value">${r.note}</div>
    </div>` : ''}
    <div class="detail-field">
      <div class="detail-label">Reportado por</div>
      <div class="detail-value">${r.requester_name}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Estado</div>
      <div class="detail-value" style="text-transform:capitalize">${r.status}</div>
    </div>
    <div class="detail-field">
      <div class="detail-label">Tiempo transcurrido</div>
      <div class="detail-value">${r.hours_elapsed}h</div>
    </div>
    <div style="display:flex;gap:.5rem;margin-top:1rem;flex-wrap:wrap">
      ${canAdvance && r.status === 'reportado' ? `<button class="btn btn-amber flex-1" onclick="closeModal('detail-modal');advanceStatus(${r.id},'solicitado')">✅ Marcar como solicitado</button>` : ''}
      ${canAdvance && r.status === 'solicitado' ? `<button class="btn btn-green flex-1" onclick="closeModal('detail-modal');advanceStatus(${r.id},'recibido')">✅ Marcar como recibido</button>` : ''}
      ${canDelete ? `<button class="btn btn-danger btn-sm" onclick="closeModal('detail-modal');deleteRequest(${r.id})">🗑 Eliminar</button>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="closeModal('detail-modal')">Cerrar</button>
    </div>
  `;
}

async function deleteRequest(id) {
  if (!confirm('¿Eliminar esta solicitud?')) return;
  try {
    await api(`/api/requests/${id}`, { method: 'DELETE' });
    await loadData();
  } catch (e) {
    alert(e.message);
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

/* ---- NEW REQUEST ---- */
async function openNewRequest() {
  const products = await api('/api/products');
  const cats = {};
  products.forEach(p => {
    if (!cats[p.category]) cats[p.category] = [];
    cats[p.category].push(p);
  });

  let opts = '';
  for (const [cat, items] of Object.entries(cats)) {
    opts += `<optgroup label="${cat}">`;
    items.forEach(p => { opts += `<option value="${p.id}">${p.name}</option>`; });
    opts += '</optgroup>';
  }

  document.getElementById('modal-content').innerHTML = `
    <h3>Nuevo reporte de faltante</h3>
    <div class="form-group">
      <label>Producto</label>
      <select id="new-product">${opts}</select>
    </div>
    <div class="form-group">
      <label>Cantidad</label>
      <input type="number" id="new-qty" value="1" min="1" inputmode="numeric">
    </div>
    <div class="form-group">
      <label>Nota (opcional)</label>
      <textarea id="new-note" placeholder="Ej: urgente, se acaba mañana..."></textarea>
    </div>
    <button class="btn btn-primary btn-block" onclick="submitRequest()">Reportar faltante</button>
  `;
  document.getElementById('request-modal').classList.add('open');
}

async function submitRequest() {
  const productId = parseInt(document.getElementById('new-product').value);
  const qty = parseInt(document.getElementById('new-qty').value) || 1;
  const note = document.getElementById('new-note').value.trim();
  const btn = document.querySelector('#request-modal .btn-primary');
  btn.disabled = true; btn.textContent = 'Enviando...';

  try {
    await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, quantity: qty, note }),
    });
    closeModal('request-modal');
    await loadData();
  } catch (e) {
    alert(e.message);
  }
}

/* ---- HISTORY ---- */
function showHistory() {
  document.getElementById('request-modal').classList.add('open');
  document.getElementById('modal-content').innerHTML = '<div class="text-center" style="padding:2rem"><div class="spinner"></div><p class="mt-1">Cargando historial...</p></div>';

  api('/api/requests/history').then(history => {
    if (history.length === 0) {
      document.getElementById('modal-content').innerHTML = `
        <div class="modal-header"><h3>Historial</h3><button class="btn btn-ghost btn-sm" onclick="closeModal('request-modal')">Cerrar</button></div>
        <div class="empty-state"><div>📋</div><p>Aún no hay solicitudes completadas</p></div>
      `;
      return;
    }
    let html = `
      <div class="modal-header"><h3>Historial</h3><button class="btn btn-ghost btn-sm" onclick="closeModal('request-modal')">Cerrar</button></div>
      ${history.map(h => `
        <div class="history-item">
          <div class="info">
            <strong>${h.product_name}</strong>
            <small>${h.quantity} uds — ${h.requester_name}</small>
          </div>
          <div class="date">${h.completed_at ? new Date(h.completed_at).toLocaleDateString() : ''}</div>
        </div>
      `).join('')}
    `;
    document.getElementById('modal-content').innerHTML = html;
  }).catch(e => {
    document.getElementById('modal-content').innerHTML = `<div class="alert alert-error">Error: ${e.message}</div>`;
  });
}

/* ---- PRODUCTS ---- */
let showProductsCallback = null;

function showProducts() {
  document.getElementById('request-modal').classList.add('open');
  renderProductsPage();
}

async function renderProductsPage() {
  const isAdmin = state.user.role === 'admin';
  let html = `
    <div class="modal-header">
      <h3>Productos</h3>
      <div>
        ${isAdmin ? `<button class="btn btn-sm btn-primary" onclick="openAddProduct()">+ Agregar</button>` : ''}
        <button class="btn btn-sm btn-ghost" onclick="closeModal('request-modal')">Cerrar</button>
      </div>
    </div>
  `;

  try {
    const products = await api('/api/products');
    const cats = {};
    products.forEach(p => {
      if (!cats[p.category]) cats[p.category] = [];
      cats[p.category].push(p);
    });

    for (const [cat, items] of Object.entries(cats)) {
      html += `<div style="font-size:.75rem;font-weight:600;color:var(--gray-500);margin:.75rem 0 .375rem;text-transform:uppercase">${cat}</div>`;
      html += `<div class="products-grid">`;
      items.forEach(p => {
        html += `
          <div class="product-chip">
            <span>${p.name}</span>
            ${isAdmin ? `<button class="del" onclick="deleteProduct(${p.id})">×</button>` : ''}
          </div>
        `;
      });
      html += `</div>`;
    }

    if (products.length === 0) {
      html += `<div class="empty-state"><div>📦</div><p>No hay productos registrados</p></div>`;
    }
  } catch (e) {
    html += `<div class="alert alert-error">${e.message}</div>`;
  }

  document.getElementById('modal-content').innerHTML = html;
}

function openAddProduct() {
  document.getElementById('modal-content').innerHTML = `
    <h3>Agregar producto</h3>
    <div class="form-group">
      <label>Nombre del producto</label>
      <input type="text" id="new-prod-name" placeholder="Ej: Caja de 50 guantes talla M">
    </div>
    <div class="form-group">
      <label>Categoría</label>
      <input type="text" id="new-prod-cat" placeholder="Ej: Equipo protección">
    </div>
    <button class="btn btn-primary btn-block" onclick="submitProduct()">Guardar</button>
    <button class="btn btn-ghost btn-block mt-1" onclick="renderProductsPage()">Cancelar</button>
  `;
}

async function submitProduct() {
  const name = document.getElementById('new-prod-name').value.trim();
  const category = document.getElementById('new-prod-cat').value.trim() || 'General';
  if (!name) return alert('Ingresa el nombre del producto');

  try {
    await api('/api/products', {
      method: 'POST',
      body: JSON.stringify({ name, category }),
    });
    await renderProductsPage();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteProduct(id) {
  if (!confirm('¿Eliminar este producto?')) return;
  try {
    await api(`/api/products/${id}`, { method: 'DELETE' });
    await renderProductsPage();
  } catch (e) {
    alert(e.message);
  }
}

/* ---- INIT ON LOAD ---- */
document.addEventListener('DOMContentLoaded', () => {
  const savedToken = localStorage.getItem('sgra_token');
  const savedUser = localStorage.getItem('sgra_user');

  if (savedToken && savedUser) {
    state.token = savedToken;
    state.user = JSON.parse(savedUser);
    initApp().catch(() => {
      // If init fails (token expired), show login
      handleLogout();
    });
  } else {
    showLogin();
  }
});

// Global functions for onclick
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.switchTab = switchTab;
window.advanceStatus = advanceStatus;
window.showDetail = showDetail;
window.closeModal = closeModal;
window.openNewRequest = openNewRequest;
window.submitRequest = submitRequest;
window.showHistory = showHistory;
window.showProducts = showProducts;
window.openAddProduct = openAddProduct;
window.submitProduct = submitProduct;
window.deleteProduct = deleteProduct;

// Enter key on login
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && document.getElementById('login-screen').style.display !== 'none') {
    handleLogin();
  }
});
