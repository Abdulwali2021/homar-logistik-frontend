// HOMAR LOGISTIK - backend admin/user fix
(function () {
  'use strict';

  const API_BASE = window.HOMAR_API_BASE || 'https://homar-logistik.onrender.com/api';
  const ADMIN_PERMS = { fullAccess:true, noAccess:false, canViewBudget:true, canRegister:true, canChangeStatus:true, editAnytime:true, deleteAnytime:true };
  const NO_PERMS = { fullAccess:false, noAccess:true, canViewBudget:false, canRegister:false, canChangeStatus:false, editAnytime:false, deleteAnytime:false };
  let adminUsersCache = [];

  function token() { return localStorage.getItem('homar_api_token') || ''; }

  async function api(path, options = {}) {
    const headers = Object.assign({ 'Content-Type':'application/json' }, options.headers || {});
    const t = token();
    if (t) headers.Authorization = 'Bearer ' + t;
    const response = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
    let data = null;
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      const err = new Error((data && data.error) || ('HTTP ' + response.status));
      err.status = response.status;
      throw err;
    }
    return data;
  }

  function isAdmin() {
    try {
      const u = JSON.parse(localStorage.getItem('homar_api_user') || '{}');
      return String(u.role || '').toUpperCase() === 'ADMIN';
    } catch (_) { return false; }
  }

  function normalizePerms(p) {
    if (!p || typeof p !== 'object') return Object.assign({}, NO_PERMS);
    if (p.fullAccess) return Object.assign({}, ADMIN_PERMS);
    if (p.noAccess) return Object.assign({}, NO_PERMS);
    return {
      fullAccess:false,
      noAccess:false,
      canViewBudget:!!p.canViewBudget,
      canRegister:!!p.canRegister,
      canChangeStatus:!!p.canChangeStatus,
      editAnytime:!!p.editAnytime,
      deleteAnytime:!!p.deleteAnytime
    };
  }

  function cacheUsers(users) {
    adminUsersCache = Array.isArray(users) ? users : [];
    localStorage.setItem('homar_users', JSON.stringify(adminUsersCache.map(u => ({
      username:String(u.username || '').toUpperCase(),
      role:String(u.role || 'BRUKER').toUpperCase(),
      active:u.active !== false
    }))));

    const permissionMap = {};
    adminUsersCache.forEach(u => {
      permissionMap[String(u.username || '').toUpperCase()] = String(u.role || '').toUpperCase() === 'ADMIN' ? Object.assign({}, ADMIN_PERMS) : normalizePerms(u.permissions);
    });
    localStorage.setItem('homar_user_permissions', JSON.stringify(permissionMap));

    let roles = [];
    try { roles = JSON.parse(localStorage.getItem('homar_roles') || '[]'); } catch (_) {}
    if (!Array.isArray(roles)) roles = [];
    const roleSet = new Set(['ADMIN','BRUKER']);
    roles.forEach(r => roleSet.add(String(r || '').toUpperCase()));
    adminUsersCache.forEach(u => roleSet.add(String(u.role || 'BRUKER').toUpperCase()));
    localStorage.setItem('homar_roles', JSON.stringify(Array.from(roleSet)));
  }

  window.getUserPermissions = function(username) {
    const key = String(username || (window.getCurrentUser ? window.getCurrentUser() : '')).toUpperCase();
    const found = adminUsersCache.find(u => String(u.username || '').toUpperCase() === key);
    if (found) return String(found.role || '').toUpperCase() === 'ADMIN' ? Object.assign({}, ADMIN_PERMS) : normalizePerms(found.permissions);
    try {
      const current = JSON.parse(localStorage.getItem('homar_api_user') || '{}');
      if (String(current.username || '').toUpperCase() === key) {
        return String(current.role || '').toUpperCase() === 'ADMIN' ? Object.assign({}, ADMIN_PERMS) : normalizePerms(current.permissions);
      }
      const map = JSON.parse(localStorage.getItem('homar_user_permissions') || '{}');
      return normalizePerms(map[key]);
    } catch (_) { return Object.assign({}, NO_PERMS); }
  };

  window.loadAdminData = async function() {
    if (!isAdmin()) return;
    try {
      const users = await api('/admin/users');
      cacheUsers(users);
      const roles = JSON.parse(localStorage.getItem('homar_roles') || '["ADMIN","BRUKER"]');
      const roleSelect = document.getElementById('newRole');
      const adminUserSelect = document.getElementById('adminUserSelect');
      if (!roleSelect || !adminUserSelect) return;
      const selectedUser = adminUserSelect.value;
      roleSelect.innerHTML = '';
      adminUserSelect.innerHTML = '';

      roles.forEach(r => {
        const role = String(r || '').toUpperCase();
        if (role) roleSelect.innerHTML += `<option value="${role}">${role}</option>`;
      });
      users.forEach(u => {
        const username = String(u.username || '').toUpperCase();
        const role = String(u.role || '').toUpperCase();
        adminUserSelect.innerHTML += `<option value="${username}">${username} (${role})</option>`;
      });
      if (selectedUser && users.some(u => String(u.username).toUpperCase() === selectedUser.toUpperCase())) adminUserSelect.value = selectedUser.toUpperCase();
      if (typeof window.loadUserPermissions === 'function') window.loadUserPermissions();

      const overviewBody = document.getElementById('permissionsOverviewBody');
      if (overviewBody) {
        overviewBody.innerHTML = '';
        users.forEach(u => {
          const p = String(u.role || '').toUpperCase() === 'ADMIN' ? ADMIN_PERMS : normalizePerms(u.permissions);
          overviewBody.innerHTML += `<tr><td>${String(u.username || '').toUpperCase()}</td><td>${String(u.role || '').toUpperCase()}</td><td>${p.fullAccess?'JA':'NEI'}</td><td>${p.noAccess?'JA (KUN SE)':'NEI'}</td><td>${p.canViewBudget?'JA':'NEI'}</td><td>${p.canRegister?'JA':'NEI'}</td><td>${p.canChangeStatus?'JA':'NEI'}</td><td>${p.editAnytime?'JA':'NEI'}</td><td>${p.deleteAnytime?'JA':'NEI'}</td></tr>`;
        });
      }

      const usersBody = document.getElementById('usersBody');
      if (usersBody) {
        usersBody.innerHTML = '';
        users.forEach(u => {
          const username = String(u.username || '').toUpperCase();
          const protectedUser = username === 'ADMIN';
          usersBody.innerHTML += `<tr><td>${username}</td><td>${String(u.role || '').toUpperCase()}</td><td>${protectedUser ? 'BESKYTTET' : `<button style="background-color:#007bff;padding:4px 8px;font-size:12px;margin-right:5px;" onclick="editUser('${username}')">ENDRE</button><button style="background-color:#dc3545;padding:4px 8px;font-size:12px;" onclick="deleteUser('${username}')">SLETT</button>`}</td></tr>`;
        });
      }
    } catch (err) {
      console.error(err);
      const msg = document.getElementById('adminMsg');
      if (msg) { msg.style.color='red'; msg.textContent='KUNNE IKKE HENTE BRUKERE FRA SERVER: ' + err.message; }
    }
  };

  window.saveUserPermissions = async function() {
    if (!isAdmin()) return alert('KUN ADMIN KAN ENDRE TILGANGER!');
    const username = String(document.getElementById('adminUserSelect').value || '').toUpperCase();
    if (!username) return;
    if (username === 'ADMIN') return alert('HOVEDADMINISTRATOR HAR ALLEREDE FULLE RETTIGHETER.');
    const fullAccess = document.getElementById('userPermFullAccess').checked;
    const noAccess = document.getElementById('userPermNoAccess').checked;
    const perms = {
      fullAccess,
      noAccess,
      canViewBudget:fullAccess ? true : (noAccess ? false : document.getElementById('userPermViewBudget').checked),
      canRegister:fullAccess ? true : (noAccess ? false : document.getElementById('userPermRegister').checked),
      canChangeStatus:fullAccess ? true : (noAccess ? false : document.getElementById('userPermStatus').checked),
      editAnytime:fullAccess ? true : (noAccess ? false : document.getElementById('userPermEditAnytime').checked),
      deleteAnytime:fullAccess ? true : (noAccess ? false : document.getElementById('userPermDeleteAnytime').checked)
    };
    const msg = document.getElementById('userPermMsg');
    try {
      await api('/admin/users/' + encodeURIComponent(username) + '/permissions', { method:'PUT', body:JSON.stringify(perms) });
      if (msg) { msg.style.color='green'; msg.textContent='TILGANGER LAGRET PÅ SERVER FOR ' + username + '!'; }
      await window.loadAdminData();
    } catch (err) {
      if (msg) { msg.style.color='red'; msg.textContent='FEIL: ' + err.message; }
    }
  };

  window.saveUser = async function() {
    if (!isAdmin()) return alert('KUN ADMIN KAN ADMINISTRERE BRUKERE!');
    const username = String(document.getElementById('newUsername').value || '').trim().toUpperCase();
    const password = document.getElementById('newPassword').value || '';
    const role = String(document.getElementById('newRole').value || 'BRUKER').toUpperCase();
    const editingUser = String(document.getElementById('editingUsername').value || '').trim().toUpperCase();
    const msg = document.getElementById('adminMsg');
    if (!username || (!editingUser && !password)) {
      if (msg) { msg.style.color='red'; msg.textContent=editingUser?'SKRIV INN BRUKERNAVN!':'FYLL UT BRUKERNAVN OG PASSORD!'; }
      return;
    }
    try {
      if (editingUser) {
        const body = { username, role };
        if (password) body.password = password;
        await api('/admin/users/' + encodeURIComponent(editingUser), { method:'PUT', body:JSON.stringify(body) });
      } else {
        await api('/admin/users', { method:'POST', body:JSON.stringify({ username, password, role }) });
      }
      document.getElementById('editingUsername').value='';
      document.getElementById('newUsername').value='';
      document.getElementById('newPassword').value='';
      document.getElementById('userFormTitle').textContent='OPPRETT NY BRUKER';
      document.getElementById('userSubmitBtn').textContent='LEGG TIL';
      if (msg) { msg.style.color='green'; msg.textContent='BRUKER LAGRET PÅ SERVER!'; }
      await window.loadAdminData();
    } catch (err) {
      if (msg) { msg.style.color='red'; msg.textContent='FEIL: ' + err.message; }
    }
  };

  window.editUser = function(username) {
    if (!isAdmin()) return;
    const key = String(username || '').toUpperCase();
    const user = adminUsersCache.find(u => String(u.username || '').toUpperCase() === key);
    if (!user) return;
    document.getElementById('editingUsername').value=key;
    document.getElementById('newUsername').value=key;
    document.getElementById('newPassword').value='';
    document.getElementById('newPassword').placeholder='LA STÅ TOMT FOR Å BEHOLDE PASSORD';
    document.getElementById('newRole').value=String(user.role || 'BRUKER').toUpperCase();
    document.getElementById('userFormTitle').textContent='REDIGER BRUKER: ' + key;
    document.getElementById('userSubmitBtn').textContent='OPPDATER';
  };

  window.deleteUser = async function(username) {
    if (!isAdmin()) return alert('KUN ADMIN KAN SLETTE BRUKERE!');
    const key = String(username || '').toUpperCase();
    if (key === 'ADMIN') return alert('KAN IKKE SLETTE HOVEDADMINISTRATOR!');
    if (!confirm('VIL DU SLETTE BRUKER ' + key + '?')) return;
    try {
      await api('/admin/users/' + encodeURIComponent(key), { method:'DELETE' });
      await window.loadAdminData();
    } catch (err) { alert('KUNNE IKKE SLETTE BRUKER: ' + err.message); }
  };

  window.addEventListener('focus', async function() {
    if (!token()) return;
    try {
      const me = await api('/auth/me');
      localStorage.setItem('homar_api_user', JSON.stringify(me || {}));
      if (typeof window.checkAdminAccess === 'function') window.checkAdminAccess();
      if (typeof window.checkInputCardVisibility === 'function') window.checkInputCardVisibility();
    } catch (_) {}
  });
})();
