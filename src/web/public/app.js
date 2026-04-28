let sessionToken = '';
let isShiftActive = false;
let playersData = [];
let currentModTab = 'me';
let currentServerTab = 'kills';
let lastModCallTimestamp = 0;

// DOM Elements
const elApp = document.getElementById('app');
const elLoader = document.getElementById('loader');
const elShiftDot = document.querySelector('.status-dot');
const elShiftText = document.getElementById('shiftStatusText');
const elBtnShift = document.getElementById('btnToggleShift');
const elPlayersList = document.getElementById('playersList');
const elNoPlayers = document.getElementById('noPlayers');
const elStatsPlayers = document.getElementById('statsPlayers');
const elSearchInput = document.getElementById('searchInput');
const elBtnBreak = document.getElementById('btnBreak');

// Init
window.addEventListener('DOMContentLoaded', async () => {
    // Check URL for token
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    
    if (tokenFromUrl) {
        localStorage.setItem('panelToken', tokenFromUrl);
        window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    sessionToken = localStorage.getItem('panelToken');
    
    if (!sessionToken) {
        showErrorAuth('Brak autoryzacji. Użyj komendy /panel na Discordzie.');
        return;
    }

    try {
        await authenticate();
        elLoader.style.display = 'none';
        elApp.style.display = 'block';
        
        loadPlayers();
        loadActiveModerators();
        loadModerationLogs();
        loadServerLogs();

        // Volume logic
        const savedVolume = localStorage.getItem('panelVolume');
        const notifySound = document.getElementById('notifySound');
        const volumeSlider = document.getElementById('volumeSlider');
        if (savedVolume !== null) {
            notifySound.volume = parseFloat(savedVolume);
            volumeSlider.value = savedVolume;
        }
        volumeSlider.addEventListener('input', (e) => {
            const vol = e.target.value;
            notifySound.volume = vol;
            localStorage.setItem('panelVolume', vol);
        });

        setInterval(loadPlayers, 120000); // 2 min auto-refresh
        setInterval(loadActiveModerators, 60000); // 1 min refresh mods
        setInterval(loadModerationLogs, 30000); // 30 sec mod logs
        setInterval(loadServerLogs, 15000); // 15 sec server logs
        
        // Heartbeat system (every 30s)
        setInterval(() => sendHeartbeat(), 30000);
        
        // Immediate heartbeat on tab focus
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') sendHeartbeat();
        });

    } catch (e) {
        showErrorAuth('Sesja wygasła lub jest nieprawidłowa.');
        localStorage.removeItem('panelToken');
    }
});

async function sendHeartbeat(retries = 1) {
    if (!sessionToken) return;
    try {
        await apiCall('/api/heartbeat', 'POST');
    } catch (e) {
        console.warn('Heartbeat failed, retrying...', e);
        if (retries > 0) setTimeout(() => sendHeartbeat(retries - 1), 5000);
    }
}

// Load Active Moderators
async function loadActiveModerators() {
    try {
        const mods = await apiCall('/api/moderators');
        renderModerators(mods);
    } catch (e) {
        console.error('Failed to load mods');
    }
}

function renderModerators(mods) {
    const list = document.getElementById('activeModeratorsList');
    if (!list) return;

    if (mods.length === 0) {
        list.innerHTML = '<p class="empty-mods">Nikt nie jest obecnie na służbie.</p>';
        return;
    }

    list.innerHTML = mods.map(m => `
        <div class="mod-item">
            <img src="${m.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="mod-avatar">
            <div class="mod-info">
                <span class="mod-name">${m.username}</span>
                <span class="mod-time">Służba od ${new Date(m.startTime).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
        </div>
    `).join('');
}

// API Helper
async function apiCall(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: {
            'Authorization': `Bearer ${sessionToken}`,
            'Content-Type': 'application/json'
        }
    };
    if (body) options.body = JSON.stringify(body);
    
    const res = await fetch(endpoint, options);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'API Error');
    }
    return res.json();
}

function showErrorAuth(msg) {
    elLoader.innerHTML = `<span style="font-size:3rem;margin-bottom:1rem">🚫</span><h3>Odmowa dostępu</h3><p>${msg}</p>`;
}

