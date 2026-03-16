const socket = io({
  transports: ['websocket', 'polling'],
  upgrade: true,
  rememberUpgrade: true
});

socket.on('connect', () => {
  const statusEl = document.getElementById('conn-status');
  if (statusEl) {
    statusEl.textContent = 'Live';
    statusEl.style.background = 'var(--success)';
  }
});

socket.on('disconnect', () => {
  const statusEl = document.getElementById('conn-status');
  if (statusEl) {
    statusEl.textContent = 'Offline';
    statusEl.style.background = 'var(--danger)';
  }
});

// State
let currentUser = null; // { role: 'admin' | 'team' | 'viewer', id?: 't1' }
let appState = {
  teams: [],
  players: [],
  globalState: {
    activePlayerId: null,
    currentBid: 0,
    currentBidderId: null,
    timer: 0
  }
};
let currentTab = 'upcoming';
let currentRoleFilter = 'all';
let searchQuery = '';
let isAudioEnabled = true;

// Audio Effects
const soldSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3'); // Celebration/Tada sound

// AI Auctioneer Voice
function speak(text) {
  if (!isAudioEnabled) return; 
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel(); // Stop any pending speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    // Pick a good voice if available
    const voices = window.speechSynthesis.getVoices();
    const premiumVoice = voices.find(v => v.name.includes('Google') || v.name.includes('Premium') || v.name.includes('Male'));
    if (premiumVoice) utterance.voice = premiumVoice;
    
    window.speechSynthesis.speak(utterance);
  }
}

function formatMoney(lakhs) {
  if (lakhs >= 100) {
    const cr = lakhs / 100;
    return `₹${Number.isInteger(cr) ? cr : cr.toFixed(2)} Cr`;
  }
  return `₹${lakhs} L`;
}

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const roleSelect = document.getElementById('role');
const welcomeMsg = document.getElementById('welcome-msg');
const logoutBtn = document.getElementById('logout-btn');

const noActivePlayer = document.getElementById('no-active-player');
const activePlayerCard = document.getElementById('active-player-card');
const auctionControls = document.getElementById('auction-controls');
const adminControls = document.getElementById('admin-controls');
const teamControls = document.getElementById('team-controls');

const playersContainer = document.getElementById('players-container');
const teamsContainer = document.getElementById('teams-container');
const tabBtns = document.querySelectorAll('.tab-btn');

const adminAddPlayer = document.getElementById('admin-add-player');
const btnNewPlayer = document.getElementById('btn-new-player');
const playerModal = document.getElementById('player-modal');
const playerForm = document.getElementById('player-form');
const closeBtn = document.querySelector('.close-btn');

const squadModal = document.getElementById('squad-modal');
const squadTitle = document.getElementById('squad-title');
const squadSummary = document.getElementById('squad-stats-summary');
const squadPlayersList = document.getElementById('squad-players-list');
const btnEliminate = document.getElementById('btn-eliminate-team');
const closeSquadBtn = document.querySelector('.close-squad-btn');

// Sold Animation Elements
const soldOverlay = document.getElementById('sold-overlay');
const soldPlayerImg = document.getElementById('sold-player-img');
const soldPlayerName = document.getElementById('sold-player-name');
const soldTeamLogo = document.getElementById('sold-team-logo');
const soldTeamName = document.getElementById('sold-team-name');
const soldPrice = document.getElementById('sold-price');

// Leaderboard Elements
const leaderboardModal = document.getElementById('leaderboard-modal');
const leaderboardContainer = document.getElementById('leaderboard-container');
const closeLeaderboardBtn = document.querySelector('.close-leaderboard-btn');
const btnLeaderboard = document.getElementById('btn-leaderboard');
const btnRules = document.getElementById('btn-rules');
const rulesModal = document.getElementById('rules-modal');
const closeRulesBtn = document.querySelector('.close-rules-btn');

const btnAnalytics = document.getElementById('btn-analytics');
const analyticsModal = document.getElementById('analytics-modal');
const analyticsContainer = document.getElementById('analytics-container');
const closeAnalyticsBtn = document.querySelector('.close-analytics-btn');

const btnPasswords = document.getElementById('btn-passwords');
const passwordModal = document.getElementById('password-modal');
const passwordListContainer = document.getElementById('password-list-container');
const closePasswordBtn = document.querySelector('.close-password-btn');
const passwordVerifySection = document.getElementById('password-verify-section');
const adminVerifyPasswordInput = document.getElementById('admin-verify-password');
const btnVerifyAdmin = document.getElementById('btn-verify-admin');

let adminTeamsList = []; // Full team data with passwords (admin only)

// --- Initialization ---

// Wait for initial state to populate login dropdown
socket.on('initialState', (state) => {
  appState = state;
  if (state.globalState && state.globalState.isAudioEnabled !== undefined) {
    isAudioEnabled = state.globalState.isAudioEnabled;
    if (audioToggle) audioToggle.checked = isAudioEnabled;
  }
  populateLoginDropdown();
  if (appState.globalState && appState.globalState.timerEndTime) {
    startClientTimer(appState.globalState.timerEndTime);
  }
  if (currentUser) {
    renderApp();
  }
});

socket.on('adminTeamData', ({ teams }) => {
  // Always accept team data if sent by server (server should guard access)
  adminTeamsList = teams;
  if (passwordModal && !passwordModal.classList.contains('hidden')) {
    renderPasswordManager();
  }
});

socket.on('stateUpdate', (partialState) => {
  const oldBid = appState.globalState?.currentBid || 0;
  const oldBidderId = appState.globalState?.currentBidderId;

  appState = { ...appState, ...partialState };
  
  if (partialState.globalState && partialState.globalState.isAudioEnabled !== undefined) {
    isAudioEnabled = partialState.globalState.isAudioEnabled;
    if (audioToggle) audioToggle.checked = isAudioEnabled;
  }

  // Voice announcement for new bids
  if (appState.globalState.currentBid > oldBid && appState.globalState.currentBidderId !== oldBidderId) {
    const bidder = appState.teams.find(t => t.id === appState.globalState.currentBidderId);
    if (bidder) {
      speak(`${bidder.name} bids ${formatMoney(appState.globalState.currentBid)}`);
    }
  }

  if (appState.globalState && appState.globalState.timerEndTime) {
    startClientTimer(appState.globalState.timerEndTime);
  } else if (appState.globalState && !appState.globalState.timerEndTime) {
    if (clientTimerInterval) clearInterval(clientTimerInterval);
  }
  if (currentUser) {
    renderApp();
  }
});

socket.on('auctionError', (msg) => {
  alert('Auction Rule Warning: ' + msg);
});

