from pathlib import Path

p = Path('index.html')
s = p.read_text(encoding='utf-8')

def replace_between(text, start, end, replacement):
    a = text.find(start)
    if a < 0:
        raise SystemExit(f'Mangler start: {start}')
    b = text.find(end, a)
    if b < 0:
        raise SystemExit(f'Mangler slutt: {end}')
    return text[:a] + replacement + text[b:]

s = replace_between(
    s,
    '        function canModifyOrDelete(item) {',
    '        function canEditDetails(item) {',
    '''        function canModifyOrDelete(item) {\n            let role = getCurrentUserRole();\n            if (role === "Admin") return true;\n            let perms = getUserPermissions(getCurrentUser());\n            if (perms.fullAccess) return true;\n            if (perms.noAccess || !perms.deleteAnytime) return false;\n            return String(item.createdBy || "admin").toUpperCase() === String(getCurrentUser() || "").toUpperCase();\n        }\n\n'''
)

s = replace_between(
    s,
    '        function canEditDetails(item) {',
    '        function checkInputCardVisibility() {',
    '''        function canEditDetails(item) {\n            let role = getCurrentUserRole();\n            if (role === "Admin") return true;\n            let perms = getUserPermissions(getCurrentUser());\n            if (perms.fullAccess) return true;\n            if (perms.noAccess || !perms.editAnytime) return false;\n            return String(item.createdBy || "admin").toUpperCase() === String(getCurrentUser() || "").toUpperCase();\n        }\n\n'''
)

s = replace_between(
    s,
    '        function normType(str) {',
    '        // Qarash funksjoner',
    '''        function normType(str) {\n            return String(str || "")\n                .normalize("NFD")\n                .replace(/[\\u0300-\\u036f]/g, "")\n                .toUpperCase()\n                .replace(/[^A-Z0-9]/g, "");\n        }\n\n'''
)

s = replace_between(
    s,
    '        function getStockMap() {',
    '        function saveShamito() {',
    '''        function getStockMap() {\n            let lager = JSON.parse(localStorage.getItem("homar_lager") || "[]");\n            let shamito = JSON.parse(localStorage.getItem("homar_shamito") || "[]");\n            let stock = {};\n            lager.forEach(item => {\n                let t = String(item.type || "").toUpperCase();\n                stock[t] = (stock[t] || 0) + (Number(item.qty) || 0);\n            });\n            shamito.forEach(item => {\n                let t = String(item.type || "").toUpperCase();\n                if (stock[t] !== undefined) stock[t] -= (Number(item.qty) || 0);\n            });\n            return stock;\n        }\n\n'''
)

needle = "            return data;\n        }\n\n        function parseStored(key) {"
insert = """            return data;\n        }\n\n        window.homarApiRequest = apiRequest;\n\n        async function syncApiUsersToLocal() {\n            const current = JSON.parse(localStorage.getItem('homar_api_user') || '{}');\n            if (String(current.role || '').toUpperCase() !== 'ADMIN') return [];\n            const users = await apiRequest('/admin/users');\n            const permissionMap = {};\n            const localUsers = users.map(u => {\n                const username = String(u.username || '').toUpperCase();\n                permissionMap[username] = u.permissions || {};\n                return { id:u.id, username, password:'', role:u.role || 'Bruker', active:u.active !== false };\n            });\n            localStorage.setItem('homar_users', JSON.stringify(localUsers));\n            localStorage.setItem('homar_user_permissions', JSON.stringify(permissionMap));\n            return users;\n        }\n        window.syncApiUsersToLocal = syncApiUsersToLocal;\n\n        function parseStored(key) {"""
if needle not in s:
    raise SystemExit('Mangler API helper-punkt')
s = s.replace(needle, insert, 1)