function showToast(msg, type = 'success') {
    const container = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `${type === 'success' ? '✅' : '❌'} ${msg}`;
    container.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}

// Authentication
async function authenticate() {
    const user = await apiCall('/api/me');
    document.getElementById('userName').textContent = user.username;
    if (user.avatar) {
        document.getElementById('userAvatar').src = user.avatar;
    }
    
    if (user.isOwner) {
        document.getElementById('devConsoleBtn').style.display = 'inline-block';
    }

    setShiftState(user.shiftActive, user.isOnBreak);
}

// Moderation Logs
async function loadModerationLogs() {
    try {
        const logs = await apiCall(`/api/logs/moderation?filter=${currentModTab}`);
        renderModLogs(logs);
    } catch (e) {
        console.error('Failed to load mod logs');
    }
}

function renderModLogs(logs) {
    const list = document.getElementById('modLogsList');
    if (!list) return;

    if (logs.length === 0) {
        list.innerHTML = '<p class="empty-state">Brak ostatnich akcji.</p>';
        return;
    }

    list.innerHTML = logs.map(log => {
        let typeEmoji = '📋';
        if (log.isPermBan) typeEmoji = '💀';
        else if (log.bannedUntil) typeEmoji = '⛓️';
        else if (log.unbannedAt) typeEmoji = '🔓';

        return `
            <div class="log-item">
                <div class="log-item-header">
                    <span class="log-type">${typeEmoji} ${log.bannedUntil ? 'TempBan' : (log.isPermBan ? 'PermBan' : 'Akcja')}</span>
                    <span class="log-time">${new Date(log.createdAt).toLocaleTimeString()}</span>
                </div>
                <div class="log-body">
                    Gracz: <strong>${log.playerNick}</strong><br>
                    Powód: <small>${log.reason}</small>
                </div>
                ${currentModTab === 'all' ? `<span class="log-mod">Mod: ${log.moderatorNick || 'System'}</span>` : ''}
            </div>
        `;
    }).join('');
}

window.switchModTab = (tab) => {
    currentModTab = tab;
    document.getElementById('tabModMe').classList.toggle('active', tab === 'me');
    document.getElementById('tabModAll').classList.toggle('active', tab === 'all');
    loadModerationLogs();
};

// Server Logs (Kill & Commands)
async function loadServerLogs() {
    try {
        const [kills, commands, modcalls] = await Promise.all([
            apiCall('/api/logs/server/kills'),
            apiCall('/api/logs/server/commands'),
            apiCall('/api/logs/server/modcalls')
        ]);
        renderKillLogs(kills);
        renderCommandLogs(commands);
        checkNewModCalls(modcalls);
    } catch (e) {
        console.error('Failed to load server logs');
    }
}

function checkNewModCalls(modcalls) {
    if (!modcalls || modcalls.length === 0) return;
    
    // Sort by timestamp asc to process in order
    const sorted = [...modcalls].sort((a, b) => a.Timestamp - b.Timestamp);
    
    // If it's the first load, just set the initial timestamp
    if (lastModCallTimestamp === 0) {
        lastModCallTimestamp = sorted[sorted.length - 1].Timestamp;
        return;
    }

    let foundNew = false;
    for (const call of sorted) {
        if (call.Timestamp > lastModCallTimestamp) {
            foundNew = true;
            lastModCallTimestamp = call.Timestamp;
            showToast(`🚨 WEZWANIE POMOCY: ${call.Caller}`, 'error');
        }
    }

    if (foundNew) {
        const sound = document.getElementById('notifySound');
        if (sound) {
            sound.currentTime = 0;
            sound.play().catch(e => console.warn('Browser blocked auto-play sound:', e));
        }
    }
}

function renderKillLogs(kills) {
    if (currentServerTab !== 'kills') return;
    const list = document.getElementById('serverLogsList');
    if (!list) return;

    const data = [...kills].reverse();
    list.innerHTML = data.map(k => `
        <div class="server-log-item">
            <span class="log-time">[${new Date(k.Timestamp * 1000).toLocaleTimeString()}]</span> 
            <strong>${k.Killer}</strong> ⚔️ ${k.Killed}
        </div>
    `).join('') || '<p class="empty-state">Brak danych.</p>';
}

