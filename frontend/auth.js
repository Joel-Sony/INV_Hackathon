/**
 * MediScan — Auth helpers (shared across all pages)
 */
const API_BASE = 'http://localhost:5000';

function getToken() {
    return localStorage.getItem('mediscan_token');
}

function getUser() {
    const u = localStorage.getItem('mediscan_user');
    return u ? JSON.parse(u) : null;
}

function setAuth(token, user) {
    localStorage.setItem('mediscan_token', token);
    localStorage.setItem('mediscan_user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('mediscan_token');
    localStorage.removeItem('mediscan_user');
}

function authHeaders() {
    const t = getToken();
    return t ? { 'Authorization': 'Bearer ' + t } : {};
}

function requireAuth() {
    if (!getToken()) {
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

async function logout() {
    try {
        await fetch(API_BASE + '/auth/logout', { method: 'POST', headers: authHeaders() });
    } catch (e) { }
    clearAuth();
    window.location.href = 'login.html';
}