s = replace_between(
    s,
    '        window.getUserPermissions = function () {',
    '        window.handleLogin = async function () {',
    '''        window.getUserPermissions = function (username) {\n            try {\n                const current = JSON.parse(localStorage.getItem('homar_api_user') || '{}');\n                const currentUsername = String(current.username || '').toUpperCase();\n                const targetUsername = String(username || currentUsername).toUpperCase();\n                if (targetUsername === 'ADMIN') {\n                    return { fullAccess:true, noAccess:false, canViewBudget:true, canRegister:true, canChangeStatus:true, editAnytime:true, deleteAnytime:true };\n                }\n                if (targetUsername === currentUsername && current.permissions) {\n                    const p = current.permissions || {};\n                    const fullAccess = !!p.fullAccess;\n                    const noAccess = fullAccess ? false : !!p.noAccess;\n                    return {\n                        fullAccess, noAccess,\n                        canViewBudget: fullAccess ? true : (noAccess ? false : !!p.canViewBudget),\n                        canRegister: fullAccess ? true : (noAccess ? false : !!p.canRegister),\n                        canChangeStatus: fullAccess ? true : (noAccess ? false : !!p.canChangeStatus),\n                        editAnytime: fullAccess ? true : (noAccess ? false : !!p.editAnytime),\n                        deleteAnytime: fullAccess ? true : (noAccess ? false : !!p.deleteAnytime)\n                    };\n                }\n                const all = JSON.parse(localStorage.getItem('homar_user_permissions') || '{}');\n                const p = all[targetUsername] || {};\n                const fullAccess = !!p.fullAccess;\n                const noAccess = fullAccess ? false : (p.noAccess !== undefined ? !!p.noAccess : true);\n                return {\n                    fullAccess, noAccess,\n                    canViewBudget: fullAccess ? true : (noAccess ? false : !!p.canViewBudget),\n                    canRegister: fullAccess ? true : (noAccess ? false : !!p.canRegister),\n                    canChangeStatus: fullAccess ? true : (noAccess ? false : !!p.canChangeStatus),\n                    editAnytime: fullAccess ? true : (noAccess ? false : !!p.editAnytime),\n                    deleteAnytime: fullAccess ? true : (noAccess ? false : !!p.deleteAnytime)\n                };\n            } catch (_) {\n                return { fullAccess:false, noAccess:true, canViewBudget:false, canRegister:false, canChangeStatus:false, editAnytime:false, deleteAnytime:false };\n            }\n        };\n\n'''
)

old_apply = """        function applyApiUser(user) {\n            nativeSetItem.call(localStorage, 'homar_api_user', JSON.stringify(user || {}));\n            nativeSetItem.call(localStorage, 'homar_current_user', String((user && user.username) || 'ADMIN').toLowerCase());\n            nativeSetItem.call(localStorage, 'homar_logged_in', 'true');\n        }"""
new_apply = """        function applyApiUser(user) {\n            const safeUser = user || {};\n            const username = String(safeUser.username || 'ADMIN').toUpperCase();\n            nativeSetItem.call(localStorage, 'homar_api_user', JSON.stringify(safeUser));\n            nativeSetItem.call(localStorage, 'homar_current_user', username);\n            nativeSetItem.call(localStorage, 'homar_logged_in', 'true');\n            if (safeUser.permissions) {\n                let all = {};\n                try { all = JSON.parse(localStorage.getItem('homar_user_permissions') || '{}'); } catch (_) {}\n                all[username] = safeUser.permissions;\n                nativeSetItem.call(localStorage, 'homar_user_permissions', JSON.stringify(all));\n            }\n        }"""
if old_apply in s:
    s = s.replace(old_apply, new_apply, 1)

s = replace_between(
    s,
    '        function saveUserPermissions() {',
    '        function saveRole() {',
    '''        async function saveUserPermissions() {\n            let username = document.getElementById("adminUserSelect").value;\n            if (String(username || "").toUpperCase() === "ADMIN") { alert("HOVEDADMINISTRATOR HAR ALLEREDE FULLE RETTIGHETER."); return; }\n            let fullAccess = document.getElementById("userPermFullAccess").checked;\n            let noAccess = document.getElementById("userPermNoAccess").checked;\n            let perms = {\n                fullAccess, noAccess,\n                canViewBudget: fullAccess ? true : (noAccess ? false : document.getElementById("userPermViewBudget").checked),\n                canRegister: fullAccess ? true : (noAccess ? false : document.getElementById("userPermRegister").checked),\n                canChangeStatus: fullAccess ? true : (noAccess ? false : document.getElementById("userPermStatus").checked),\n                editAnytime: fullAccess ? true : (noAccess ? false : document.getElementById("userPermEditAnytime").checked),\n                deleteAnytime: fullAccess ? true : (noAccess ? false : document.getElementById("userPermDeleteAnytime").checked)\n            };\n            let msg = document.getElementById("userPermMsg");\n            try {\n                const result = await window.homarApiRequest('/admin/users/' + encodeURIComponent(username) + '/permissions', { method:'PUT', body:JSON.stringify(perms) });\n                let all = JSON.parse(localStorage.getItem("homar_user_permissions") || "{}");\n                all[String(username).toUpperCase()] = result.permissions || perms;\n                localStorage.setItem("homar_user_permissions", JSON.stringify(all));\n                await window.syncApiUsersToLocal();\n                msg.style.color = "green";\n                msg.textContent = "TILGANGER LAGRET FOR " + String(username).toUpperCase() + "!";\n                loadAdminData();\n            } catch (err) {\n                msg.style.color = "red";\n                msg.textContent = "FEIL: " + (err.message || "KUNNE IKKE LAGRE TILGANGER");\n            }\n        }\n\n'''
)