function renderCommandLogs(commands) {
    if (currentServerTab !== 'commands') return;
    const list = document.getElementById('serverLogsList');
    if (!list) return;

    const data = [...commands].reverse();
    list.innerHTML = data.map(c => {
        const [nick] = c.Player.split(':');
        return `
            <div class="server-log-item">
                <span class="log-time">[${new Date(c.Timestamp * 1000).toLocaleTimeString()}]</span> 
                <strong>${nick}</strong>: <code>${c.Command}</code>
            </div>
        `;
    }).join('') || '<p class="empty-state">Brak danych.</p>';
}

window.switchServerTab = (tab) => {
    currentServerTab = tab;
    document.getElementById('tabSerKills').classList.toggle('active', tab === 'kills');
    document.getElementById('tabSerComs').classList.toggle('active', tab === 'commands');
    document.getElementById('serverLogsList').innerHTML = '<p class="empty-state">Ładowanie...</p>';
    loadServerLogs();
};

function setShiftState(active, onBreak = false) {
    isShiftActive = active;
    if (active) {
        elShiftDot.classList.add('active');
        elShiftDot.classList.toggle('break', onBreak);
        elShiftText.textContent = onBreak ? 'Na przerwie' : 'Służba Aktywna';
        elBtnShift.textContent = 'Zakończ Służbę';
        elBtnShift.className = 'btn btn-outline';
        
        elBtnBreak.style.display = 'inline-block';
        elBtnBreak.textContent = onBreak ? 'Wznów' : 'Przerwa';
        elBtnBreak.className = onBreak ? 'btn btn-primary' : 'btn btn-outline btn-break';
        
        // Disable/Enable action buttons based on break state
        document.querySelectorAll('.actions-col button').forEach(b => b.disabled = onBreak);
        document.querySelector('.btn-log')?.setAttribute('disabled', onBreak);
        if (onBreak) {
            document.querySelector('.btn-log')?.classList.add('disabled');
        } else {
            document.querySelector('.btn-log')?.classList.remove('disabled');
        }

    } else {
        elShiftDot.classList.remove('active', 'break');
        elShiftText.textContent = 'Brak służby';
        elBtnShift.textContent = 'Zacznij Służbę';
        elBtnShift.className = 'btn btn-primary';
        elBtnBreak.style.display = 'none';
        
        document.querySelectorAll('.actions-col button').forEach(b => b.disabled = true);
        document.querySelector('.btn-log')?.setAttribute('disabled', 'true');
    }
}

// Break Toggle
elBtnBreak.addEventListener('click', async () => {
    elBtnBreak.disabled = true;
    try {
        const res = await apiCall('/api/shift/break', 'POST');
        setShiftState(true, res.isOnBreak);
        showToast(res.isOnBreak ? 'Rozpoczęto przerwę. Akcje zablokowane.' : 'Wrócono z przerwy. Akcje odblokowane.');
    } catch(e) {
        showToast(e.message, 'error');
    }
    elBtnBreak.disabled = false;
});

// Shift Toggle
elBtnShift.addEventListener('click', async () => {
    elBtnShift.disabled = true;
    try {
        if (isShiftActive) {
            const res = await apiCall('/api/shift/stop', 'POST');
            setShiftState(false);
            showToast(`Służba zakończona. Czas pracy: ${res.duration} min.`);
        } else {
            await apiCall('/api/shift/start', 'POST');
            setShiftState(true);
            showToast('Rozpoczęto służbę!');
        }
    } catch(e) {
        showToast(e.message, 'error');
    }
    elBtnShift.disabled = false;
});

// Load Players
async function loadPlayers() {
    try {
        const btnRef = document.getElementById('btnRefresh');
        btnRef.style.transform = 'rotate(180deg)';
        setTimeout(() => btnRef.style.transform = 'rotate(0deg)', 500);

        playersData = await apiCall('/api/players');
        document.getElementById('lastRefreshTime').textContent = `Zaktualizowano: ${new Date().toLocaleTimeString('pl-PL')}`;
        elStatsPlayers.textContent = playersData.length;
        renderPlayers();
    } catch(e) {
        showToast('Nie udało się załadować graczy: ' + e.message, 'error');
    }
}