socket.on('playerSold', (data) => {
  soldSound.play().catch(e => console.log("Sound play failed", e));
  speak(`${data.player.name} is SOLD to ${data.team.name} for ${formatMoney(data.price)}!`);
  showSoldAnimation(data);
});

let clientTimerInterval = null;
function startClientTimer(endTime) {
  if (clientTimerInterval) clearInterval(clientTimerInterval);
  updateTimerUI(endTime);
  clientTimerInterval = setInterval(() => updateTimerUI(endTime), 100);
}

function updateTimerUI(endTime) {
  const timerVal = document.getElementById('timer-value');
  if (!timerVal) return;

  const now = Date.now();
  const remaining = endTime ? Math.max(0, Math.ceil((endTime - now) / 1000)) : 0;
  
  // Only update if the value actually changed
  if (remaining !== parseInt(timerVal.textContent)) {
    // Prevent overwriting the "Bidding Ended" text if the timer finished
    if (remaining === 0 && timerVal.textContent === "Bidding Ended") return;

    timerVal.textContent = remaining > 0 ? remaining : "0";
    
    if (remaining <= 5 && remaining > 0) {
      timerVal.classList.add('timer-low');
    } else {
      timerVal.classList.remove('timer-low');
    }
    
    // Manage bidding buttons
    if (remaining === 0) {
       document.querySelectorAll('.btn-bid').forEach(btn => btn.disabled = true);
    } else {
       document.querySelectorAll('.btn-bid').forEach(btn => btn.disabled = false);
    }
  }
}

socket.on('timerUpdate', (data) => {
  const seconds = typeof data === 'object' ? data.seconds : data;
  const endTime = typeof data === 'object' ? data.endTime : null;

  appState.globalState.timer = seconds;
  appState.globalState.timerEndTime = endTime;

  if (endTime) {
    startClientTimer(endTime);
  } else {
    if (clientTimerInterval) clearInterval(clientTimerInterval);
    const timerVal = document.getElementById('timer-value');
    if (timerVal) timerVal.textContent = seconds || "0";
  }
});

socket.on('auctionTimeout', () => {
  if (clientTimerInterval) clearInterval(clientTimerInterval);
  document.querySelectorAll('.btn-bid').forEach(btn => btn.disabled = true);
  const timerVal = document.getElementById('timer-value');
  if (timerVal) {
    timerVal.textContent = "Bidding Ended";
    timerVal.classList.add('timer-low');
  }
  const auctionControlsDisplay = document.getElementById('team-controls');
  if (auctionControlsDisplay) {
    auctionControlsDisplay.style.opacity = '0.5';
    auctionControlsDisplay.style.pointerEvents = 'none';
  }
});

function populateLoginDropdown() {
  const rs = document.getElementById('role');
  if (!rs) return;
  
  let html = `<option value="" disabled selected>Select Role...</option>`;
  html += `<option value="admin">Auctioneer (Admin)</option>`;
  
  if (appState.teams && appState.teams.length > 0) {
    html += `<option disabled>--- Franchises ---</option>`;
    appState.teams.forEach(team => {
      html += `<option value="${team.id}">${team.name}</option>`;
    });
  }
  
  rs.innerHTML = html;
}

// --- Login & Logout ---
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pwd = document.getElementById('password').value;
  const roleVal = roleSelect.value;
  
  const loginData = {
    role: roleVal === 'admin' ? 'admin' : 'team',
    teamId: roleVal === 'admin' ? null : roleVal,
    password: pwd
  };

  socket.emit('login', loginData, (res) => {
    if (res.success) {
      currentUser = {
        role: res.role,
        id: res.teamId
      };

      loginScreen.classList.add('hidden');
      mainApp.classList.remove('hidden');

      if (currentUser.role === 'admin') {
        welcomeMsg.textContent = 'Welcome, AuctioneerDesk';
        document.body.classList.add('is-admin');
        document.body.classList.remove('is-team');
        document.documentElement.style.setProperty('--primary', '#d4af37');
        document.documentElement.style.setProperty('--primary-hover', '#ffd700');
      } else {
        const team = appState.teams.find(t => t.id === currentUser.id);
        welcomeMsg.textContent = `Franchise: ${team.name}`;
        document.body.classList.add('is-team');
        document.body.classList.remove('is-admin');
      }

      renderApp();
    } else {
      alert(res.message);
    }
  });
});

const playerSearchInput = document.getElementById('player-search');
if (playerSearchInput) {
  playerSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase();
    renderPlayersList();
  });
}

const audioToggle = document.getElementById('audio-toggle');
if (audioToggle) {
  audioToggle.addEventListener('change', (e) => {
    if (currentUser?.role !== 'admin') { // Only allow admin to change this
      // Revert if somehow triggered by non-admin (UI should hide it anyway)
      audioToggle.checked = isAudioEnabled;
      return;
    }
    const isEnabled = e.target.checked;
    isAudioEnabled = isEnabled; // Local update for snappiness
    socket.emit('toggleAudio', { isEnabled });
  });
}

logoutBtn.addEventListener('click', () => {
  currentUser = null;
  mainApp.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  document.getElementById('password').value = '';
});

// --- UI Rendering ---

function renderApp() {
  updateRoleCounts();
  renderLiveAuction();
  renderPlayersList();
  renderTeamsStats();

  // Show analytics button if any player is sold (Admin ONLY)
  const soldPlayers = appState.players.filter(p => p.status === 'sold');
  if (soldPlayers.length > 0 && currentUser?.role === 'admin') {
    btnAnalytics?.classList.remove('hidden');
  } else {
    btnAnalytics?.classList.add('hidden');
  }

  // Admin visibility toggles
  const adminAudioControl = document.getElementById('admin-audio-control');
  if (currentUser.role === 'admin') {
    adminAddPlayer.classList.remove('hidden');
    adminControls.classList.remove('hidden');
    teamControls.classList.add('hidden');
    if (adminAudioControl) adminAudioControl.classList.remove('hidden');
  } else {
    adminAddPlayer.classList.add('hidden');
    adminControls.classList.add('hidden');
    teamControls.classList.remove('hidden');
    if (adminAudioControl) adminAudioControl.classList.add('hidden');
  }
}

