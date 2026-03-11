const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// In-memory state for simplicity
let teams = [
  { id: 't1', name: 'CSK (Chennai Super Kings)', budget: 1000, players: [] },
  { id: 't2', name: 'MI (Mumbai Indians)', budget: 1000, players: [] },
  { id: 't3', name: 'RCB (Royal Challengers Bangalore)', budget: 1000, players: [] },
  { id: 't4', name: 'KKR (Kolkata Knight Riders)', budget: 1000, players: [] },
  { id: 't5', name: 'DC (Delhi Capitals)', budget: 1000, players: [] },
  { id: 't6', name: 'RR (Rajasthan Royals)', budget: 1000, players: [] },
  { id: 't7', name: 'PBKS (Punjab Kings)', budget: 1000, players: [] },
  { id: 't8', name: 'SRH (Sunrisers Hyderabad)', budget: 1000, players: [] },
  { id: 't9', name: 'LSG (Lucknow Super Giants)', budget: 1000, players: [] },
  { id: 't10', name: 'GT (Gujarat Titans)', budget: 1000, players: [] },
];

let players = [
  { id: 'p1', name: 'Virat Kohli', role: 'Batter', basePrice: 200, status: 'upcoming', team: null, finalPrice: null, img: 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'p2', name: 'MS Dhoni', role: 'Wicketkeeper', basePrice: 200, status: 'upcoming', team: null, finalPrice: null, img: 'https://images.unsplash.com/photo-1624194639908-621aa906bcce?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'p3', name: 'Rohit Sharma', role: 'Batter', basePrice: 200, status: 'upcoming', team: null, finalPrice: null, img: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'p4', name: 'Rashid Khan', role: 'Bowler', basePrice: 150, status: 'upcoming', team: null, finalPrice: null, img: 'https://images.unsplash.com/photo-1593341646647-75b329d0e071?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' },
  { id: 'p5', name: 'Hardik Pandya', role: 'All-rounder', basePrice: 200, status: 'upcoming', team: null, finalPrice: null, img: 'https://images.unsplash.com/photo-1533501764662-7f938cbe22dc?w=500&auto=format&fit=crop&q=60&ixlib=rb-4.0.3' }
];

let globalState = {
  activePlayerId: null,
  currentBid: 0,
  currentBidderId: null,
};

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Send initial state to the new client
  socket.emit('initialState', { teams, players, globalState });

  // Admin: Set a player as active for auction
  socket.on('setActivePlayer', ({ playerId }) => {
    const player = players.find(p => p.id === playerId);
    if (player) {
      if(player.status === 'upcoming') {
         globalState.activePlayerId = playerId;
         globalState.currentBid = player.basePrice;
         globalState.currentBidderId = null;
         io.emit('stateUpdate', { globalState, players });
      }
    }
  });

  // Team: Place a bid
  socket.on('placeBid', ({ teamId, amount }) => {
    // Validate bid
    const team = teams.find(t => t.id === teamId);
    if (team && globalState.activePlayerId) {
      if (amount > globalState.currentBid && amount <= team.budget) {
        globalState.currentBid = amount;
        globalState.currentBidderId = teamId;
        io.emit('stateUpdate', { globalState });
      }
    }
  });

  // Admin: Mark as sold
  socket.on('markSold', () => {
    if (globalState.activePlayerId && globalState.currentBidderId) {
      const playerIdx = players.findIndex(p => p.id === globalState.activePlayerId);
      const teamIdx = teams.findIndex(t => t.id === globalState.currentBidderId);

      if (playerIdx !== -1 && teamIdx !== -1) {
        const price = globalState.currentBid;
        if (teams[teamIdx].budget >= price) {
          // Process transaction
          players[playerIdx].status = 'sold';
          players[playerIdx].team = globalState.currentBidderId;
          players[playerIdx].finalPrice = price;

          teams[teamIdx].budget -= price;
          teams[teamIdx].players.push(players[playerIdx].id);

          // Reset active player
          globalState.activePlayerId = null;
          globalState.currentBid = 0;
          globalState.currentBidderId = null;

          io.emit('stateUpdate', { globalState, players, teams });
        }
      }
    }
  });

  // Admin: Mark as unsold
  socket.on('markUnsold', () => {
    if (globalState.activePlayerId) {
      const playerIdx = players.findIndex(p => p.id === globalState.activePlayerId);
      if (playerIdx !== -1) {
        players[playerIdx].status = 'unsold';
        
        // Reset active player
        globalState.activePlayerId = null;
        globalState.currentBid = 0;
        globalState.currentBidderId = null;

        io.emit('stateUpdate', { globalState, players });
      }
    }
  });

  // Admin: Update player details or add new
  socket.on('updatePlayer', (playerData) => {
    if(playerData.id) {
       let idx = players.findIndex(p => p.id === playerData.id);
       if(idx !== -1) {
           players[idx] = { ...players[idx], ...playerData };
       }
    } else {
       players.push({
           ...playerData,
           id: 'p' + (players.length + 1),
           status: 'upcoming',
           team: null,
           finalPrice: null
       });
    }
    io.emit('initialState', { teams, players, globalState }); // Sending full refresh
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