document.getElementById('btnRefresh').addEventListener('click', loadPlayers);

elSearchInput.addEventListener('input', renderPlayers);

function renderPlayers() {
    const query = elSearchInput.value.toLowerCase();
    const filtered = playersData.filter(p => p.nick.toLowerCase().includes(query));
    
    elPlayersList.innerHTML = '';
    
    if (filtered.length === 0) {
        elPlayersList.parentElement.style.display = 'none';
        elNoPlayers.style.display = 'block';
        return;
    }
    
    elPlayersList.parentElement.style.display = 'table';
    elNoPlayers.style.display = 'none';

    filtered.forEach(p => {
        const tr = document.createElement('tr');
        
        // Avatar element
        const avatarHtml = p.discordAvatar 
            ? `<img src="${p.discordAvatar}" class="mini-avatar" title="Połączone konto Discord">` 
            : `<div class="mini-avatar" title="Brak połączonego konta">👤</div>`;

        tr.innerHTML = `
            <td>
                <div class="player-cell">
                    ${avatarHtml}
                    <span>${p.nick}</span>
                </div>
            </td>
            <td><span class="role-badge">${p.permission}</span></td>
            <td class="actions-col">
                <div class="action-buttons">
                    <button class="btn btn-warn btn-sm" onclick="openActionModal('warn', '${p.nick}')">Warn</button>
                    <button class="btn btn-outline btn-sm" onclick="openActionModal('kick', '${p.nick}')">Kick</button>
                    <button class="btn btn-danger btn-sm" onclick="openActionModal('ban', '${p.nick}')">Ban</button>
                </div>
            </td>
        `;
        elPlayersList.appendChild(tr);
    });
}

// Modal Actions
const modal = document.getElementById('actionModal');
const mTitle = document.getElementById('modalTargetNick');
const mTarget = document.getElementById('modalTarget');
const mType = document.getElementById('modalType');
const mReason = document.getElementById('actionReason');
const mDurationGroup = document.getElementById('durationGroup');
const mDuration = document.getElementById('actionDuration');
const mBtn = document.getElementById('btnConfirmAction');

window.openActionModal = (type, targetNick) => {
    if (!isShiftActive && type !== 'log') {
        showToast('Musisz być na służbie, aby moderować!', 'error');
        return;
    }
    mType.value = type;
    mTarget.value = targetNick || '';
    mReason.value = '';
    mDuration.value = '';
    
    if (type === 'log') {
        document.getElementById('modalTitle').innerHTML = 'Utwórz <span class="highlight">Log Raport</span>';
        mDurationGroup.style.display = 'none';
        mBtn.textContent = 'Wyślij Log';
        mBtn.className = 'btn btn-primary';
    } else {
        document.getElementById('modalTitle').innerHTML = `Wykonaj: <span style="text-transform:uppercase">${type}</span> na <span class="highlight">${targetNick}</span>`;
        mDurationGroup.style.display = type === 'ban' ? 'block' : 'none';
        mBtn.textContent = `Potwierdź ${type}`;
        mBtn.className = type === 'ban' ? 'btn btn-danger' : (type === 'warn' ? 'btn btn-warn' : 'btn btn-outline');
    }
    
    modal.style.display = 'flex';
};

window.openLogModal = () => openActionModal('log', 'Ogólny');

window.closeModal = () => { modal.style.display = 'none'; };

document.getElementById('actionForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = mType.value;
    const targetNick = mTarget.value;
    const reason = mReason.value;
    const duration = mDuration.value;
    
    mBtn.disabled = true;
    mBtn.textContent = 'Wysyłanie...';

    try {
        await apiCall('/api/action', 'POST', { type, targetNick, reason, duration });
        showToast(`Akcja ${type.toUpperCase()} przebiegła pomyślnie.`);
        closeModal();
    } catch(err) {
        showToast(err.message, 'error');
    }
    
    mBtn.disabled = false;
});