function renderLiveAuction() {
  const { activePlayerId, currentBid, currentBidderId, timer } = appState.globalState;
  
  if (!activePlayerId) {
    noActivePlayer.classList.remove('hidden');
    activePlayerCard.classList.add('hidden');
    auctionControls.classList.add('hidden');
    return;
  }

  noActivePlayer.classList.add('hidden');
  activePlayerCard.classList.remove('hidden');
  auctionControls.classList.remove('hidden');

  const player = appState.players.find(p => p.id === activePlayerId);
  const bidder = currentBidderId ? appState.teams.find(t => t.id === currentBidderId)?.name : 'No bids yet';
  const img = player.img || 'https://images2.imgbox.com/6c/d2/8I1zS2mY_o.png'; // High-res generic placeholder
  
  const stats = player.stats || {};

  const getStat = (val) => (val === undefined || val === null || val === '') ? '-' : val;

  const batStats = `
    <div class="stat-box"><div class="stat-value">${getStat(stats.runs)}</div><div class="stat-label">Runs</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.average)}</div><div class="stat-label">Avg</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.strikeRate)}</div><div class="stat-label">S/R</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.matches)}</div><div class="stat-label">Matches</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.hs)}</div><div class="stat-label">HS</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.fiftiesHundreds)}</div><div class="stat-label">50s/100s</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.fours)}</div><div class="stat-label">4s</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.sixes)}</div><div class="stat-label">6s</div></div>
  `;

  const bowlStats = `
    <div class="stat-box"><div class="stat-value">${getStat(stats.wickets)}</div><div class="stat-label">Wickets</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.economy)}</div><div class="stat-label">Econ</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.average || stats.bowlAvg)}</div><div class="stat-label">Avg</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.bowlMatches)}</div><div class="stat-label">Matches</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.bbi)}</div><div class="stat-label">BBI</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.maidens)}</div><div class="stat-label">Maidens</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.fourFive)}</div><div class="stat-label">4w/5w</div></div>
  `;

  const fieldStats = (stats.catches || stats.stumpings) ? `
    <div class="stat-box"><div class="stat-value">${getStat(stats.catches)}</div><div class="stat-label">Catches</div></div>
    <div class="stat-box"><div class="stat-value">${getStat(stats.stumpings)}</div><div class="stat-label">Stumpings</div></div>
  ` : '';

  if (player.role === 'Batter') {
    roleStatsHtml = `<div class="player-stats-grid">${batStats}</div>`;
  } else if (player.role === 'Bowler') {
    roleStatsHtml = `<div class="player-stats-grid">${bowlStats}</div>`;
  } else if (player.role === 'Wicketkeeper' || player.role === 'Wicketkeeper-Batsman') {
    roleStatsHtml = `
      <div class="player-stats-grid">${batStats}</div>
      <div class="player-stats-grid" style="margin-top:5px;">${fieldStats}</div>
    `;
  } else {
    // All-rounder
    roleStatsHtml = `
      <div class="player-stats-grid">${batStats}</div>
      <div class="player-stats-grid" style="margin-top:5px;">${bowlStats}</div>
    `;
  }

  activePlayerCard.innerHTML = `
    ${player.jerseyNumber ? `<div class="jersey-badge" title="Jersey #${player.jerseyNumber}">${player.jerseyNumber}</div>` : ''}
    <div class="bid-timer-container">
       <span class="timer-label">TIME REMAINING</span>
       <span class="timer-value ${timer <= 10 ? 'timer-low' : ''}" id="timer-value">${timer}</span>
    </div>
    <img src="${img}" alt="${player.name}" class="player-img">
    <div class="player-info">
      <div class="player-name">${player.name} ${player.isOverseas ? '✈️' : ''}</div>
      <div class="player-role">${player.role} <span style="font-size: 0.7rem; color: var(--primary); margin-left: 5px;">
        (${player.hasIplExp ? 'IPL Stats' : (player.isOverseas ? 'Intl T20' : 'Domestic T20')})
      </span></div>

      ${roleStatsHtml}

      <div class="bid-details">
         <div class="text-muted">Current Bid</div>
         <div class="current-bid">${formatMoney(currentBid)}</div>
         <div class="current-bidder">${bidder}</div>
      </div>
    </div>
  `;

  if (appState.globalState.timerEndTime) {
    updateTimerUI(appState.globalState.timerEndTime);
  }

  // Re-enable bidding UI for teams when a new player is set
  const teamControlsDisplay = document.getElementById('team-controls');
  if (teamControlsDisplay) {
    teamControlsDisplay.style.opacity = '1';
    teamControlsDisplay.style.pointerEvents = 'auto';
    
    // Use fixed increments
    const bidBtns = document.querySelectorAll('.btn-bid');
    const fixedIncrements = [10, 20, 50, 100];
    
    bidBtns.forEach((btn, idx) => {
      const inc = fixedIncrements[idx];
      btn.dataset.amount = inc;
      btn.textContent = `+ ${formatMoney(inc)}`;
    });
  }
  document.querySelectorAll('.btn-bid').forEach(btn => btn.disabled = false);
}

function renderPlayersList() {
  playersContainer.innerHTML = '';
  let filtered = appState.players.filter(p => p.status === currentTab);

  if (currentRoleFilter !== 'all') {
    filtered = filtered.filter(p => {
      if (currentRoleFilter === 'Wicketkeeper-Batsman') {
        return p.role === 'Wicketkeeper-Batsman' || p.role === 'Wicketkeeper';
      }
      if (currentRoleFilter === 'Overseas') {
        return p.isOverseas === true;
      }
      if (currentRoleFilter === 'Domestic') {
        return p.isOverseas !== true;
      }
      return p.role === currentRoleFilter;
    });
  }

  if (searchQuery) {
    filtered = filtered.filter(p => p.name.toLowerCase().includes(searchQuery));
  }

  if (filtered.length === 0) {
    playersContainer.innerHTML = `<div class="text-muted" style="padding:20px;text-align:center;">No players matches this filter or search.</div>`;
    return;
  }

  let html = '';
  filtered.forEach(p => {
    let rightSide = `<div class="p-list-price">${formatMoney(p.status === 'sold' ? p.finalPrice : p.basePrice)}</div>`;
    if (p.status === 'sold') {
      const team = appState.teams.find(t => t.id === p.team);
      rightSide = `
        <div style="text-align:right">
           <div class="p-list-price">${formatMoney(p.finalPrice)}</div>
           <div style="font-size:0.8rem; color:#94a3b8;">${team?.name.split(' ')[0] || 'Unknown'}</div>
        </div>
      `;
    }

    let adminAction = '';
    if (currentUser.role === 'admin') {
      if (p.status === 'upcoming') {
        adminAction += `<button class="btn-outline" style="font-size:0.75rem; padding: 4px 8px; margin-left: 10px;" onclick="startAuction('${p.id}')">Start</button>`;
      }
      adminAction += `<button class="btn-secondary" style="font-size:0.75rem; padding: 4px 8px; margin-left: 5px;" onclick="editPlayer('${p.id}')">Edit</button>`;
      adminAction += `<button class="btn-danger" style="font-size:0.75rem; padding: 4px 8px; margin-left: 5px;" onclick="deletePlayer('${p.id}')">Delete</button>`;
    }

    const img = p.img || 'https://images2.imgbox.com/6c/d2/8I1zS2mY_o.png'; 
    
    html += `
      <div class="list-item ${p.status === 'sold' ? 'sold-item' : ''}">
        <div class="p-list-left">
           <div class="p-list-img-container">
             <img src="${img}" class="p-list-avatar" loading="lazy">
             ${p.jerseyNumber ? `<div class="p-list-jersey">${p.jerseyNumber}</div>` : ''}
           </div>
           <div class="p-list-info">
              <span class="p-list-name">${p.name} ${p.isOverseas ? '✈️' : ''}</span>
              <span class="p-list-role">${p.role}</span>
           </div>
        </div>
        <div style="display:flex;align-items:center; gap: 5px;">
           ${rightSide}
           ${adminAction}
        </div>
      </div>
    `;
  });
  playersContainer.innerHTML = html;
}

