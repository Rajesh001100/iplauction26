const socket = io();

// State
let currentUser = null; // { role: 'admin' | 'team', id?: 't1' }
let appState = {
  teams: [],
  players: [],
  globalState: {
    activePlayerId: null,
    currentBid: 0,
    currentBidderId: null
  }
};
let currentTab = 'upcoming';

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

// --- Initialization ---

// Wait for initial state to populate login dropdown
socket.on('initialState', (state) => {
  appState = state;
  populateLoginDropdown();
  if (currentUser) {
    renderApp();
  }
});

socket.on('stateUpdate', (partialState) => {
  appState = { ...appState, ...partialState };
  if (currentUser) {
    renderApp();
  }
});

function populateLoginDropdown() {
  // Keep admin, clear the rest
  roleSelect.innerHTML = `<option value="" disabled selected>Select Role...</option><option value="admin">Auctioneer (Admin)</option><option disabled>--- Franchises ---</option>`;
  appState.teams.forEach(team => {
    roleSelect.innerHTML += `<option value="${team.id}">${team.name}</option>`;
  });
}

// --- Login & Logout ---
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const pwd = document.getElementById('password').value;
  const roleVal = roleSelect.value;
  
  if (pwd !== 'admin123' && pwd !== 'team123') {
    alert('Invalid password! (Hint: use admin123 or team123)');
    return;
  }

  currentUser = {
    role: roleVal === 'admin' ? 'admin' : 'team',
    id: roleVal === 'admin' ? null : roleVal
  };

  loginScreen.classList.add('hidden');
  mainApp.classList.remove('hidden');

  if (currentUser.role === 'admin') {
    welcomeMsg.textContent = 'Welcome, AuctioneerDesk';
    document.documentElement.style.setProperty('--primary', '#8b5cf6');
    document.documentElement.style.setProperty('--primary-hover', '#7c3aed');
  } else {
    const team = appState.teams.find(t => t.id === currentUser.id);
    welcomeMsg.textContent = `Franchise: ${team.name}`;
  }

  renderApp();
});

logoutBtn.addEventListener('click', () => {
  currentUser = null;
  mainApp.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  document.getElementById('password').value = '';
});

// --- UI Rendering ---

function renderApp() {
  renderLiveAuction();
  renderPlayersList();
  renderTeamsStats();

  // Admin visibility toggles
  if (currentUser.role === 'admin') {
    adminAddPlayer.classList.remove('hidden');
    adminControls.classList.remove('hidden');
    teamControls.classList.add('hidden');
  } else {
    adminAddPlayer.classList.add('hidden');
    adminControls.classList.add('hidden');
    teamControls.classList.remove('hidden');
  }
}

function renderLiveAuction() {
  const { activePlayerId, currentBid, currentBidderId } = appState.globalState;
  
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
  const img = player.img || 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3';

  activePlayerCard.innerHTML = `
    <img src="${img}" alt="${player.name}" class="player-img">
    <div class="player-info">
      <div class="player-name">${player.name}</div>
      <div class="player-role">${player.role}</div>
      <div class="bid-details">
         <div class="text-muted">Current Bid</div>
         <div class="current-bid">₹${currentBid} L</div>
         <div class="current-bidder">${bidder}</div>
      </div>
    </div>
  `;
}

function renderPlayersList() {
  playersContainer.innerHTML = '';
  const filtered = appState.players.filter(p => p.status === currentTab);

  if (filtered.length === 0) {
    playersContainer.innerHTML = `<div class="text-muted" style="padding:20px;text-align:center;">No players in this category.</div>`;
    return;
  }

  filtered.forEach(p => {
    let rightSide = `<div class="p-list-price">₹${p.basePrice} L</div>`;
    if (p.status === 'sold') {
      const team = appState.teams.find(t => t.id === p.team);
      rightSide = `
        <div style="text-align:right">
           <div class="p-list-price">₹${p.finalPrice} L</div>
           <div style="font-size:0.8rem; color:#94a3b8;">${team?.name.split(' ')[0] || 'Unknown'}</div>
        </div>
      `;
    }

    let adminAction = '';
    if (currentUser.role === 'admin' && p.status === 'upcoming') {
      adminAction = `<button class="btn-outline" style="font-size:0.8rem; padding: 5px 10px; margin-left: 10px;" onclick="startAuction('${p.id}')">Start</button>`;
    }

    const img = p.img || 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=100&auto=format&fit=crop&q=60';
    
    playersContainer.innerHTML += `
      <div class="list-item">
        <div class="p-list-left">
           <img src="${img}" class="p-list-avatar">
           <div class="p-list-info">
              <span class="p-list-name">${p.name}</span>
              <span class="p-list-role">${p.role}</span>
           </div>
        </div>
        <div style="display:flex;align-items:center;">
           ${rightSide}
           ${adminAction}
        </div>
      </div>
    `;
  });
}

function renderTeamsStats() {
  teamsContainer.innerHTML = '';
  
  const sortedTeams = [...appState.teams].sort((a, b) => b.budget - a.budget);

  sortedTeams.forEach(t => {
    const isMe = currentUser?.id === t.id;
    teamsContainer.innerHTML += `
      <div class="list-item" style="${isMe ? 'border-color: var(--primary); background: rgba(59,130,246,0.1);' : ''}">
         <div class="team-item w-100" style="width: 100%;">
            <div class="team-top">
               <span class="team-name">${t.name} ${isMe ? '(You)' : ''}</span>
               <span class="team-budget">₹${t.budget}</span>
            </div>
            <div class="team-stats">Players: ${t.players.length}</div>
         </div>
      </div>
    `;
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

// Admin Commands
document.getElementById('btn-sold').addEventListener('click', () => {
  if (!appState.globalState.currentBidderId) {
    alert("No bids placed yet!");
    return;
  }
  socket.emit('markSold');
});

document.getElementById('btn-unsold').addEventListener('click', () => {
  socket.emit('markUnsold');
});

// Team Commands
document.querySelectorAll('.btn-bid').forEach(btn => {
  btn.addEventListener('click', (e) => {
    if (currentUser.role !== 'team') return;
    const bidAmount = parseInt(e.target.dataset.amount);
    const newTotal = appState.globalState.currentBid + bidAmount;
    
    const myTeam = appState.teams.find(t => t.id === currentUser.id);
    if (newTotal > myTeam.budget) {
      alert("Insufficient Budget!");
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
  document.getElementById('p-img').value = '';
  document.getElementById('modal-title').innerText = 'Add New Player';
  playerModal.classList.remove('hidden');
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
  const img = document.getElementById('p-img').value;

  socket.emit('updatePlayer', { id, name, role, basePrice, img });
  playerModal.classList.add('hidden');
});
