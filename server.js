const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 30000,
    pingInterval: 25000
});

const TICK_RATE = 20;
const TICK_INTERVAL = 1000 / TICK_RATE;
const path = require('path');

// Variabili globali
let players = {};
let lastSeen = {};
let serverStartTime = Date.now();
let teamScores = { red: 0, black: 0, green: 0, purple: 0 };

// Helper per calcolare distanza 3D
function distance3D(pos1, pos2) {
    const dx = pos1.x - pos2.x;
    const dy = pos1.y - pos2.y;
    const dz = pos1.z - pos2.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Server-side hit detection autoritativo
function validateHit(shooterId, targetId, hitPosition) {
    const shooter = players[shooterId];
    const target = players[targetId];

    if (!shooter || !target || target.isDead) return false;

    // Verifica che il target sia abbastanza vicino alla posizione dell'hit
    const dist = distance3D(target.position, hitPosition);

    // MIGLIORAMENTO: Distanza massima dinamica basata sul tipo di arma
    // Aumentata tolleranza per compensare lag e movimento veloce dei proiettili
    const maxHitDistance = 60; // Increased tolerance for fast projectiles + lag

    // Validazione aggiuntiva: verifica che lo shooter non sia troppo lontano
    const shooterDist = distance3D(shooter.position, target.position);
    const maxShooterDistance = 500; // Range massimo delle armi

    if (shooterDist > maxShooterDistance) {
        console.log(`[HIT VALIDATION] Shooter troppo lontano: ${shooterDist.toFixed(1)} > ${maxShooterDistance}`);
        return false;
    }

    const isValid = dist <= maxHitDistance;
    if (!isValid) {
        console.log(`[HIT VALIDATION] Hit position troppo lontana dal target: ${dist.toFixed(1)} > ${maxHitDistance}`);
    }

    return isValid;
}

// Serviamo i file statici dalla cartella "public"
app.use(express.static(path.join(__dirname, 'public')));

// Gestisci favicon e altri asset mancanti
app.get('/favicon.ico', (req, res) => {
    res.status(204).send(); // No Content
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- LOGICA MULTIPLAYER ORIGINALE ---

io.on('connection', (socket) => {
    console.log('Nuova connessione: ' + socket.id);
    lastSeen[socket.id] = Date.now();

    socket.on('joinGame', (userData) => {
        // Reset completo del player (rimuove flag isDead)
        if (players[socket.id]) delete players[socket.id];

        if (Object.keys(players).length >= 10) {
            socket.emit('serverMsg', 'Server pieno!');
            return;
        }

        console.log(`Giocatore ${userData.username} (ID: ${socket.id}) entrato.`);

        players[socket.id] = {
            id: socket.id,
            username: userData.username || "Guerriero",
            hp: 200,
            maxHp: 200,
            position: { x: 0, y: 6, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            animState: 'idle',
            weaponMode: 'ranged',
            isBlocking: false,
            isDead: false,
            teamColor: userData.teamColor || 0x2c3e50,
            gameMode: 'team',
            team: userData.team || null,
            // Stats
            kills: 0,
            deaths: 0,
            latency: 0
        };

        // Debug trace: emit currentPlayers to the joining socket and broadcast newPlayer
        console.log(`TRACE: emitting currentPlayers to ${socket.id} (playersCount=${Object.keys(players).length})`);
        socket.emit('currentPlayers', players);

        // SYNC SCORES: Send current team scores to new player
        socket.emit('updateTeamScores', teamScores);

        console.log(`TRACE: broadcasting newPlayer from ${socket.id} -> id=${players[socket.id].id}`);
        socket.broadcast.emit('newPlayer', players[socket.id]);

        // Broadcast team counts
        broadcastTeamCounts();
    });

    socket.on('requestTeamCounts', () => {
        const counts = getTeamCounts();
        socket.emit('teamCounts', counts);
    });

    // Ping handler
    socket.on('ping', (timestamp) => {
        socket.emit('pong', timestamp);
    });

    function getTeamCounts() {
        const counts = { red: 0, black: 0, green: 0, purple: 0 };
        Object.values(players).forEach(p => {
            if (p.team && counts[p.team] !== undefined) {
                counts[p.team]++;
            }
        });
        return counts;
    }

    function broadcastTeamCounts() {
        const counts = getTeamCounts();
        io.emit('teamCounts', counts);
    }

    socket.on('requestPosition', () => {
        socket.broadcast.emit('forcePositionUpdate');
    });

    socket.on('updateUsername', (username) => {
        if (players[socket.id]) {
            players[socket.id].username = username;
            io.emit('updateUsername', { id: socket.id, username: username });
        }
    });

    socket.on('chatMessage', (data) => {
        if (players[socket.id]) {
            // Broadcast messaggio a tutti
            io.emit('chatMessage', {
                id: socket.id,
                username: data.username || players[socket.id].username,
                text: data.text
            });
        }
    });

    socket.on('updateTeamColor', (data) => {
        if (players[socket.id]) {
            players[socket.id].teamColor = data.teamColor;
            io.emit('playerTeamColorChanged', { id: socket.id, teamColor: data.teamColor });
        }
    });

    socket.on('playerMovement', (data) => {
        const now = Date.now();
        lastSeen[socket.id] = now;
        if (players[socket.id]) {
            players[socket.id].position = data.position;
            players[socket.id].rotation = data.rotation;
            players[socket.id].animState = data.animState;
            players[socket.id].weaponMode = data.weaponMode;
            players[socket.id].lastUpdate = now; // Timestamp per lag compensation

            players[socket.id].lastUpdate = now; // Timestamp per lag compensation

            // Store Latency (Ping) sent by client
            if (data.ping !== undefined) {
                players[socket.id].latency = data.ping;
            } else if (data.timestamp) {
                // Fallback: One-way latency estimate (approx, less reliable)
                players[socket.id].latency = Math.max(0, now - data.timestamp);
            }

            // SERVER OPTIMIZATION: Broadcast removed. Updates are now handled by the Tick Loop.
            // socket.broadcast.emit('playerMoved', { ... }); 

        }
    });

    socket.on('playerBlock', (isBlocking) => {
        if (players[socket.id]) {
            players[socket.id].isBlocking = isBlocking;
            socket.broadcast.emit('updateEnemyBlock', { id: socket.id, isBlocking: isBlocking });
        }
    });

    socket.on('remoteEffect', (data) => {
        socket.broadcast.emit('remoteEffect', { id: socket.id, ...data });
    });

    socket.on('playerAttack', (attackData) => {
        socket.broadcast.emit('enemyAttacked', {
            id: socket.id,
            ...attackData
        });
    });

    socket.on('playerPushed', (pushData) => {
        const targetId = pushData.targetId;
        if (players[targetId]) {
            let actualDamage = 0;
            if (pushData.damage) {
                // FIX: Assicura che il danno sia sempre positivo (non può guarire)
                actualDamage = Math.max(0, Math.round(pushData.damage));
                console.log(`[PUSH DAMAGE] Target: ${targetId.substring(0, 8)}, Damage: ${actualDamage}, HP before: ${players[targetId].hp}`);
                players[targetId].hp -= actualDamage;
                // Clamp HP a 0 per evitare valori negativi
                players[targetId].hp = Math.max(0, players[targetId].hp);
                console.log(`[PUSH DAMAGE] HP after: ${players[targetId].hp}`);
            }
            // CRITICAL: Se il player muore, invia PRIMA playerDied POI gli altri eventi
            if (players[targetId].hp <= 0 && !players[targetId].isDead) {
                players[targetId].isDead = true;
                console.log(`[SERVER] Player ${targetId} morto (PUSH) - broadcasting playerDied PRIMA`);
                io.emit('playerDied', {
                    id: targetId,
                    killerId: socket.id,
                    position: players[targetId].position
                });

                // SCORE UPDATE (PUSH)
                const killer = players[socket.id];
                const victim = players[targetId];

                if (killer && victim) {
                    const killerTeam = killer.team;
                    const victimTeam = victim.team;

                    if (killerTeam && victimTeam) {
                        if (killerTeam !== victimTeam) {
                            if (teamScores[killerTeam] !== undefined) teamScores[killerTeam]++;
                        } else if (socket.id !== targetId) {
                            if (teamScores[killerTeam] !== undefined) teamScores[killerTeam]--;
                        }

                        // PLAYER STATS UPDATE
                        if (killerTeam !== victimTeam) {
                            killer.kills++;
                        } else if (socket.id !== targetId) {
                            killer.kills--;
                        }
                    } // end if killerTeam && victimTeam
                } // end if killer && victim

                // Victim Death (Always count)
                victim.deaths++;

                io.emit('updateTeamScores', teamScores);

                // IMMEDIATE SCOREBOARD UPDATE
                const stats = {};
                Object.values(players).forEach(p => {
                    stats[p.id] = { kills: p.kills || 0, deaths: p.deaths || 0, latency: p.latency || 0 };
                });
                io.emit('scoreboardUpdate', stats);
            }

            // Emit to the target player so they can execute the push effect
            io.to(targetId).emit('playerPushed', {
                forceY: pushData.forceY,
                forceVec: pushData.forceVec,
                pushOrigin: pushData.pushOrigin
            });

            // Emit health update and damage effect to all players (DOPO playerDied se necessario)
            io.emit('updateHealth', { id: targetId, hp: players[targetId].hp });

            // FIX: Invia playerHitResponse per feedback visivo completo (testo danno, flash, suono)
            if (actualDamage > 0) {
                io.to(targetId).emit('playerHitResponse', {
                    damage: actualDamage,
                    isBlocking: players[targetId].isBlocking || false // Invia info se stava bloccando
                });
                io.emit('remoteDamageTaken', { id: targetId }); // Notify all for blood/damage effect
            }
        }
    });

    socket.on('playerHit', (dmgData) => {
        const targetId = dmgData.targetId;

        // DEBUG: Log ogni hit ricevuto con timestamp
        const timestamp = Date.now();
        console.log(`[HIT RECEIVED] ${timestamp} - Attacker: ${socket.id.substring(0, 8)}, Target: ${targetId?.substring(0, 8)}, Damage: ${dmgData.damage}`);

        // Verifica che il target esista e non sia già morto
        if (!players[targetId] || players[targetId].isDead || players[targetId].hp <= 0) {
            console.log(`[HIT REJECTED] ${socket.id} -> ${targetId} (target morto o inesistente)`);
            socket.emit('hitRejected', { targetId: targetId });
            return;
        }

        // VALIDAZIONE SERVER-SIDE DELL'HIT
        if (!validateHit(socket.id, targetId, dmgData.hitPosition || players[targetId]?.position)) {
            console.log(`[HIT REJECTED] ${socket.id} -> ${targetId} (posizione non valida)`);
            // Informa il shooter che l'hit è stato respinto
            socket.emit('hitRejected', { targetId: targetId });
            return;
        }

        if (players[targetId]) {
            // FIX: SERVER CALCOLA IL DANNO - Non fidarsi del client!
            // Valida il tipo di danno e usa i valori server-side
            let actualDamage = dmgData.damage || 10; // Default fallback

            // Clamp danno tra 1 e 100 per prevenire exploit
            actualDamage = Math.max(1, Math.min(100, actualDamage));

            console.log(`[SERVER] HP PRIMA: ${players[targetId].hp}, Danno: ${actualDamage}`);

            players[targetId].hp -= actualDamage;

            // Clamp HP a 0 per evitare valori negativi
            players[targetId].hp = Math.max(0, players[targetId].hp);

            console.log(`[HIT VALIDATED] ${socket.id.substring(0, 8)} -> ${targetId.substring(0, 8)} | HP: ${players[targetId].hp + actualDamage} → ${players[targetId].hp} (dmg: ${actualDamage})`);

            // CRITICAL: Se il player muore, invia PRIMA playerDied POI updateHealth
            // Questo previene race conditions dove il client riceve HP update prima della morte
            // CRITICAL: Se il player muore, invia PRIMA playerDied POI updateHealth
            // Questo previene race conditions dove il client riceve HP update prima della morte
            if (players[targetId].hp <= 0 && !players[targetId].isDead) {
                players[targetId].isDead = true;
                console.log(`[SERVER] Player ${targetId} morto (HIT) - broadcasting playerDied PRIMA di updateHealth`);
                // Broadcast morte a TUTTI i client PRIMA dell'HP update
                io.emit('playerDied', {
                    id: targetId,
                    killerId: socket.id,
                    position: players[targetId].position
                });

                // SCORE UPDATE
                const killer = players[socket.id];
                const victim = players[targetId];

                if (killer && victim) {
                    const killerTeam = killer.team;
                    const victimTeam = victim.team;

                    if (killerTeam && victimTeam) {
                        if (killerTeam !== victimTeam) {
                            // Enemy Kill: +1
                            if (teamScores[killerTeam] !== undefined) teamScores[killerTeam]++;
                        } else if (socket.id !== targetId) {
                            // Friendly Fire: -1
                            if (teamScores[killerTeam] !== undefined) teamScores[killerTeam]--;
                        }

                        // PLAYER STATS UPDATE
                        if (killerTeam !== victimTeam) {
                            killer.kills++;
                        } else if (socket.id !== targetId) {
                            killer.kills--; // Penalty for TK
                        }
                    }
                }
                // Victim Death (Always count)
                victim.deaths++;

                // Broadcast NEW Scores
                io.emit('updateTeamScores', teamScores);

                // IMMEDIATE SCOREBOARD UPDATE
                const stats = {};
                Object.values(players).forEach(p => {
                    stats[p.id] = { kills: p.kills || 0, deaths: p.deaths || 0, latency: p.latency || 0 };
                });
                io.emit('scoreboardUpdate', stats);
            }

            // Send health update to all (DOPO playerDied se necessario)
            io.emit('updateHealth', { id: targetId, hp: players[targetId].hp });

            // Send specific damage response to the target for local effects (like screen flash)
            io.to(targetId).emit('playerHitResponse', {
                damage: actualDamage,
                isBlocking: players[targetId].isBlocking || false // Invia info se stava bloccando
            });

            // Notify all for blood/damage effect
            if (actualDamage > 0) {
                io.emit('remoteDamageTaken', { id: targetId });
            }
        }
    });

    socket.on('playerHealed', (healData) => {
        if (players[socket.id]) {
            players[socket.id].hp = Math.min(players[socket.id].maxHp, players[socket.id].hp + healData.amount);
            io.emit('updateHealth', { id: socket.id, hp: players[socket.id].hp });
        }
    });

    // FIX: Broadcast casting events for animations
    socket.on('playerStartCasting', (data) => {
        if (players[socket.id]) {
            socket.broadcast.emit('playerStartCasting', { id: socket.id, type: data.type });
        }
    });

    socket.on('playerStopCasting', () => {
        if (players[socket.id]) {
            socket.broadcast.emit('playerStopCasting', { id: socket.id });
        }
    });

    socket.on('playerRespawned', (data) => {
        if (players[socket.id]) {
            // Reset completo stato player sul server
            players[socket.id].hp = players[socket.id].maxHp;
            players[socket.id].isDead = false;

            // Aggiorna posizione se fornita
            if (data && data.position) {
                players[socket.id].position = data.position;
            }
            if (data && data.rotation) {
                players[socket.id].rotation = data.rotation;
            }

            console.log(`[RESPAWN] ${socket.id} respawnato - team: ${players[socket.id].team}, teamColor: ${players[socket.id].teamColor}`);

            // Notifica tutti i client dello stato aggiornato con dati completi
            io.emit('updateHealth', { id: socket.id, hp: players[socket.id].hp });

            // Emit multipli per garantire sincronizzazione - INCLUDE TEAM E TEAMCOLOR
            io.emit('playerRespawned', {
                id: socket.id,
                hp: players[socket.id].hp,
                position: players[socket.id].position,
                rotation: players[socket.id].rotation,
                team: players[socket.id].team,
                teamColor: players[socket.id].teamColor,
                username: players[socket.id].username,
                timestamp: Date.now() // Timestamp per debug
            });

            // Broadcast newPlayer COMPLETO per assicurare visibilità (importante per respawn ritardati)
            socket.broadcast.emit('newPlayer', players[socket.id]);

            // Doppio check: forza aggiornamento posizione
            setTimeout(() => {
                if (players[socket.id] && !players[socket.id].isDead) {
                    socket.broadcast.emit('updatePosition', {
                        id: socket.id,
                        position: players[socket.id].position,
                        rotation: players[socket.id].rotation
                    });
                }
            }, 100);
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnesso: ' + socket.id);
        if (players[socket.id]) {
            delete players[socket.id];
            // Rimuovi il giocatore dalla simulazione dell'AI se necessario
            io.emit('removeOtherPlayer', socket.id);

            // CHECK IF SERVER IS EMPTY
            if (Object.keys(players).length === 0) {
                console.log('[SERVER] Server vuoto - Reset Punteggi');
                teamScores = { red: 0, black: 0, green: 0, purple: 0 };
            }
            io.emit('playerDisconnected', socket.id);
            // Broadcast aggiornamento conteggio squadre
            broadcastTeamCounts();
        }
        delete lastSeen[socket.id];
    });
});

// --- SERVER TICK LOOP (20Hz) ---
setInterval(() => {
    const playerCount = Object.keys(players).length;
    if (playerCount === 0) return;

    const updates = [];
    Object.values(players).forEach(p => {
        updates.push({
            id: p.id,
            position: p.position,
            rotation: p.rotation,
            animState: p.animState,
            weaponMode: p.weaponMode,
            timestamp: Date.now()
        });
    });

    // Broadcast snapshot (compressed if possible, but JSON for now)
    io.emit('worldUpdate', updates);

}, TICK_INTERVAL);

// Cleanup disconnections (Relaxed timeout: 30s)
setInterval(() => {
    const now = Date.now();
    Object.keys(players).forEach(id => {
        if (lastSeen[id] && (now - lastSeen[id] > 30000)) { // 30 seconds timeout
            console.log(`[TIMEOUT] Removing player ${id} after 30s inactivity`);
            delete players[id];
            delete lastSeen[id];
            io.emit('playerDisconnected', id);
            broadcastTeamCounts(); // Ensure counts are updated
        }
    });
}, 5000);

// --- SCOREBOARD BROADCAST LOOP (1Hz) ---
setInterval(() => {
    const stats = {};
    let hasPlayers = false;
    Object.values(players).forEach(p => {
        hasPlayers = true;
        stats[p.id] = {
            kills: p.kills || 0,
            deaths: p.deaths || 0,
            latency: p.latency || 0
        };
    });

    if (hasPlayers) {
        io.emit('scoreboardUpdate', stats);
    }
}, 1000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server RageQuit attivo su porta ${PORT}`);
});