function renderTeamsStats() {
  let html = '';
  const sortedTeams = [...appState.teams].sort((a, b) => b.budget - a.budget);

  sortedTeams.forEach(t => {
    const isMe = currentUser?.id === t.id;
    const STARTING_BUDGET = 10000;
    const spent = STARTING_BUDGET - t.budget;
    const pctSpent = ((spent / STARTING_BUDGET) * 100).toFixed(1);
    const isOver75 = pctSpent >= 75;

    let overseasCount = t.players.filter(pid => {
      let plt = appState.players.find(x => x.id === pid);
      return plt && plt.isOverseas;
    }).length;

    html += `
      <div class="list-item ${t.isEliminated ? 'is-eliminated' : ''}" style="${isMe ? 'border-color: var(--primary); background: rgba(59,130,246,0.1);' : ''}">
         ${t.isEliminated ? '<div class="eliminated-badge">ELIMINATED</div>' : ''}
         <div class="team-item w-100" style="width: 100%;">
            <div class="team-top" style="display: flex; align-items: center; justify-content: space-between;">
               <div style="display: flex; align-items: center; gap: 10px;">
                  ${t.logo ? `<img src="${t.logo}" alt="${t.name}" style="width: 25px; height: 25px; object-fit: contain;" loading="lazy">` : ''}
                  <span class="team-name">${t.name} ${isMe ? '<span style="color:var(--primary);font-size:0.8rem;">(You)</span>' : ''}</span>
               </div>
               <span class="team-budget">${formatMoney(t.budget)}</span>
            </div>
            <div class="team-stats">
               <span style="font-weight:600; color:${isOver75 ? 'var(--success)' : 'var(--danger)'}">Spent: ${pctSpent}%</span> | 
               Roster: ${t.players.length}/25 | 
               Overseas: ${overseasCount}/8
            </div>
            <div style="display:flex; gap:10px; align-self:flex-end;">
               ${(currentUser.role === 'admin' || isMe) ? 
                 `<button class="btn-outline btn-view-squad" onclick="viewSquad('${t.id}')">View Squad</button>` : 
                 ''
               }
               ${(currentUser.role === 'admin') ? 
                 `<button class="btn-danger" style="font-size:0.7rem; padding: 4px 8px; margin-top:10px;" onclick="toggleEliminate('${t.id}')">${t.isEliminated ? 'Restore' : 'Eliminate'}</button>` : 
                 ''
               }
            </div>
         </div>
      </div>
    `;
  });
  teamsContainer.innerHTML = html;
}

function updateRoleCounts() {
  const playersInTab = appState.players.filter(p => p.status === currentTab);
  
  const counts = {
    all: playersInTab.length,
    Batter: 0,
    Bowler: 0,
    'All-rounder': 0,
    'Wicketkeeper-Batsman': 0,
    'Overseas': 0,
    'Domestic': 0
  };

  playersInTab.forEach(p => {
    if (p.isOverseas) {
      counts['Overseas']++;
    } else {
      counts['Domestic']++;
    }
    
    if (p.role === 'Wicketkeeper') {
      counts['Wicketkeeper-Batsman']++;
    } else if (counts[p.role] !== undefined) {
      counts[p.role]++;
    }
  });

  Object.keys(counts).forEach(role => {
    const countEl = document.getElementById(`count-${role}`);
    if (countEl) countEl.textContent = counts[role];
  });
}

// --- Interactions ---

// Tabs
tabBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    tabBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentTab = e.target.dataset.tab;
    renderPlayersList();
  });
});

// Admin: Start Auction
window.startAuction = function(playerId) {
  if (appState.globalState.activePlayerId) {
    alert("An auction is already active. Mark it sold or unsold first.");
    return;
  }
  socket.emit('setActivePlayer', { playerId });
};

// Admin: Accelerated Round
const btnAccelerated = document.getElementById('btn-accelerated');
if (btnAccelerated) {
  btnAccelerated.addEventListener('click', () => {
    if (confirm("Move all unsold players back to upcoming for an accelerated round?")) {
      socket.emit('acceleratedRound');
    }
  });
}

// Role Filters Listener
document.querySelectorAll('.filter-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentRoleFilter = chip.dataset.role;
    renderPlayersList();
  });
});

// Admin Modal Logic for Dynamic Stats Labels
const pOverseasCheckbox = document.getElementById('p-overseas');
const pIplExpCheckbox = document.getElementById('p-ipl-exp');
const labelBat = document.getElementById('label-bat-stats');
const labelBowl = document.getElementById('label-bowl-stats');
const labelWk = document.getElementById('label-wk-stats');

function updateModalLabels() {
  const isOverseas = pOverseasCheckbox.checked;
  const hasIplExp = pIplExpCheckbox.checked;
  if (!labelBat || !labelBowl || !labelWk) return;
  
  if (hasIplExp) {
    // Any player with IPL experience shows IPL labels
    labelBat.textContent = "IPL Batting Statistics";
    labelBowl.textContent = "IPL Bowling Statistics";
    labelWk.textContent = "IPL Wicketkeeping Statistics";
  } else if (isOverseas) {
    // Overseas without IPL exp
    labelBat.textContent = "International T20 Batting Records";
    labelBowl.textContent = "International T20 Bowling Records";
    labelWk.textContent = "International T20 Keeping Records";
  } else {
    // Domestic Indian player
    labelBat.textContent = "Domestic T20 Stats (Syed Mushtaq Ali/Ranji)";
    labelBowl.textContent = "Domestic T20 Stats (Vijay Hazare/Ranji)";
    labelWk.textContent = "Domestic Wicketkeeping Stats";
  }
}