s = replace_between(
    s,
    '        function saveUser() {',
    '        function editUser(username) {',
    '''        async function saveUser() {\n            if (getCurrentUserRole() !== "Admin") { alert("KUN ADMIN KAN ADMINISTRERE BRUKERE!"); return; }\n            let u = document.getElementById("newUsername").value.trim().toUpperCase();\n            let p = document.getElementById("newPassword").value;\n            let r = document.getElementById("newRole").value;\n            let editingUser = document.getElementById("editingUsername").value;\n            let msg = document.getElementById("adminMsg");\n            if (!u || (!editingUser && !p)) { msg.style.color = "red"; msg.textContent = "FYLL UT BRUKERNAVN OG PASSORD!"; return; }\n            try {\n                let payload = { username:u, role:r };\n                if (p) payload.password = p;\n                if (editingUser) await window.homarApiRequest('/admin/users/' + encodeURIComponent(editingUser), { method:'PUT', body:JSON.stringify(payload) });\n                else await window.homarApiRequest('/admin/users', { method:'POST', body:JSON.stringify(payload) });\n                await window.syncApiUsersToLocal();\n                document.getElementById("editingUsername").value = "";\n                document.getElementById("newUsername").value = "";\n                document.getElementById("newPassword").value = "";\n                document.getElementById("userFormTitle").textContent = "OPPRETT NY BRUKER";\n                document.getElementById("userSubmitBtn").textContent = "LEGG TIL";\n                msg.style.color = "green";\n                msg.textContent = editingUser ? "BRUKER OPPDATERT!" : "BRUKER OPPRETTET!";\n                loadAdminData();\n            } catch (err) {\n                msg.style.color = "red";\n                msg.textContent = "FEIL: " + (err.message || "KUNNE IKKE LAGRE BRUKER");\n            }\n        }\n\n'''
)

s = replace_between(
    s,
    '        function deleteUser(username) {',
    '        function loadAdminData() {',
    '''        async function deleteUser(username) {\n            if (getCurrentUserRole() !== "Admin") { alert("KUN ADMIN KAN SLETTE BRUKERE!"); return; }\n            if (String(username || "").toUpperCase() === "ADMIN") { alert("KAN IKKE SLETTE HOVEDADMINISTRATOR!"); return; }\n            if (!confirm(`VIL DU SLETTE BRUKER ${String(username).toUpperCase()}?`)) return;\n            try {\n                await window.homarApiRequest('/admin/users/' + encodeURIComponent(username), { method:'DELETE' });\n                await window.syncApiUsersToLocal();\n                loadAdminData();\n            } catch (err) {\n                alert("KUNNE IKKE SLETTE BRUKER: " + (err.message || "UKJENT FEIL"));\n            }\n        }\n\n'''
)

# Refresh the admin user list after a successful login and when reusing a valid token.
login_marker = '                await loadServerState();\n'
first = s.find(login_marker, s.find('window.handleLogin = async function'))
if first >= 0:
    s = s[:first] + "                await loadServerState();\n                if (String((result.user && result.user.role) || '').toUpperCase() === 'ADMIN') await syncApiUsersToLocal();\n" + s[first + len(login_marker):]

load_start = s.find("window.addEventListener('load'")
second = s.find(login_marker, load_start)
if second >= 0:
    s = s[:second] + "                await loadServerState();\n                if (String((me && me.role) || '').toUpperCase() === 'ADMIN') await syncApiUsersToLocal();\n" + s[second + len(login_marker):]

p.write_text(s, encoding='utf-8')
print('HOMAR frontend patched')