if (pOverseasCheckbox) {
  pOverseasCheckbox.addEventListener('change', updateModalLabels);
}
if (pIplExpCheckbox) {
  pIplExpCheckbox.addEventListener('change', updateModalLabels);
}

// Admin: Undo Action
const btnUndo = document.getElementById('btn-undo');
if (btnUndo) {
  btnUndo.addEventListener('click', () => {
    if (confirm("Revert the last significant auction action? This will undo the last Sold/Unsold/Start action.")) {
      socket.emit('undoAction');
    }
  });
}

window.toggleEliminate = function(teamId) {
  const team = appState.teams.find(t => t.id === teamId);
  if (!team) return;
  const action = team.isEliminated ? 'restore' : 'eliminate';
  if (confirm(`Are you sure you want to ${action} ${team.name}?`)) {
    socket.emit('toggleEliminateTeam', { teamId });
  }
};

// Admin: Leaderboard
if (btnLeaderboard) {
  btnLeaderboard.addEventListener('click', () => {
    calculateAndShowLeaderboard();
  });
}

function calculateAndShowLeaderboard() {
  const teamsData = appState.teams.map(team => {
    const squad = appState.players.filter(p => p.team === team.id);
    
    // --- Points Calculation Logic (Leaderboard 2.0) ---
    let performanceScore = 0;
    let strategyScore = 0;
    let specialistBonuses = 0;
    
    const counts = { Batter: 0, Bowler: 0, AllRounder: 0, Wicketkeeper: 0, Overseas: 0 };

    squad.forEach(p => {
      // 1. Role Counting
      const role = p.role.replace('-', '').replace(' ', '');
      if (role.includes('Batter')) counts.Batter++;
      if (role.includes('Bowler')) counts.Bowler++;
      if (role.includes('All')) counts.AllRounder++;
      if (role.includes('keeper')) counts.Wicketkeeper++;
      if (p.isOverseas) counts.Overseas++;

      // 2. Performance Points (Stats-based)
      const stats = p.stats || {};
      const runs = parseFloat(stats.runs) || 0;
      const wickets = parseFloat(stats.wickets) || 0;
      const matches = parseFloat(stats.matches) || 0;
      const sr = parseFloat(stats.strikeRate) || 0;
      const avg = parseFloat(stats.average) || 0;
      const econ = parseFloat(stats.economy) || 10; // Default high economy if missing

      // Matches (0.2) + Runs (0.01) + Wickets (0.5) + Avg (0.5) + SR (0.1) + Boundaries (0.1/0.2) + Econ Bonus (10 - Econ) + WK (0.1/0.2)
      const matchesToCount = matches || parseFloat(stats.bowlMatches) || 0;
      const fours = parseFloat(stats.fours) || 0;
      const sixes = parseFloat(stats.sixes) || 0;
      const econBonus = stats.economy ? (10 - parseFloat(stats.economy)) : 0;
      const catches = parseFloat(stats.catches) || 0;
      const stumpings = parseFloat(stats.stumpings) || 0;
      
      performanceScore += (matchesToCount * 0.2) + (runs / 100) + (wickets * 0.5) + (avg * 0.5) + (sr / 10) + (fours * 0.1) + (sixes * 0.2) + (catches * 0.1) + (stumpings * 0.2) + econBonus;

      // 3. Elite Player Bonus (+20 for huge buys > 10 Cr)
      if (p.finalPrice >= 1000) specialistBonuses += 20;

      // 4. Role Specialist Bonuses
      // Finisher (Batter/AR with SR > 150)
      if ((role.includes('Batter') || role.includes('All')) && sr > 150) specialistBonuses += 15;
      // Anchor (Batter with Avg > 40)
      if (role.includes('Batter') && avg > 40) specialistBonuses += 15;
      // Wicked Spinner/Efficient Bowler (Bowler with Economy < 7)
      if (role.includes('Bowler') && econ < 7 && econ > 0) specialistBonuses += 15;
    });

    // 5. Overseas Optimization
    if (counts.Overseas === 8) {
      strategyScore += 30; // Perfect Balance
    } else if (counts.Overseas > 8) {
      strategyScore -= 50; // Violation Penalty
    }

    // 6. Composition Bonuses (REQS: 6/6/3/2)
    const REQS = { Batter: 6, Bowler: 6, AllRounder: 3, Wicketkeeper: 2 };
    let metAll = true;
    Object.keys(REQS).forEach(role => {
      if (counts[role] >= REQS[role]) {
        strategyScore += 15;
      } else {
        metAll = false;
        strategyScore -= 10;
      }
    });

    if (squad.length < 18) {
      strategyScore -= 50; // Under-size penalty
      metAll = false;
    }
    if (metAll) strategyScore += 25; // Complete Squad Bonus

    // 7. Budget Efficiency (+1 pt per 100L remaining)
    const STARTING_BUDGET = 10000;
    const spent = STARTING_BUDGET - team.budget;
    const budgetBonus = team.budget / 100;

    // 8. Mandatory 75% Spend Penalty (-50 pts if spent < 7,500L)
    if (spent < 7500) {
      strategyScore -= 50;
    }

    const totalScore = (performanceScore + strategyScore + specialistBonuses + budgetBonus).toFixed(1);

    return { ...team, squad, totalScore, counts, statsBreakdown: { performanceScore, strategyScore, specialistBonuses, budgetBonus } };
  });

  // Sort by score
  teamsData.sort((a, b) => b.totalScore - a.totalScore);

  leaderboardContainer.innerHTML = '';
  teamsData.forEach((t, idx) => {
    leaderboardContainer.innerHTML += `
      <div class="list-item" style="${idx === 0 ? 'border: 2px solid #FFD700; background: rgba(212, 175, 55, 0.1);' : ''}">
        <div style="display:flex; align-items:center; gap:20px; width:100%;">
          <div style="font-size:1.5rem; font-weight:900; color:var(--primary); width:30px;">${idx + 1}</div>
          <img src="${t.logo || ''}" style="width:40px; height:40px; object-fit:contain;">
          <div style="flex:1">
            <div style="font-weight:800; font-size:1.1rem;">${t.name} ${idx === 0 ? '👑' : ''}</div>
            <div style="font-size:0.8rem; color:var(--text-muted);">
              ${t.counts.Batter} BAT | ${t.counts.Bowler} BOWL | ${t.counts.AllRounder} AR | ${t.counts.Wicketkeeper} WK | <span style="color: ${t.counts.Overseas > 8 ? '#ef4444' : (t.counts.Overseas === 8 ? '#10b981' : 'var(--text-muted)')}">${t.counts.Overseas} OS</span>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:1.5rem; font-weight:900; color:var(--primary);">${t.totalScore}</div>
            <div style="font-size:0.6rem; text-transform:uppercase; color:var(--text-muted); line-height:1.2;">
                P: ${t.statsBreakdown.performanceScore.toFixed(1)} | 
                S: ${t.statsBreakdown.strategyScore.toFixed(0)}<br>
                B: ${t.statsBreakdown.budgetBonus.toFixed(1)} | 
                E: ${t.statsBreakdown.specialistBonuses.toFixed(0)}
            </div>
          </div>
        </div>
      </div>
    `;
  });

  leaderboardModal.classList.remove('hidden');
}

closeLeaderboardBtn.addEventListener('click', () => {
    leaderboardModal.classList.add('hidden');
});

// --- Analytics Dashboard ---

if (btnAnalytics) {
  btnAnalytics.addEventListener('click', showAnalytics);
}

closeAnalyticsBtn.addEventListener('click', () => {
  analyticsModal.classList.add('hidden');
});

function showAnalytics() {
  const soldPlayers = appState.players.filter(p => p.status === 'sold');
  if (soldPlayers.length === 0) return;

  // 1. Best Value Buy (Lowest difference between Final and Base price)
  const bestValue = soldPlayers.reduce((prev, curr) => {
    const prevDiff = (prev.finalPrice || 0) - (prev.basePrice || 0);
    const currDiff = (curr.finalPrice || 0) - (curr.basePrice || 0);
    return prevDiff < currDiff ? prev : curr;
  }, soldPlayers[0]);

  // 2. Most Balanced Squad (From Leaderboard logic)
  const teamsData = appState.teams.map(team => {
    const squad = appState.players.filter(p => p.team === team.id);
    const counts = { Batter: 0, Bowler: 0, AllRounder: 0, Wicketkeeper: 0 };
    squad.forEach(p => {
      const role = p.role.replace('-', '').replace(' ', '');
      if (role.includes('Batter')) counts.Batter++;
      if (role.includes('Bowler')) counts.Bowler++;
      if (role.includes('All')) counts.AllRounder++;
      if (role.includes('keeper')) counts.Wicketkeeper++;
    });
    const REQS = { Batter: 6, Bowler: 6, AllRounder: 3, Wicketkeeper: 2 };
    let metCount = 0;
    Object.keys(REQS).forEach(role => { if (counts[role] >= REQS[role]) metCount++; });
    return { ...team, metCount, squadSize: squad.length };
  });
  const mostBalanced = teamsData.reduce((prev, curr) => (prev.metCount > curr.metCount ? prev : curr), teamsData[0]);

  // 3. Budget Efficiency (Total Squad Rating / Total Spent)
  const efficientTeam = teamsData.map(t => {
      const STARTING_BUDGET = 10000;
      const spent = STARTING_BUDGET - t.budget;
      // We can take totalScore if we recalculate it here, OR just spend/squadSize ratio for simplicity
      const efficiency = t.squadSize / (spent || 1); 
      return { ...t, efficiency };
  }).reduce((prev, curr) => (prev.efficiency > curr.efficiency ? prev : curr), teamsData[0]);

  analyticsContainer.innerHTML = `
    <div class="analytics-card">
      <span class="analytics-icon">💎</span>
      <h3>Best Value Buy</h3>
      <div class="value">${bestValue.name}</div>
      <div class="sub-value">Sold for ${formatMoney(bestValue.finalPrice)} (Base: ${formatMoney(bestValue.basePrice)})</div>
    </div>
    <div class="analytics-card">
      <span class="analytics-icon">⚖️</span>
      <h3>Most Balanced Squad</h3>
      <div class="value">${mostBalanced.name}</div>
      <div class="sub-value">Met ${mostBalanced.metCount}/4 composition requirements</div>
    </div>
    <div class="analytics-card">
      <span class="analytics-icon">📈</span>
      <h3>Budget Efficiency</h3>
      <div class="value">${efficientTeam.name}</div>
      <div class="sub-value">Highest player-to-spend ratio in the auction</div>
    </div>
  `;

  analyticsModal.classList.remove('hidden');
}

// --- Team Password Management ---

if (btnPasswords) {
  btnPasswords.addEventListener('click', () => {
    // Reset modal state
    passwordVerifySection.classList.remove('hidden');
    passwordListContainer.classList.add('hidden');
    adminVerifyPasswordInput.value = '';
    passwordModal.classList.remove('hidden');
  });
}

if (btnVerifyAdmin) {
  btnVerifyAdmin.addEventListener('click', () => {
    const enteredPass = adminVerifyPasswordInput.value;
    const adminPass = appState.globalState.adminPassword || 'admin123'; // Fallback matching server.js

    if (enteredPass === adminPass) {
      passwordVerifySection.classList.add('hidden');
      passwordListContainer.classList.remove('hidden');
      socket.emit('requestAdminTeamData');
      renderPasswordManager();
    } else {
      alert("Invalid Auctioneer Password! Access Denied.");
    }
  });
}

if (adminVerifyPasswordInput) {
  adminVerifyPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      btnVerifyAdmin.click();
    }
  });
}

closePasswordBtn.addEventListener('click', () => {
  passwordModal.classList.add('hidden');
});

function renderPasswordManager() {
  if (!passwordListContainer) return;
  passwordListContainer.innerHTML = '';
  
  if (adminTeamsList.length === 0) {
    passwordListContainer.innerHTML = '<div class="text-muted">Loading team passwords...</div>';
    return;
  }

  adminTeamsList.forEach(team => {
    passwordListContainer.innerHTML += `
      <div class="list-item" style="display:flex; align-items:center; justify-content:space-between; gap:20px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${team.logo || ''}" style="width:30px; height:30px; object-fit:contain;">
          <span style="font-weight:700;">${team.name}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <input type="text" id="pass-${team.id}" value="${team.password}" 
            style="background:rgba(255,255,255,0.05); color:white; border:1px solid rgba(255,255,255,0.1); padding:8px; border-radius:6px; font-family:monospace; width:120px;">
          <button class="btn-primary" style="padding:8px 15px; font-size:0.75rem;" onclick="saveNewPassword('${team.id}')">Update</button>
        </div>
      </div>
    `;
  });
}

window.saveNewPassword = function(teamId) {
  const newPass = document.getElementById(`pass-${teamId}`).value;
  if (!newPass) return alert("Password cannot be empty!");
  
  const team = adminTeamsList.find(t => t.id === teamId);
  if (confirm(`Update password for ${team.name} to "${newPass}"?`)) {
    socket.emit('updateTeamPassword', { teamId, newPassword: newPass });
  }
};

// Admin: Reset Biddings Only
const btnResetBids = document.getElementById('btn-reset-bids');
if (btnResetBids) {
  btnResetBids.addEventListener('click', () => {
    if (confirm("Reset all biddings? This will clear squads and budgets but KEEP all currently added players. Continue?")) {
      socket.emit('resetBiddings');
    }
  });
}

// Admin: Edit Player
window.editPlayer = function(playerId) {
  const p = appState.players.find(pl => pl.id === playerId);
  if (!p) return;
  document.getElementById('p-id').value = p.id;
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-role').value = p.role;
  document.getElementById('p-baseprice').value = p.basePrice || 50;
  document.getElementById('p-jersey').value = p.jerseyNumber || '';
  document.getElementById('p-overseas').checked = !!p.isOverseas;
  document.getElementById('p-ipl-exp').checked = !!p.hasIplExp;
  updateModalLabels(); // Set correct labels
  document.getElementById('p-img').value = p.img || '';

  const stats = p.stats || {};
  document.getElementById('p-runs').value = stats.runs || '';
  document.getElementById('p-matches').value = stats.matches || '';
  document.getElementById('p-fours').value = stats.fours || '';
  document.getElementById('p-sixes').value = stats.sixes || '';
  document.getElementById('p-average').value = stats.average || '';
  document.getElementById('p-strike-rate').value = stats.strikeRate || '';
  document.getElementById('p-hs').value = stats.hs || '';
  document.getElementById('p-fifties').value = stats.fiftiesHundreds || '';

  document.getElementById('p-wickets').value = stats.wickets || '';
  document.getElementById('p-bowl-matches').value = stats.bowlMatches || '';
  document.getElementById('p-economy').value = stats.economy || '';
  document.getElementById('p-maidens').value = stats.maidens || '';
  document.getElementById('p-bbi').value = stats.bbi || '';
  document.getElementById('p-four-five').value = stats.fourFive || '';

  document.getElementById('p-catches').value = stats.catches || '';
  document.getElementById('p-stumpings').value = stats.stumpings || '';

  document.getElementById('modal-title').innerText = 'Edit Player';
  document.getElementById('btn-delete-player-modal').classList.remove('hidden');
  playerModal.classList.remove('hidden');
};

// Admin: Delete Player
window.deletePlayer = function(playerId) {
  const p = appState.players.find(pl => pl.id === playerId);
  if (!p) return;
  
  if (confirm(`Are you sure you want to delete ${p.name}? This action cannot be undone.`)) {
    socket.emit('deletePlayer', { playerId });
  }
};

// Admin Commands
document.getElementById('btn-sold').addEventListener('click', () => {
  if (!appState.globalState.currentBidderId) {
    alert("No bids placed yet!");
    return;
  }
  socket.emit('markSold');
});

// Rules Modal Listeners
if (btnRules) {
  btnRules.addEventListener('click', () => {
    rulesModal.classList.remove('hidden');
  });
}

if (closeRulesBtn) {
  closeRulesBtn.addEventListener('click', () => {
    rulesModal.classList.add('hidden');
  });
}

// Close modals on outside click
window.addEventListener('click', (e) => {
  if (e.target === playerModal) playerModal.classList.add('hidden');
  if (e.target === squadModal) squadModal.classList.add('hidden');
  if (e.target === leaderboardModal) leaderboardModal.classList.add('hidden');
  if (e.target === rulesModal) rulesModal.classList.add('hidden');
});

document.getElementById('btn-unsold').addEventListener('click', () => {
  socket.emit('markUnsold');
});

// Team Commands
document.querySelectorAll('.btn-bid').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (currentUser.role !== 'team') return;
    
    const myTeam = appState.teams.find(t => t.id === currentUser.id);
    if (!myTeam) return;

    if (myTeam.isEliminated) {
      alert("This franchise has been ELIMINATED and cannot bid!");
      return;
    }

    const bidAmount = parseInt(e.target.dataset.amount);
    const newTotal = appState.globalState.currentBid + bidAmount;
    
    if (newTotal > myTeam.budget) {
      alert("Insufficient Budget!");
      return;
    }

    // Client-side guard for Overseas & Squad limits
    const activePlayer = appState.players.find(p => p.id === appState.globalState.activePlayerId);
    if (activePlayer && activePlayer.isOverseas) {
      const mySquad = appState.players.filter(p => p.team === myTeam.id && p.status === 'sold');
      const osCount = mySquad.filter(p => p.isOverseas).length;
      if (osCount >= 8) {
        alert("Strategic Limit: You already have 8 Overseas players!");
        return;
      }
    }

    if (myTeam.players.length >= 25) {
      alert("Squad Limit: Your roster is full (max 25 players)!");
      return;
    }
    
    socket.emit('placeBid', { teamId: currentUser.id, amount: newTotal });
  });
});

// Admin Player Modal
btnNewPlayer.addEventListener('click', () => {
  document.getElementById('p-id').value = '';
  document.getElementById('p-name').value = '';
  document.getElementById('p-role').value = 'Batter';
  document.getElementById('p-baseprice').value = '50';
  document.getElementById('p-jersey').value = '';
  document.getElementById('p-overseas').checked = false;
  document.getElementById('p-ipl-exp').checked = false;
  updateModalLabels(); // Reset labels to Domestic by default
  document.getElementById('p-img').value = '';

  document.getElementById('p-runs').value = '';
  document.getElementById('p-matches').value = '';
  document.getElementById('p-fours').value = '';
  document.getElementById('p-sixes').value = '';
  document.getElementById('p-average').value = '';
  document.getElementById('p-strike-rate').value = '';
  document.getElementById('p-hs').value = '';
  document.getElementById('p-fifties').value = '';

  document.getElementById('p-wickets').value = '';
  document.getElementById('p-bowl-matches').value = '';
  document.getElementById('p-economy').value = '';
  document.getElementById('p-maidens').value = '';
  document.getElementById('p-bbi').value = '';
  document.getElementById('p-four-five').value = '';

  document.getElementById('p-catches').value = '';
  document.getElementById('p-stumpings').value = '';

  document.getElementById('modal-title').innerText = 'Add New Player';
  document.getElementById('btn-delete-player-modal').classList.add('hidden');
  playerModal.classList.remove('hidden');
});

// Admin: Modal Delete Button
document.getElementById('btn-delete-player-modal').addEventListener('click', () => {
  const playerId = document.getElementById('p-id').value;
  if (!playerId) return;
  window.deletePlayer(playerId);
  playerModal.classList.add('hidden');
});

closeBtn.addEventListener('click', () => {
  playerModal.classList.add('hidden');
});

playerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const id = document.getElementById('p-id').value;
  const name = document.getElementById('p-name').value;
  const role = document.getElementById('p-role').value;
  const basePrice = parseInt(document.getElementById('p-baseprice').value);
  const jerseyNumber = document.getElementById('p-jersey').value;
  const isOverseas = document.getElementById('p-overseas').checked;
  const hasIplExp = document.getElementById('p-ipl-exp').checked;
  const img = document.getElementById('p-img').value;

  const stats = {
    runs: document.getElementById('p-runs').value,
    matches: document.getElementById('p-matches').value,
    fours: document.getElementById('p-fours').value,
    sixes: document.getElementById('p-sixes').value,
    average: document.getElementById('p-average').value,
    strikeRate: document.getElementById('p-strike-rate').value,
    hs: document.getElementById('p-hs').value,
    fiftiesHundreds: document.getElementById('p-fifties').value,
    wickets: document.getElementById('p-wickets').value,
    bowlMatches: document.getElementById('p-bowl-matches').value,
    economy: document.getElementById('p-economy').value,
    maidens: document.getElementById('p-maidens').value,
    bbi: document.getElementById('p-bbi').value,
    fourFive: document.getElementById('p-four-five').value,
    catches: document.getElementById('p-catches').value,
    stumpings: document.getElementById('p-stumpings').value
  };

  socket.emit('updatePlayer', { id, name, role, basePrice, jerseyNumber, isOverseas, hasIplExp, img, stats });
  playerModal.classList.add('hidden');
});

// --- Squad Logic ---
// --- Squad Logic ---
window.viewSquad = function(teamId) {
  const team = appState.teams.find(t => t.id === teamId);
  if (!team) return;

  squadTitle.innerText = `${team.name} - Squad`;

  // Admin Toggle for Elimination
  if (btnEliminate) {
    if (currentUser?.role === 'admin') {
      btnEliminate.classList.remove('hidden');
      btnEliminate.textContent = team.isEliminated ? 'RESTORE FRANCHISE' : 'ELIMINATE FRANCHISE';
      btnEliminate.style.background = team.isEliminated ? 'var(--success)' : 'var(--danger)';
      btnEliminate.onclick = () => {
        if (confirm(`Are you sure you want to ${team.isEliminated ? 'RESTORE' : 'ELIMINATE'} ${team.name}?`)) {
          socket.emit('toggleEliminateTeam', { teamId: team.id });
        }
      };
    } else {
      btnEliminate.classList.add('hidden');
    }
  }
  
  const squadPlayers = appState.players.filter(p => p.team === teamId);
  const counts = { Batter: 0, Bowler: 0, 'All-rounder': 0, 'Wicketkeeper-Batsman': 0, 'Wicketkeeper': 0 };
  squadPlayers.forEach(p => {
    if (counts[p.role] !== undefined) counts[p.role]++;
  });
  
  // Wicketkeeper normalization
  const wkTotal = counts['Wicketkeeper-Batsman'] + counts['Wicketkeeper'];
  const arTotal = counts['All-rounder'];

  const overseasCount = squadPlayers.filter(p => p.isOverseas).length;
  const STARTING_BUDGET = 10000;
  const spent = STARTING_BUDGET - team.budget;

  // Requirements Helper
  const getReqHtml = (label, current, required) => {
    const isComplete = current >= required;
    const pct = Math.min(100, (current / required) * 100);
    return `
      <div class="requirement-item">
        <div class="req-header">
          <span>${label} (${required} Min)</span>
          <span style="color: ${isComplete ? 'var(--success)' : 'var(--primary)'}">${current}/${required} ${isComplete ? '✅' : ''}</span>
        </div>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill ${isComplete ? 'complete' : ''}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  };

  squadSummary.innerHTML = `
    <div class="summary-item">
      <span class="summary-val" style="color: ${squadPlayers.length >= 18 ? 'var(--success)' : 'var(--danger)'}">${squadPlayers.length}/25</span>
      <span class="summary-lbl">Roster (Min 18)</span>
    </div>
    <div class="summary-item">
      <span class="summary-val" style="color: ${overseasCount <= 8 ? 'var(--primary)' : 'var(--danger)'}">${overseasCount}/8</span>
      <span class="summary-lbl">Overseas</span>
    </div>
  `;

  const requirementsHtml = `
    <div class="requirements-container">
      <h3 style="font-size: 0.9rem; margin-bottom: 15px; color: var(--primary); text-transform: uppercase;">Squad Composition</h3>
      ${getReqHtml('Batters', counts.Batter, 6)}
      ${getReqHtml('Bowlers', counts.Bowler, 6)}
      ${getReqHtml('All-rounders', arTotal, 3)}
      ${getReqHtml('Wicket-keepers', wkTotal, 2)}
    </div>
  `;

  squadPlayersList.innerHTML = requirementsHtml;
  
  if (squadPlayers.length === 0) {
    squadPlayersList.innerHTML += '<div class="text-muted" style="padding:20px;text-align:center;">No players bought yet.</div>';
  } else {
    squadPlayers.forEach(p => {
      const img = p.img || 'https://images2.imgbox.com/6c/d2/8I1zS2mY_o.png';
      squadPlayersList.innerHTML += `
        <div class="list-item">
          <div class="p-list-left">
             <img src="${img}" class="p-list-avatar">
             <div class="p-list-info">
                <span class="p-list-name">${p.name} ${p.isOverseas ? '✈️' : ''}</span>
                <span class="p-list-role">${p.role}</span>
             </div>
          </div>
          <div class="p-list-right">
             <div class="p-list-price">${formatMoney(p.finalPrice)}</div>
          </div>
        </div>
      `;
    });
  }

  squadModal.classList.remove('hidden');
};

closeSquadBtn.addEventListener('click', () => {
  squadModal.classList.add('hidden');
});

window.addEventListener('click', (e) => {
  if (e.target === squadModal) squadModal.classList.add('hidden');
});

// --- Sold Animation Logic ---
function showSoldAnimation({ player, team, price }) {
  soldPlayerImg.src = player.img || 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=500&auto=format&fit=crop&q=60';
  soldPlayerName.innerText = player.name;
  soldTeamLogo.src = team.logo || '';
  soldTeamLogo.style.display = team.logo ? 'block' : 'none';
  soldTeamName.innerText = team.name;
  soldPrice.innerText = formatMoney(price);

  soldOverlay.classList.remove('hidden');

  // Trigger confetti or flowers if needed, but the stamp animation is key
  console.log(`Celebration: ${player.name} sold to ${team.name} for ${price}`);

  setTimeout(() => {
    soldOverlay.classList.add('hidden');
  }, 4500); // Show for 4.5 seconds
}
