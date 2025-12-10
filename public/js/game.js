// Verifica che THREE.js sia caricato
if (typeof THREE === 'undefined') {
    throw new Error('[GAME] THREE.js not loaded! Check script loading order.');
}
console.log('[GAME] THREE.js ready, version r' + THREE.REVISION);

let socket = null;
const otherPlayers = {};
let myId = null;
let myUsername = "Player";
let myTeamColor = 0x2c3e50; // Colore dell'armatura del giocatore
let myGameMode = 'team'; // Solo modalità team
let myTeam = null; // 'red', 'black', 'green', 'purple'
let isPvEMode = false; // Flag per modalità PvE
let aiMonster = null; // Riferimento al mostro IA
let myKills = parseInt(localStorage.getItem('ragequit_kills')) || 0; // Contatore kill persistente
const playerKills = {}; // Kill di tutti i player {playerId: kills}
const teamKills = { red: 0, black: 0, green: 0, purple: 0 }; // Kill per squadra

const WORLD_SEED = 123456;
let seed = WORLD_SEED;
function random() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }

let camera, scene, renderer;
let playerMesh, swordContainer, staffContainer, shieldMesh, bowContainer;
let playerLimbs = { legL: null, legR: null, armL: null, armR: null, head: null, torso: null, helmet: null };
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let canJump = false; let isSprinting = false;
let isBlocking = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
let isCtrlPressed = false; // Flag per Ctrl
let weaponMode = 'ranged'; let currentSpell = 1;
let isAttacking = false; let attackTimer = 0; let isWhirlwinding = false;
const playerStats = { hp: 200, maxHp: 200, mana: 200, maxMana: 200, stamina: 200, maxStamina: 200, isDead: false, isFalling: false };
const projectiles = [], obstacles = [], particles = [];
let frameCount = 0; // Per throttling UI
const particlePool = []; // Object pooling per particelle
const maxParticles = 100; // Limita particelle attive

// Networking avanzato - Lag compensation
const positionBuffer = {}; // Buffer posizioni per interpolazione
const INTERPOLATION_DELAY = 100; // ms di delay per smooth interpolation
let serverTime = 0;
let clientTimeOffset = 0;

// LOD System
const LOD_DISTANCES = { HIGH: 50, MEDIUM: 150, LOW: 300 };
let lodObjects = [];

// Spectator mode
let isSpectating = false;
let spectateTarget = null;
let spectateIndex = 0;

// Match statistics
const matchStats = {
    kills: 0, deaths: 0, damage: 0, healing: 0,
    accuracy: { shots: 0, hits: 0 },
    startTime: Date.now(),
    matchHistory: JSON.parse(localStorage.getItem('ragequit_match_history') || '[]')
};

// FPS Counter
let fpsFrames = 0;
let fpsLastTime = performance.now();
let currentFPS = 0;

// Ping Counter
let lastPingTime = 0;
let currentPing = 0;
let floatingTexts = [];
const activeConversions = [];
let castingState = { active: false, currentSpell: 0, timer: 0, maxTime: 0, ready: false, keyHeld: null };
let lastAttackTime = 0; let lastHealTime = -10000; let lastConversionTime = 0; let lastWhirlwindTime = 0; let lastSpikesTime = 0;
let keyToRebind = null; // Variabile per gestire il rebinding dei tasti 
const savedSens = localStorage.getItem('ragequit_mouse_sensitivity');
let mouseSensitivity = (savedSens && !isNaN(parseFloat(savedSens))) ? parseFloat(savedSens) : 1.0;

// Jump Vars
let lastJumpTime = 0;
let lastFootstepTime = 0;
let distanceSinceStep = 0;
let isJumpKeyPressed = false; // Flag per prevenire salti ripetuti tenendo premuto Space

let euler = new THREE.Euler(0, 0, 0, 'YXZ');

// DEBUG: Visualizzazione hitbox (attiva/disattiva con F3)
let showHitboxes = false;
const hitboxHelpers = [];

const SETTINGS = {
    speed: 400.0,
    sprintMulti: 1.4,
    sprintStaminaCostPerSec: 5.0,

    // JUMP SETTINGS
    jumpForce: 200.0,
    jumpCooldown: 600, // Reduced from 800
    jumpCost: 10,
    gravity: 600.0, // Reduced from 800

    // Missile (Dardo)
    missileSpeed: 900.0,
    missileDmg: 10,
    missileGravity: 300, // GRAVITÀ DARDO RIDOTTA - traiettoria quasi dritta 
    missileCost: 5,

    // ONDA (Shockwave)
    pushSpeed: 700.0,
    pushForce: 900.0,
    pushUpForce: 300.0,
    pushCost: 15,
    pushRadius: 45,
    pushVisualRadius: 20,

    // Fireball (Palla di Fuoco)
    fireballSpeed: 600.0,
    fireballUpForce: 600.0,
    fireballDmg: 30,
    fireballCost: 20,
    fireballRadius: 35,

    // Beam (Spuntoni)
    beamDmg: 25,
    beamCost: 10, // Aumentato da 5 a 10 mana
    beamRange: 200,

    // Bow (Arco)
    bowCastTime: 0.6, // Aumentato da 0.3 a 0.6 secondi
    arrowSpeed: 1000.0,
    arrowDmg: 15,
    arrowCost: 10, // Aumentato da 5 a 10 stamina
    arrowGravity: 200, // GRAVITÀ FRECCIA RIDOTTA
    arrowKnockback: 100, // NUOVO: Knockback aggiunto all'arco

    fireRate: 400, meleeRate: 800, // Ridotto a 0.8s
    meleeRange: 20, // Ridotta da 32 a 20 come richiesto
    meleeDmg: 15,
    meleeStaminaCost: 5,
    meleeKnockbackForce: 0, // Knockback rimosso

    manaRegen: 2.0,
    manaRegen: 2.0,
    staminaCost: 0.2,
    staminaRegen: 3.0,

    healAmount: 20, healCost: 10, healCooldown: 10000,
    conversionCost: 5, conversionGain: 5, conversionCooldown: 1000,
    whirlwindDmg: 30, whirlwindRadius: 25, whirlwindCost: 10, whirlwindCooldown: 4000, // Raddoppiato da 2000 a 4000ms
    spikesCooldown: 3000,
    blockStaminaCost: 0.4, // 0.4 * 10 = 4 stamina/sec
    blockMitigation: 0.7,
    hpRegen: 0.5 // New HP Regen setting
};

// --- BACKGROUND THROTTLING FIX ---
// Use a Web Worker to drive network updates (unthrottled by browser)
const updateWorker = new Worker('./js/worker-timer.js');
updateWorker.onmessage = function (e) {
    if (e.data === 'tick') {
        // Force position update even if tab is backgrounded
        if (typeof sendPositionUpdate === 'function') {
            sendPositionUpdate();
        }
    }
};
updateWorker.postMessage('start');
console.log('[WORKER] Network timer started');


const loginModal = document.getElementById('login-modal');
const obstacleRaycaster = new THREE.Raycaster();

// Draggable UI Container
const uiContainer = document.getElementById('ui-container');
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;

uiContainer.addEventListener('mousedown', (e) => {
    isDragging = true;
    dragOffsetX = e.clientX - uiContainer.offsetLeft;
    dragOffsetY = e.clientY - uiContainer.offsetTop;
    uiContainer.classList.add('dragging');
});

document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        uiContainer.style.left = (e.clientX - dragOffsetX) + 'px';
        uiContainer.style.bottom = 'auto';
        uiContainer.style.top = (e.clientY - dragOffsetY) + 'px';
    }
    if (isChatDragging) {
        chatContainer.style.right = 'auto';
        chatContainer.style.left = (e.clientX - chatDragOffsetX) + 'px';
        chatContainer.style.bottom = 'auto';
        chatContainer.style.top = (e.clientY - chatDragOffsetY) + 'px';
    }
});

document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        uiContainer.classList.remove('dragging');
    }
    if (isChatDragging) {
        isChatDragging = false;
        chatContainer.classList.remove('dragging');
    }
});

// Draggable Chat Container
const chatContainer = document.getElementById('chat-container');
const chatHeader = document.getElementById('chat-header');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');
const chatCloseBtn = document.getElementById('chat-close-btn');
let isChatDragging = false;
let chatDragOffsetX = 0;
let chatDragOffsetY = 0;
let isChatMinimized = false;

chatHeader.addEventListener('mousedown', (e) => {
    // Non iniziare drag se click sul bottone close
    if (e.target === chatCloseBtn) return;
    isChatDragging = true;
    const rect = chatContainer.getBoundingClientRect();
    chatDragOffsetX = e.clientX - rect.left;
    chatDragOffsetY = e.clientY - rect.top;
    chatContainer.classList.add('dragging');
});

// Bottone chiudi/minimizza chat
chatCloseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    isChatMinimized = !isChatMinimized;
    if (isChatMinimized) {
        chatContainer.classList.add('minimized');
        chatCloseBtn.textContent = '+';
    } else {
        chatContainer.classList.remove('minimized');
        chatCloseBtn.textContent = '×';
    }
});

// Chat input handling
let isChatFocused = false;
chatInput.addEventListener('focus', () => {
    isChatFocused = true;
});
chatInput.addEventListener('blur', () => {
    isChatFocused = false;
    // Riattiva pointer lock quando si esce dalla chat
    if (!playerStats.isDead && document.pointerLockElement !== document.body) {
        setTimeout(() => {
            try {
                document.body.requestPointerLock();
            } catch (e) {
                console.log('Pointer lock error:', e);
            }
        }, 100);
    }
});
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        sendChatMessage(chatInput.value.trim());
        chatInput.value = '';
        chatInput.blur();
    }
    e.stopPropagation();
});

function sendChatMessage(message) {
    if (socket && socket.connected) {
        socket.emit('chatMessage', { username: myUsername, text: message });
    }
}

function addChatMessage(username, text, isSystem = false, senderId = null) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message' + (isSystem ? ' system' : '');

    let colorStyle = '';
    if (!isSystem && senderId) {
        let colorInt = 0xffffff;
        if (senderId === myId) {
            colorInt = myTeamColor;
        } else if (otherPlayers[senderId]) {
            colorInt = otherPlayers[senderId].teamColor || 0xffffff;
        }
        // Convert to hex string
        const colorHex = '#' + colorInt.toString(16).padStart(6, '0');
        colorStyle = `style="color: ${colorHex}; font-weight: bold; text-shadow: 1px 1px 0 #000;"`;
    }

    msgDiv.innerHTML = `<span class="chat-username" ${colorStyle}>${username}:</span><span class="chat-text">${text}</span>`;
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    // Limita messaggi a 50
    while (chatMessages.children.length > 50) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

document.addEventListener('contextmenu', event => event.preventDefault());

// Il login è gestito da menu.js

// Pulsante Torna al Menu Principale
document.getElementById('menu-btn').addEventListener('click', () => {
    document.exitPointerLock();
    if (socket) socket.disconnect();

    // Ripristina le variabili di gioco
    myId = null;
    myUsername = "Player";
    myTeamColor = 0x2c3e50;
    myGameMode = 'team';
    myTeam = null;
    playerStats.hp = 100;
    playerStats.mana = 100;
    playerStats.stamina = 100;
    playerStats.isDead = false;

    // Ricrea il game (azzera il mondo)
    location.reload();
});



// --- SISTEMA KEYBINDS COMPLETO ---
const KEYBINDS = {
    SPELL_1: 'KeyX',
    SPELL_2: 'KeyC',
    SPELL_3: 'KeyV',
    SPELL_4: 'KeyF',
    WEAPON_SWITCH: 'KeyQ',
    BOW_EQUIP: 'KeyE',
    HEAL: 'KeyR',
    BLOCK: 'Mouse2', // Changed default to Right Mouse Button
    UNLOCK_MOUSE: 'AltLeft',
    MOVE_FORWARD: 'KeyW',
    MOVE_LEFT: 'KeyA',
    MOVE_BACKWARD: 'KeyS',
    MOVE_RIGHT: 'KeyD',
    JUMP: 'Space',
    SPRINT: 'ShiftLeft',
    CONVERT_1: 'Digit1',
    CONVERT_2: 'Digit3',
    CONVERT_3: 'Digit2'
};

const KEY_NAMES = {
    SPELL_1: '🔹 Magic Dart',
    SPELL_2: '💨 Frost Wave',
    SPELL_3: '🔥 Fireball',
    SPELL_4: '⛰️ Stone Spikes',
    WEAPON_SWITCH: '⚔️ Melee/Whirlwind',
    BOW_EQUIP: '🏹 Bow',
    HEAL: '💚 Heal',
    BLOCK: '🛡️ Parry',
    UNLOCK_MOUSE: '🔓 Unlock Cursor',
    MOVE_FORWARD: '⬆️ Forward',
    MOVE_LEFT: '⬅️ Left',
    MOVE_BACKWARD: '⬇️ Backward',
    MOVE_RIGHT: '➡️ Right',
    JUMP: '🔼 Jump',
    SPRINT: '⚡ Sprint',
    CONVERT_1: '♥ Stamina → HP',
    CONVERT_2: '💧 HP → Mana',
    CONVERT_3: '⚡ Mana → Stamina'
};

const STORAGE_KEY = 'ragequit_keybinds_v3';
let currentBindingAction = null;

// Carica keybinds salvati
function loadKeybinds() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            Object.assign(KEYBINDS, JSON.parse(saved));
        }
    } catch (e) {
        console.error('Errore caricamento keybinds:', e);
    }
}

// Salva keybinds
function saveKeybinds() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(KEYBINDS));
    } catch (e) {
        console.error('Errore salvataggio keybinds:', e);
    }
}

// Formatta il codice tasto per visualizzazione
function formatKey(code) {
    if (!code) return '---';
    return code
        .replace('Key', '')
        .replace('Digit', '')
        .replace('Space', 'SPACE')
        .replace('ShiftLeft', 'SHIFT')
        .replace('ShiftRight', 'SHIFT')
        .replace('ControlLeft', 'CTRL')
        .replace('ControlRight', 'CTRL')
        .replace('AltLeft', 'ALT')
        .replace('AltRight', 'ALT')
        .replace('Mouse0', 'LMB')
        .replace('Mouse1', 'MMB')
        .replace('Mouse2', 'RMB')
        .toUpperCase();
}

// Inizializza UI keybinds
function initKeybindsUI() {
    console.log('initKeybindsUI called');
    const content = document.getElementById('keybinds-content');
    console.log('keybinds-content element:', content);
    if (!content) {
        console.error('keybinds-content not found!');
        return;
    }

    content.innerHTML = '';

    // Aggiungi slider sensibilità mouse
    const sensRow = document.createElement('div');
    sensRow.className = 'sensitivity-row';
    sensRow.style.gridColumn = '1 / -1';
    sensRow.style.marginBottom = '20px';

    const sensLabel = document.createElement('div');
    sensLabel.style.display = 'flex';
    sensLabel.style.justifyContent = 'space-between';
    sensLabel.style.marginBottom = '10px';
    sensLabel.innerHTML = `<span class="keybind-label">🎯 MOUSE SENSITIVITY</span><span class="keybind-label" id="sens-value">${(mouseSensitivity * 100).toFixed(0)}%</span>`;

    const sensSlider = document.createElement('input');
    sensSlider.type = 'range';
    sensSlider.min = '0.1';
    sensSlider.max = '3.0';
    sensSlider.step = '0.1';
    sensSlider.value = mouseSensitivity;
    sensSlider.className = 'sensitivity-slider';
    sensSlider.oninput = (e) => {
        mouseSensitivity = parseFloat(e.target.value);
        document.getElementById('sens-value').textContent = `${(mouseSensitivity * 100).toFixed(0)}%`;
        localStorage.setItem('ragequit_mouse_sensitivity', mouseSensitivity);
    };

    sensRow.appendChild(sensLabel);
    sensRow.appendChild(sensSlider);
    content.appendChild(sensRow);

    for (const [action, keyCode] of Object.entries(KEYBINDS)) {
        const row = document.createElement('div');
        row.className = 'keybind-row';

        const label = document.createElement('span');
        label.className = 'keybind-label';
        label.textContent = KEY_NAMES[action] || action;

        const keyBtn = document.createElement('button');
        keyBtn.className = 'keybind-btn';
        keyBtn.textContent = formatKey(keyCode);
        keyBtn.onclick = () => startRebind(action, keyBtn);

        row.appendChild(label);
        row.appendChild(keyBtn);
        content.appendChild(row);
    }

    console.log('Created', Object.keys(KEYBINDS).length, 'keybind rows');
    updateActionBarLabels();
}

// Esponi la funzione globalmente per il menu
window.initKeybindsUI = initKeybindsUI;

// Inizia il rebinding di un tasto
function startRebind(action, btnElement) {
    if (currentBindingAction) return;

    currentBindingAction = action;
    btnElement.classList.add('listening');
    btnElement.textContent = 'PREMI TASTO/CLICK...';

    // Handler unico per keyboard e mouse
    const completeRebind = (newCode) => {
        // CONFLICT CHECK
        const existingAction = Object.keys(KEYBINDS).find(key => KEYBINDS[key] === newCode && key !== action);
        if (existingAction) {
            const conflictName = KEY_NAMES[existingAction] || existingAction;
            if (!confirm(`Il tasto '${formatKey(newCode)}' è già assegnato a '${conflictName}'. Vuoi sovrascriverlo?`)) {
                // Cancelled
                btnElement.classList.remove('listening');
                btnElement.textContent = formatKey(KEYBINDS[action]);
                currentBindingAction = null;
                return;
            }
            // Overwrite: Erase the other action's bind
            KEYBINDS[existingAction] = null;
            // Note: We'll need to refresh the UI for the other button too, preferably re-init UI
        }

        KEYBINDS[action] = newCode;
        saveKeybinds();

        btnElement.classList.remove('listening');
        btnElement.textContent = formatKey(newCode);
        currentBindingAction = null;

        updateActionBarLabels();
        initKeybindsUI(); // Refresh entire UI to update conflict potential changes
    };

    const handleKey = (e) => {
        if (currentBindingAction !== action) return; // Safety
        e.preventDefault();
        e.stopPropagation();

        if (e.code === 'Escape') {
            // Cancel
            btnElement.classList.remove('listening');
            btnElement.textContent = formatKey(KEYBINDS[action]);
            currentBindingAction = null;
            document.removeEventListener('mousedown', handleMouse);
            return;
        }

        document.removeEventListener('mousedown', handleMouse);
        completeRebind(e.code);
    };

    const handleMouse = (e) => {
        if (currentBindingAction !== action) return;
        e.preventDefault();
        e.stopPropagation();

        const mouseCode = 'Mouse' + e.button;

        document.removeEventListener('keydown', handleKey);
        completeRebind(mouseCode);
    };

    document.addEventListener('keydown', handleKey, { once: true });
    document.addEventListener('mousedown', handleMouse, { once: true });
}

// Aggiorna le label nella action bar
function updateActionBarLabels() {
    const set = (id, action) => {
        const el = document.getElementById(id);
        if (el) el.textContent = formatKey(KEYBINDS[action]);
    };

    set('lbl-switch', 'WEAPON_SWITCH');
    set('lbl-bow', 'BOW_EQUIP');
    set('lbl-spell1', 'SPELL_1');
    set('lbl-spell2', 'SPELL_2');
    set('lbl-spell3', 'SPELL_3');
    set('lbl-spell4', 'SPELL_4');
    set('lbl-heal', 'HEAL');
    set('lbl-conv1', 'CONVERT_1');
    set('lbl-conv2', 'CONVERT_2');
    set('lbl-conv3', 'CONVERT_3');
}

// Carica i keybinds all'avvio
loadKeybinds();

// === KILL COUNTER SYSTEM ===
function updateKillCounter() {
    const teamContainer = document.getElementById('kill-counter-team');

    // Mostra sempre il contatore squadre
    teamContainer.style.display = 'flex';

    const teamNames = { red: 'BLOODMAW', black: 'FROSTBITE', green: 'ROTWOOD', purple: 'VOIDSCAR' };
    teamContainer.innerHTML = ['red', 'black', 'green', 'purple'].map(team =>
        `<div class="team-kill-box ${team}">
                    <div class="team-name">${teamNames[team]}</div>
                    <div class="team-kills">${teamKills[team]} ☠️</div>
                </div>`
    ).join('');
}

function updateTeamScore(team, amount) {
    if (team && teamKills[team] !== undefined) {
        teamKills[team] += amount;
    }

    // Only track personal kills if positive
    if (amount > 0) {
        // Note: personal kills logic would go here if needed, but we focus on Team Score
    }

    updateKillCounter();
}
// Export for global usage
window.updateTeamScore = updateTeamScore;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let audioEnabled = true; // Default ON
let masterVolume = 0.5; // Default 50%
const soundBuffers = {}; // Store loaded audio buffers

async function initAudioBuffers() {
    const sounds = {
        'bow_reload': '/sounds/bow_reload.mp3',
        'bow_shot': '/sounds/bow_shot.mp3'
    };

    for (const [key, path] of Object.entries(sounds)) {
        try {
            const response = await fetch(path);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            soundBuffers[key] = audioBuffer;
            console.log(`[AUDIO] Loaded successfully: ${key}`);
        } catch (e) {
            console.warn(`[AUDIO] Failed to load ${key} from ${path}:`, e);
        }
    }
}

function toggleAudio() {
    audioEnabled = !audioEnabled;
    const btn = document.getElementById('audio-btn');
    if (audioEnabled) {
        btn.innerText = "🔊"; // Speaker high volume
        btn.style.filter = "none";
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(e => console.warn("Audio resume failed:", e));
        }
    } else {
        btn.innerText = "🔇"; // Speaker off
        btn.style.filter = "grayscale(100%) brightness(0.5) sepia(100%) hue-rotate(-50deg) saturate(600%) contrast(0.8)"; // Reddish filter hack or just color style
        // Simpler way:
        btn.innerText = "❌";
        // actually requested: "icona dell audio quando è bianco l audio è on se clicclo diventa rosso con una x sopra"
        // Let's use emoji for simplicity but valid UX:
        // On: 🔊 (White/Standard)
        // Off: 🔇 (Reddish?)
    }
    // Better implementation per request:
    if (audioEnabled) {
        btn.innerHTML = "🔊";
        btn.style.color = "white";
    } else {
        btn.innerHTML = "🔇"; // Or specific X icon
        btn.style.color = "#ff3333";
    }
}

function playSound(type, pos = null) {
    if (!audioEnabled) return;
    let vol = 0.1 * masterVolume; // Apply Master Volume
    if (pos) {
        const dist = playerMesh.position.distanceTo(pos);
        if (dist > 150) return;
        vol = vol * (1 - (dist / 150));
    }

    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain(); osc.connect(gain); gain.connect(audioCtx.destination); const now = audioCtx.currentTime;

    // CHECK FOR LOADED BUFFER SOUNDS FIRST
    if (soundBuffers[type]) {
        console.log(`[AUDIO] Playing buffer: ${type}`);
        const source = audioCtx.createBufferSource();
        source.buffer = soundBuffers[type];

        // Simple linear distance attenuation for buffer sounds
        const bufferGain = audioCtx.createGain();
        bufferGain.connect(audioCtx.destination);
        // BOOST BUFFER VOLUME: Synthesized sounds use raw oscillators which are loud at 0.1 gain.
        // MP3s/Buffers need more gain to match. Boosting by 5x.
        bufferGain.gain.value = vol * 5.0;

        source.connect(bufferGain);
        source.start(now);
        return; // Exit, handled by buffer
    } else if (type === 'bow_reload' || type === 'bow_shot') {
        console.warn(`[AUDIO] Missing buffer for ${type}, ignoring.`);
        return;
    }

    if (type === 'shoot_bolt') { osc.type = 'triangle'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.15); gain.gain.setValueAtTime(vol, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15); osc.start(now); osc.stop(now + 0.15); }
    else if (type === 'shoot_fire') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(50, now + 0.3); gain.gain.setValueAtTime(vol, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3); osc.start(now); osc.stop(now + 0.3); }
    else if (type === 'hit') { osc.type = 'square'; osc.frequency.setValueAtTime(150, now); osc.frequency.exponentialRampToValueAtTime(40, now + 0.1); gain.gain.setValueAtTime(vol, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1); osc.start(now); osc.stop(now + 0.1); }
    else if (type === 'jump') { osc.type = 'sine'; osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(300, now + 0.2); gain.gain.setValueAtTime(vol, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.2); osc.start(now); osc.stop(now + 0.2); }
    else if (type === 'heal') { osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.linearRampToValueAtTime(800, now + 0.5); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.5); osc.start(now); osc.stop(now + 0.5); }
    else if (type === 'swing') { osc.type = 'triangle'; osc.frequency.setValueAtTime(300, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.2); gain.gain.setValueAtTime(0.05, now); gain.gain.linearRampToValueAtTime(0.01, now + 0.2); osc.start(now); osc.stop(now + 0.2); }
    else if (type === 'swing_heavy') {
        const osc2 = audioCtx.createOscillator(); osc2.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now); osc.frequency.linearRampToValueAtTime(50, now + 0.3);
        osc2.frequency.setValueAtTime(160, now); osc2.frequency.linearRampToValueAtTime(60, now + 0.3);
        osc2.connect(gain);
        gain.gain.setValueAtTime(vol * 1.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc2.start(now); osc.stop(now + 0.3); osc2.stop(now + 0.3);
    }
    else if (type === 'whirlwind') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now); osc.frequency.linearRampToValueAtTime(400, now + 0.25); osc.frequency.linearRampToValueAtTime(100, now + 0.5);
        gain.gain.setValueAtTime(vol, now); gain.gain.linearRampToValueAtTime(vol, now + 0.4); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    }
    else if (type === 'step') {
        osc.type = 'triangle';
        const pitch = 80 + Math.random() * 20;
        osc.frequency.setValueAtTime(pitch, now); osc.frequency.exponentialRampToValueAtTime(pitch * 0.5, now + 0.08);
        gain.gain.setValueAtTime(vol * 0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now); osc.stop(now + 0.08);
    }
}

// === CASTING SOUND SYSTEM (Synthesized) ===
function playCastingSound(playerObj) {
    if (!audioEnabled || !audioCtx) return;
    // Check distance for remote players
    if (playerObj !== undefined && playerObj.mesh) {
        const dist = playerMesh.position.distanceTo(playerObj.mesh.position);
        if (dist > 150) return; // Too far
    }

    stopCastingSound(playerObj); // Stop existing

    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // Osc 1: Sine (Morbido - Base tone)
    osc.type = 'sine';
    osc.frequency.setValueAtTime(80, now); // LOW PITCH START
    osc.frequency.exponentialRampToValueAtTime(250, now + 2.5); // Rising pitch 80->250Hz (Less annoying)

    // Osc 2: Sawtooth (Croccante - Texture)
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(82, now); // Slightly detuned
    osc2.frequency.exponentialRampToValueAtTime(255, now + 2.5);

    // Mix (Low volume for texture)
    const splitter = audioCtx.createChannelMerger(2);
    osc.connect(gain);
    // Sawtooth at lower volume
    const gainSaw = audioCtx.createGain();
    gainSaw.gain.value = 0.15; // Mix 15% saw
    osc2.connect(gainSaw);
    gainSaw.connect(gain);

    gain.connect(audioCtx.destination);

    // Volume Envelope
    const baseVol = 0.1 * masterVolume; // Apply Master Volume
    let finalVol = baseVol;
    if (playerObj && playerObj.mesh) {
        const dist = playerMesh.position.distanceTo(playerObj.mesh.position);
        if (dist > 0) finalVol = baseVol * (1 - Math.min(1, dist / 150));
    }

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(finalVol, now + 0.3); // Fade in

    // Constant rising pitch... if hold longer than 2.5s, it stays high

    osc.start(now);
    osc2.start(now);

    playerObj.castingSound = { osc, osc2, gain, gainSaw };
}

function stopCastingSound(playerObj) {
    if (!playerObj || !playerObj.castingSound) return;
    if (!audioCtx) return;

    try {
        const { osc, osc2, gain } = playerObj.castingSound;
        const now = audioCtx.currentTime;

        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15); // Quick Fade out

        osc.stop(now + 0.15);
        osc2.stop(now + 0.15);

        // Disconnect after stop
        setTimeout(() => {
            osc.disconnect();
            osc2.disconnect();
            gain.disconnect();
        }, 200);

    } catch (e) { console.warn("[AUDIO] Stop error", e); }

    playerObj.castingSound = null;
}

// Global Exports
window.playCastingSound = playCastingSound;
window.stopCastingSound = stopCastingSound;

function init() {
    scene = new THREE.Scene();

    // Background semplice per performance
    scene.background = new THREE.Color(0x2a2a3a);
    scene.fog = new THREE.Fog(0x2a2a3a, 150, 600); // Fog più aggressiva per nascondere pop-in

    // FIX: Near plane aumentato a 0.1 per risolvere Z-fighting (tremolio)
    // Le braccia sono molto vicine, serve un valore bassissimo
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    scene.add(camera); // IMPORTANT: Add camera to scene so its children are rendered
    createPlayer(); createSword(); createStaff(); createShield(); createBow();

    // Luci ottimizzate per FPS - ridotte al minimo
    const ambientLight = new THREE.AmbientLight(0x888899, 1.2); // Solo ambient per performance
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
    dirLight.position.set(150, 250, 100);
    dirLight.castShadow = false; // Ombre disabilitate per FPS
    scene.add(dirLight);

    seed = WORLD_SEED; setupWorld(); setupControls(); setupUIEvents();
    renderer = new THREE.WebGLRenderer({
        antialias: true, // FIX: Enable antialias to reduce shimmering/frying
        powerPreference: 'high-performance',
        precision: 'mediump',
        alpha: false,
        stencil: false,
        depth: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // FIX: Use device pixel ratio for sharpness
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = false;
    renderer.sortObjects = false;

    // Compatibilità con versioni diverse di THREE.js
    if (THREE.REVISION >= 150) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
    } else {
        renderer.gammaOutput = true;
        renderer.gammaFactor = 2.2;
    }
    console.log('[RENDERER] THREE.js r' + THREE.REVISION + ' inizializzato');
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '1';
    document.body.appendChild(renderer.domElement);
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
    checkLogin(); toggleWeapon(true); updateActionBarUI(); initKeybindsUI();

    // Sincronizza le variabili globali dal menu
    if (typeof window.myUsername !== 'undefined') {
        myUsername = window.myUsername;
    }
    if (typeof window.myGameMode !== 'undefined') {
        myGameMode = window.myGameMode;
    }
    if (typeof window.myTeamColor !== 'undefined') {
        myTeamColor = window.myTeamColor;
        console.log('[INIT] Synced myTeamColor:', myTeamColor.toString(16));
        updatePlayerColor(); // Aggiorna il colore del player dopo la sincronizzazione
    }
    if (typeof window.myTeam !== 'undefined') {
        myTeam = window.myTeam;
        console.log('[INIT] Synced myTeam:', myTeam);
    }
    if (typeof window.isPvEMode !== 'undefined') {
        isPvEMode = window.isPvEMode;
        console.log("init(): isPvEMode sincronizzata a", isPvEMode);
    }

    // Inizializza il mostro PvE se in modalità PvE
    if (isPvEMode) {
        console.log("init(): Creazione mostro PvE...");
        createAIMonster();
    }

    // Inizializza il mostro PvE se in modalità PvE
    if (isPvEMode) {
        console.log("init(): Creazione mostro PvE...");
        createAIMonster();
    }

    initAudioBuffers(); // Load sound files

    animate();
}















































window.performConversion = performConversion;





function updateActionBarUI() { document.querySelectorAll('.action-slot').forEach(el => el.classList.remove('active')); if (weaponMode === 'ranged') document.getElementById(`slot-${currentSpell}`).classList.add('active'); else if (weaponMode === 'melee') document.getElementById('slot-q').classList.add('active'); else if (weaponMode === 'bow') document.getElementById('slot-e').classList.add('active'); }
function updateStaffColor(id) { if (!staffContainer || !staffContainer.userData.gem) return; const colors = [0xffffff, 0x00ffff, 0xffffff, 0xff6600, 0xaa00ff]; staffContainer.userData.gem.material.color.setHex(colors[id]); }
function getStaffTip() { const vec = new THREE.Vector3(); if (staffContainer?.userData.gem) staffContainer.userData.gem.getWorldPosition(vec); else vec.copy(playerMesh.position).add(new THREE.Vector3(0, 5, 0)); return vec; }















function startBlocking() {
    if (weaponMode !== 'melee' || isBlocking || playerStats.stamina < 5) return;
    isBlocking = true;
    document.getElementById('block-text').style.display = 'block';
    if (socket) socket.emit('playerBlock', true);
}
function stopBlocking() {
    if (!isBlocking) return;
    isBlocking = false;
    document.getElementById('block-text').style.display = 'none';
    if (socket) socket.emit('playerBlock', false);
}





function addToLog(msg, typeClass) { const log = document.getElementById('log'); const entry = document.createElement('div'); entry.className = 'log-entry ' + (typeClass || ''); entry.innerText = msg; log.prepend(entry); if (log.children.length > 8) log.lastChild.remove(); }

function respawnPlayer() {
    // Track death for statistics
    matchStats.deaths++;
    isSpectating = false;
    spectateTarget = null;

    // Resetta le statistiche del giocatore
    playerStats.hp = playerStats.maxHp;
    playerStats.mana = playerStats.maxMana;
    playerStats.stamina = playerStats.maxStamina;
    playerStats.isDead = false;
    playerStats.isFalling = false;

    // Determina la posizione di respawn in base alla modalità
    let spawnPos = getSpawnPosition();
    playerMesh.position.copy(spawnPos);
    velocity.set(0, 0, 0);

    // Resetta tutti i flag di movimento
    moveForward = false;
    moveBackward = false;
    moveLeft = false;
    moveRight = false;
    isSprinting = false;
    canJump = true;

    // Resetta lo stato di combattimento
    isAttacking = false;
    attackTimer = 0;
    isBlocking = false;

    // FIX: Hard Animation Reset on Respawn
    try {
        if (typeof window.resetKnightAnimations === 'function') {
            window.resetKnightAnimations();
        }
        // FIX: Reset Casting UI
        if (typeof window.resetCastingState === 'function') {
            window.resetCastingState();
        }
    } catch (e) {
        console.error('[RESPAWN] Error resetting animations/casting:', e);
    }

    // Mostra il messaggio
    document.getElementById('message').style.display = 'none';

    // FIX: NON usare traverse che rende visibile TUTTO il low-poly!
    // Usa toggleWeapon per gestire correttamente la visibilità in base alla modalità
    // playerMesh.visible sarà gestito da toggleWeapon in base a weaponMode

    // Forza aggiornamento visibilità corretta in base alla modalità attuale
    toggleWeapon(true);

    console.log('[CLIENT] respawnPlayer - weaponMode:', weaponMode, 'isDead:', playerStats.isDead);

    // Notifica il server del respawn e richiedi lo stato aggiornato di tutti i player
    if (socket && socket.connected) {
        socket.emit('playerRespawned', {
            position: playerMesh.position,
            rotation: playerMesh.rotation,
            hp: playerStats.hp,
            isDead: false // ESPLICITA che NON siamo più morti
        });
        socket.emit('requestPosition'); // Richiedi posizioni aggiornate
    }

    // Aggiorna l'UI
    updateUI();

    addToLog('Sei rinato!', 'heal');

    // Riattiva il pointer lock
    setTimeout(() => {
        try {
            const promise = document.body.requestPointerLock();
            if (promise && typeof promise.catch === 'function') {
                promise.catch(e => console.log('Pointer lock non attivato'));
            }
        } catch (e) {
            console.log('Errore pointer lock:', e);
        }
    }, 100);
}

// Ottieni la posizione di spawn per la squadra
function getSpawnPosition() {
    const team = window.myTeam;

    if (team) {
        // Spawn nelle zone colorate per le squadre
        const teamSpawns = {
            red: { x: -300, z: -300 },
            black: { x: 300, z: -300 },
            green: { x: -300, z: 300 },
            purple: { x: 300, z: 300 }
        };

        const spawn = teamSpawns[team];
        if (spawn) {
            // Aggiungi variazione casuale entro 30 unità dal centro
            const offsetX = (Math.random() - 0.5) * 60;
            const offsetZ = (Math.random() - 0.5) * 60;
            return new THREE.Vector3(spawn.x + offsetX, 6, spawn.z + offsetZ);
        }
    }

    // Fallback: spawn al centro se squadra non definita
    return new THREE.Vector3(0, 6, 0);
}

function setupUIEvents() {
    document.getElementById('reset-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.target.blur(); // Rimuovi focus dal pulsante

        // APPLICA PENALITÀ PER RESPAWN MANUALE (-1 al team)
        if (myTeam) {
            updateTeamScore(myTeam, -1);
            addToLog("Respawn tattico! -1 Punto", "death");
            // Notifica gli altri per aggiornare il punteggio
            if (socket) socket.emit('remoteEffect', { type: 'score_penalty', team: myTeam });
        }

        respawnPlayer();
    });
    document.getElementById('keybinds-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        console.log('TASTI button clicked');
        // Chiudi TUTTI gli altri modali
        const gamemodal = document.getElementById('gamemode-modal');
        const loginmodal = document.getElementById('login-modal');
        const keybindsPanel = document.getElementById('keybinds-panel');

        if (gamemodal) gamemodal.style.display = 'none';
        if (loginmodal) loginmodal.style.display = 'none';

        // Apri il pannello tasti
        if (keybindsPanel) {
            keybindsPanel.style.display = 'block';
            console.log('Keybinds panel opened');
            initKeybindsUI();
        }
        document.exitPointerLock();
    });
    document.getElementById('audio-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleAudio(); });
    // Volume Slider Listener
    const volSlider = document.getElementById('volume-slider');
    if (volSlider) {
        volSlider.addEventListener('input', (e) => {
            masterVolume = e.target.value / 100;
        });
        // Prevent pointer lock when clicking slider
        volSlider.addEventListener('mousedown', (e) => e.stopPropagation());
        volSlider.addEventListener('click', (e) => e.stopPropagation());
    }

    document.getElementById('close-keybinds').addEventListener('click', (e) => {
        e.stopPropagation();
        const keybindsPanel = document.getElementById('keybinds-panel');
        if (keybindsPanel) {
            keybindsPanel.style.display = 'none';
        }

        // Riattiva il pointer lock solo se il menu principale è nascosto (gioco attivo)
        const mainMenu = document.getElementById('main-menu');
        const isInMenu = mainMenu && mainMenu.style.display !== 'none';

        if (!isInMenu) {
            setTimeout(() => {
                try {
                    const promise = document.body.requestPointerLock();
                    if (promise && typeof promise.catch === 'function') {
                        promise.catch(err => console.log('Pointer lock non attivato'));
                    }
                } catch (e) {
                    console.log('Errore pointer lock:', e);
                }
            }, 100);
        }
    });
}
function setupControls() {
    document.addEventListener('pointerlockchange', () => {
        // Non fare nulla quando perdi il pointer lock - mantieni il gioco attivo
    });
    document.addEventListener('keydown', (e) => {
        // Se la chat è attiva, ignora tutti i comandi tranne Enter per aprire la chat
        if (isChatFocused) return;

        // Enter per aprire la chat
        if (e.code === 'Enter') {
            chatInput.focus();
            return;
        }

        // Previeni chiusura browser con Ctrl+W
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'w') {
            e.preventDefault();
        }

        // Gestione Tasto Unlock Dinamico (Alt, Ctrl, ecc.)
        if (e.code === KEYBINDS.UNLOCK_MOUSE) {
            e.preventDefault(); // Previeni focus menu browser
            if (!isCtrlPressed) { // Previeni attivazione multipla
                isCtrlPressed = true;
                // Esci dal pointer lock per permettere il movimento del mouse
                if (document.pointerLockElement === document.body) {
                    document.exitPointerLock();
                }
            }
            return;
        }

        if (keyToRebind || playerStats.isDead) return;
        if (e.code === 'KeyH') {
            showHitboxes = !showHitboxes;
            addToLog(`Hitboxes: ${showHitboxes ? 'ON' : 'OFF'}`, '#FFA500');
            if (!showHitboxes) {
                // Cleanup immediately
                hitboxHelpers.forEach(helper => scene.remove(helper));
                hitboxHelpers.length = 0;
            }
        }
        switch (e.code) {
            case KEYBINDS.MOVE_FORWARD: moveForward = true; break; case KEYBINDS.MOVE_LEFT: moveLeft = true; break; case KEYBINDS.MOVE_BACKWARD: moveBackward = true; break; case KEYBINDS.MOVE_RIGHT: moveRight = true; break;
            case KEYBINDS.JUMP:
                const now = performance.now();
                if (!isJumpKeyPressed && canJump && (now - lastJumpTime > SETTINGS.jumpCooldown) && playerStats.stamina >= SETTINGS.jumpCost) {
                    velocity.y += SETTINGS.jumpForce; playerStats.stamina -= SETTINGS.jumpCost; lastJumpTime = now; canJump = false; isJumpKeyPressed = true;

                    // DYNAMIC JUMP IMPULSE (Forward Momentum)
                    if (moveForward) {
                        // Apply extra forward force if moving forward
                        // Run: 100, Walk: 50 (Further reduced)
                        // Works in all modes (Melee, Block, Ranged, Bow)
                        const impulse = isSprinting ? 100 : 50;
                        const rotY = playerMesh.rotation.y;
                        velocity.x -= Math.sin(rotY) * impulse;
                        velocity.z -= Math.cos(rotY) * impulse;
                    }
                }
                break;
            case KEYBINDS.SPRINT: isSprinting = true; break;
            case KEYBINDS.WEAPON_SWITCH:
                // Se sono già in Melee, faccio il Whirlwind
                if (weaponMode === 'melee') {
                    performWhirlwind();
                } else {
                    // Altrimenti passo alla modalità Melee
                    weaponMode = 'melee';
                    toggleWeapon(true);
                }
                break;
            case KEYBINDS.BOW_EQUIP:
                // Select Bow directly
                if (weaponMode !== 'bow') { weaponMode = 'bow'; toggleWeapon(true); }
                break;
            case KEYBINDS.HEAL: performHeal(); break;
            case KEYBINDS.BLOCK: // Handle Keyboard Block
                if (weaponMode === 'ranged' || weaponMode === 'bow') {
                    weaponMode = 'melee'; toggleWeapon(true);
                }
                startBlocking();
                break;
            case 84: // T key - Toggle spectator (when dead)
                if (playerStats.isDead) toggleSpectator();
                break;
            case 188: // < key - Previous spectate target
                if (isSpectating) cycleSpectate(-1);
                break;
            case 190: // > key - Next spectate target
                if (isSpectating) cycleSpectate(1);
                break;
            case 72: // H key - Show match history
                showMatchStats();
                break;
            case 114: // F3 key - Toggle hitbox debug visualization
                showHitboxes = !showHitboxes;
                addToLog(`Debug Hitbox: ${showHitboxes ? 'ON' : 'OFF'}`, showHitboxes ? '#00ff00' : '#ff0000');
                if (!showHitboxes) {
                    // Rimuovi tutti gli helper visuali
                    hitboxHelpers.forEach(helper => scene.remove(helper));
                    hitboxHelpers.length = 0;
                }
                break;
            case KEYBINDS.SPELL_1: selectSpell(1); startCasting(1, 'attack', 'Digit1'); break; case KEYBINDS.SPELL_2: selectSpell(2); startCasting(2, 'attack', 'Digit2'); break;
            case KEYBINDS.SPELL_3: selectSpell(3); startCasting(3, 'attack', 'Digit3'); break; case KEYBINDS.SPELL_4: selectSpell(4); startCasting(4, 'attack', 'Digit4'); break;
            case KEYBINDS.CONVERT_1: performConversion(1); break; case KEYBINDS.CONVERT_2: performConversion(2); break; case KEYBINDS.CONVERT_3: performConversion(3); break;
            case KEYBINDS.BLOCK:
                if (weaponMode === 'ranged' || weaponMode === 'bow') {
                    weaponMode = 'melee'; toggleWeapon(true);
                }
                startBlocking();
                break;
        }
    });
    document.addEventListener('keyup', (e) => {
        // Gestione rilascio Tasto Unlock (default Ctrl)
        if (e.code === KEYBINDS.UNLOCK_MOUSE) {
            if (isCtrlPressed) { // Solo se era effettivamente premuto
                isCtrlPressed = false;
                // Rientra nel pointer lock se il giocatore non è morto
                const mainMenu = document.getElementById('main-menu');
                const keybindsPanel = document.getElementById('keybinds-panel');
                const isMenuVisible = mainMenu && mainMenu.style.display !== 'none';
                const isPanelVisible = keybindsPanel && keybindsPanel.style.display === 'block';

                if (!playerStats.isDead && document.pointerLockElement !== document.body && !isMenuVisible && !isPanelVisible) {
                    setTimeout(() => {
                        if (!isCtrlPressed && !playerStats.isDead && document.pointerLockElement !== document.body) {
                            try {
                                document.body.requestPointerLock();
                            } catch (err) {
                                console.log('Pointer lock error:', err);
                            }
                        }
                    }, 150);
                }
            }
            return;
        }

        if (keyToRebind || playerStats.isDead) return;

        // Reset flag salto quando Space viene rilasciato
        if (e.code === KEYBINDS.JUMP) {
            isJumpKeyPressed = false;
        }

        switch (e.code) {
            case KEYBINDS.MOVE_FORWARD: moveForward = false; break; case KEYBINDS.MOVE_LEFT: moveLeft = false; break; case KEYBINDS.MOVE_BACKWARD: moveBackward = false; break; case KEYBINDS.MOVE_RIGHT: moveRight = false; break; case KEYBINDS.SPRINT: isSprinting = false; break;
            case KEYBINDS.SPELL_1: stopCasting('Digit1'); break; case KEYBINDS.SPELL_2: stopCasting('Digit2'); break; case KEYBINDS.SPELL_3: stopCasting('Digit3'); break; case KEYBINDS.SPELL_4: stopCasting('Digit4'); break;
            case KEYBINDS.BLOCK: stopBlocking(); break;
        }
    });
    document.body.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body && !playerStats.isDead) {
            euler.y -= e.movementX * 0.002 * mouseSensitivity;
            euler.x -= e.movementY * 0.002 * mouseSensitivity;

            // Fix Camera Flip: Restrict look-down angle in Melee logic
            // -1.57 is full down. -1.0 is about 60 degrees down.
            const minPitch = (weaponMode === 'melee' || isBlocking) ? -1.0 : -1.55;

            euler.x = Math.max(minPitch, Math.min(1.55, euler.x));
            playerMesh.rotation.y = euler.y;
        }
    });

    document.addEventListener('mousedown', (e) => {
        if (currentBindingAction) return; // Don't trigger game actions while rebinding
        if (document.pointerLockElement === document.body && !playerStats.isDead) {
            const code = 'Mouse' + e.button;

            // Check implicit defaults or bindings
            if (code === KEYBINDS.BLOCK) {
                if (weaponMode === 'ranged' || weaponMode === 'bow') {
                    weaponMode = 'melee'; toggleWeapon(true);
                }
                startBlocking();
            } else if (e.button === 0) { // Left Click (Mouse0) is always Attack for now unless bound otherwise?
                // For simplicity, Mouse0 is HARD Attack unless rebound?
                // User said "if I bind a key...". 
                // Let's check bindings first.
                // But Attack isn't in KEYBINDS yet.
                // Assuming defaults: 
                if (weaponMode === 'ranged') { startCasting(currentSpell, 'attack', 'Mouse'); }
                else if (weaponMode === 'bow') { startCasting(null, 'bow_shot', 'Mouse'); }
                else { performAttack(); }
            } else if (e.button === 2 && KEYBINDS.BLOCK !== 'Mouse2') {
                // If user UNBOUND Mouse2 from Block, do nothing? Or keep legacy behavior? 
                // User said "Bind block... currently right mouse". 
                // New logic: Only do what is bound.
                // So if BLOCK is Mouse2, it triggers above.
                // If NOT, we do nothing here.
            }
        }
    });
    document.addEventListener('mouseup', (e) => {
        if (!playerStats.isDead) {
            const code = 'Mouse' + e.button;
            if (code === KEYBINDS.BLOCK) stopBlocking();

            if (e.button === 0) {
                if (weaponMode === 'ranged') stopCasting('Mouse');
                if (weaponMode === 'bow') stopCasting('Mouse');
            }
        }
    });
}
function resetGame() {
    saveMatchStats();
    location.reload();
}

// Lag Compensation - Client-side prediction
function updatePositionBuffer(playerId, position, timestamp) {
    if (!positionBuffer[playerId]) positionBuffer[playerId] = [];
    positionBuffer[playerId].push({ pos: position.clone(), time: timestamp });
    // Keep only last 500ms of positions
    const cutoff = Date.now() - 500;
    positionBuffer[playerId] = positionBuffer[playerId].filter(p => p.time > cutoff);
}

// Export for network.js and player.js
window.updatePositionBuffer = updatePositionBuffer;
window.interpolatePosition = interpolatePosition;

function interpolatePosition(playerId) {
    const buffer = positionBuffer[playerId];
    if (!buffer || buffer.length < 2) return null;

    const renderTime = Date.now() - INTERPOLATION_DELAY;
    let i = 0;
    while (i < buffer.length - 1 && buffer[i + 1].time <= renderTime) i++;

    if (i >= buffer.length - 1) return buffer[buffer.length - 1].pos;

    const p1 = buffer[i], p2 = buffer[i + 1];
    const t = (renderTime - p1.time) / (p2.time - p1.time);
    return p1.pos.clone().lerp(p2.pos, t);
}

// LOD System
function updateLOD() {
    if (!playerMesh || !camera) return;
    lodObjects.forEach(obj => {
        const dist = obj.position.distanceTo(camera.position);
        if (dist < LOD_DISTANCES.HIGH) {
            if (obj.userData.highDetail) obj.userData.highDetail.visible = true;
            if (obj.userData.lowDetail) obj.userData.lowDetail.visible = false;
        } else if (dist < LOD_DISTANCES.MEDIUM) {
            if (obj.userData.highDetail) obj.userData.highDetail.visible = false;
            if (obj.userData.lowDetail) obj.userData.lowDetail.visible = true;
        } else {
            if (obj.userData.highDetail) obj.userData.highDetail.visible = false;
            if (obj.userData.lowDetail) obj.userData.lowDetail.visible = false;
        }
    });
}

// Spectator Mode
function toggleSpectator() {
    if (!playerStats.isDead) return;
    isSpectating = !isSpectating;
    if (isSpectating) {
        const players = Object.values(otherPlayers);
        if (players.length > 0) {
            spectateIndex = 0;
            spectateTarget = players[0];
            showFloatingText('SPECTATING: ' + spectateTarget.mesh.userData.username, camera.position, 0xffffff, 2000);
        }
    }
}

function cycleSpectate(direction) {
    if (!isSpectating) return;
    const players = Object.values(otherPlayers).filter(p => !p.isDead);
    if (players.length === 0) return;
    spectateIndex = (spectateIndex + direction + players.length) % players.length;
    spectateTarget = players[spectateIndex];
    showFloatingText('SPECTATING: ' + spectateTarget.mesh.userData.username, camera.position, 0xffffff, 1500);
}

// Match Statistics
function saveMatchStats() {
    const duration = Math.floor((Date.now() - matchStats.startTime) / 1000);
    const kd = matchStats.deaths > 0 ? (matchStats.kills / matchStats.deaths).toFixed(2) : matchStats.kills;
    const acc = matchStats.accuracy.shots > 0 ? ((matchStats.accuracy.hits / matchStats.accuracy.shots) * 100).toFixed(1) : 0;

    const match = {
        date: new Date().toISOString(),
        duration: duration,
        kills: matchStats.kills,
        deaths: matchStats.deaths,
        kd: kd,
        damage: matchStats.damage,
        healing: matchStats.healing,
        accuracy: acc + '%',
        team: myTeam
    };

    matchStats.matchHistory.unshift(match);
    if (matchStats.matchHistory.length > 50) matchStats.matchHistory.pop();
    localStorage.setItem('ragequit_match_history', JSON.stringify(matchStats.matchHistory));
}

function showMatchStats() {
    console.log('=== MATCH STATISTICS ===');
    console.log('K/D:', matchStats.kills + '/' + matchStats.deaths);
    console.log('Damage:', matchStats.damage);
    console.log('Healing:', matchStats.healing);
    console.log('Accuracy:', matchStats.accuracy.shots > 0 ? ((matchStats.accuracy.hits / matchStats.accuracy.shots) * 100).toFixed(1) + '%' : '0%');
    console.log('Match History (last 10):');
    matchStats.matchHistory.slice(0, 10).forEach((m, i) => {
        console.log(`${i + 1}. ${m.date} | K/D: ${m.kd} | Acc: ${m.accuracy} | Duration: ${m.duration}s`);
    });
}
function updateUI() {
    document.getElementById('hp-bar').style.width = `${(playerStats.hp / playerStats.maxHp) * 100}%`;
    document.getElementById('mana-bar').style.width = `${(playerStats.mana / playerStats.maxMana) * 100}%`;
    document.getElementById('stamina-bar').style.width = `${(playerStats.stamina / playerStats.maxStamina) * 100}%`;

    document.getElementById('hp-value').textContent = `${Math.round(playerStats.hp)}/${playerStats.maxHp}`;
    document.getElementById('mana-value').textContent = `${Math.round(playerStats.mana)}/${playerStats.maxMana}`;
    document.getElementById('stamina-value').textContent = `${Math.round(playerStats.stamina)}/${playerStats.maxStamina}`;

    const now = performance.now();
    const gcdProgress = Math.max(0, (SETTINGS.fireRate - (now - lastAttackTime)) / SETTINGS.fireRate);
    if (weaponMode === 'ranged') { for (let i = 1; i <= 4; i++) { const el = document.querySelector(`#slot-${i} .cooldown-overlay`); if (el) el.style.height = (gcdProgress * 100) + '%'; } }
    const wwProgress = Math.max(0, (SETTINGS.whirlwindCooldown - (now - lastWhirlwindTime)) / SETTINGS.whirlwindCooldown);
    const wwOverlay = document.querySelector('#slot-q .cooldown-overlay'); if (wwOverlay) wwOverlay.style.height = (wwProgress * 100) + '%';
    const spikesProgress = Math.max(0, (SETTINGS.spikesCooldown - (now - lastSpikesTime)) / SETTINGS.spikesCooldown);
    const spikesOverlay = document.getElementById('spikes-cd'); if (spikesOverlay) spikesOverlay.style.height = (spikesProgress * 100) + '%';
    const healProgress = Math.max(0, (SETTINGS.healCooldown - (now - lastHealTime)) / SETTINGS.healCooldown);
    const healOverlay = document.getElementById('heal-cd'); if (healOverlay) healOverlay.style.height = (healProgress * 100) + '%';
    const convProgress = Math.max(0, (SETTINGS.conversionCooldown - (now - lastConversionTime)) / SETTINGS.conversionCooldown);
    ['conv1-cd', 'conv2-cd', 'conv3-cd'].forEach(id => { const el = document.getElementById(id); if (el) el.style.height = (convProgress * 100) + '%'; });
}
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    // FIX: Cap delta time to prevent physics/animation explosions on lag spikes
    let delta = (time - prevTime) / 1000;
    if (delta > 0.1) delta = 0.1; // Max 0.1s (10 FPS)
    prevTime = time;

    // FPS Counter
    fpsFrames++;
    if (time - fpsLastTime >= 1000) {
        currentFPS = fpsFrames;
        fpsFrames = 0;
        fpsLastTime = time;
        document.getElementById('fps-counter').innerText = 'FPS: ' + currentFPS;
    }

    // Spectator camera
    if (isSpectating && spectateTarget && spectateTarget.mesh) {
        camera.position.copy(spectateTarget.mesh.position).add(new THREE.Vector3(0, 10, 15));
        camera.lookAt(spectateTarget.mesh.position);
    }

    if (!playerStats.isDead && !isSpectating) {
        // SAFETY CHECK: Assicura che playerMesh sia sempre visibile quando vivo
        if (!playerMesh.visible) {
            console.warn('[GAME LOOP] playerMesh invisibile ma player vivo - FIXING');
            playerMesh.visible = true;
        }

        try {
            updatePhysics(delta);
            updateCamera(); // Moved here to fix lag
            sendPositionUpdate(); // Invia posizione ad alta frequenza
            updateProjectiles(delta); updateCasting(delta);
            if (typeof updateMeleeCombat === 'function') updateMeleeCombat(delta);
            updateParticles(delta); // Aggiorna particelle (sangue, gibs, ecc)
            updateConversions(delta); updateFloatingTexts(delta);
            updateSwordAnimation(delta);

            // Aggiorna il mostro IA se in modalità PvE
            if (isPvEMode && aiMonster) {
                updateAIMonster(delta);
            }

            // Update animations for other players (Knight model)
            if (typeof updateOtherPlayersAnimations === 'function') {
                updateOtherPlayersAnimations(delta);
            }
        } catch (e) { console.error(e); }
        // updateCamera(); // Previously here
    }

    // Update LOD every 5 frames for performance
    if (frameCount % 5 === 0) updateLOD();

    // DEBUG: Visualizza hitbox se attivo
    if (showHitboxes) {
        updateHitboxVisualization();
    }

    if (typeof updateCastingEffects === 'function') {
        updateCastingEffects(delta);
    }

    updateAnimations(delta);
    frameCount++;
    if (frameCount % 2 === 0) updateUI(); // Aggiorna UI ogni 2 frame per performance
    renderer.render(scene, camera);
}

// DEBUG: Funzione per visualizzare le hitbox dei giocatori e proiettili
function updateHitboxVisualization() {
    // Rimuovi vecchi helper
    hitboxHelpers.forEach(helper => scene.remove(helper));
    hitboxHelpers.length = 0;

    // Visualizza hitbox del giocatore locale
    if (playerMesh && !playerStats.isDead) {
        const hbGroup = new THREE.Group();

        // 1. Body Cylinder (Feet to Shoulders)
        // Height: 11.5, Radius: 4.5
        const bodyGeo = new THREE.CylinderGeometry(4.5, 4.5, 11.5, 16, 1, true);
        const bodyMesh = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.5 }));
        // Pivot Y=0 is center of player (approx waist). Feet are -6.
        // Body goes from -6 to 5.5. Center = -0.25
        bodyMesh.position.y = -0.25;
        hbGroup.add(bodyMesh);

        // 2. Head Cone (Shoulders to Top)
        // Height: 4.0 (15.5 - 11.5), Radius: 4.5 -> 2.5
        const headGeo = new THREE.CylinderGeometry(2.5, 4.5, 4.0, 16, 1, true);
        const headMesh = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true, transparent: true, opacity: 0.5 }));
        // Head goes from 5.5 to 9.5. Center = 7.5
        headMesh.position.y = 7.5;
        hbGroup.add(headMesh);

        hbGroup.position.copy(playerMesh.position);
        scene.add(hbGroup);
        hitboxHelpers.push(hbGroup);
    }

    // Visualizza hitbox degli altri giocatori
    Object.values(otherPlayers).forEach(op => {
        if (op.mesh) {
            const hbGroup = new THREE.Group();

            // 1. Body Cylinder
            const bodyGeo = new THREE.CylinderGeometry(4.5, 4.5, 11.5, 16, 1, true);
            const bodyMesh = new THREE.Mesh(bodyGeo, new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 }));
            bodyMesh.position.y = -0.25;
            hbGroup.add(bodyMesh);

            // 2. Head Cone
            const headGeo = new THREE.CylinderGeometry(2.5, 4.5, 4.0, 16, 1, true);
            const headMesh = new THREE.Mesh(headGeo, new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 }));
            headMesh.position.y = 7.5;
            hbGroup.add(headMesh);

            hbGroup.position.copy(op.mesh.position);
            scene.add(hbGroup);
            hitboxHelpers.push(hbGroup);
        }
    });

    // Visualizza hitbox dei proiettili
    projectiles.forEach(proj => {
        const projHitbox = new THREE.Mesh(
            new THREE.SphereGeometry(proj.userData.radius || 2, 8, 8),
            new THREE.MeshBasicMaterial({
                color: proj.userData.isMine ? 0x00ffff : 0xff00ff,
                wireframe: true,
                transparent: true,
                opacity: 0.7
            })
        );
        projHitbox.position.copy(proj.position);
        scene.add(projHitbox);
        hitboxHelpers.push(projHitbox);

        // Mostra anche il ray di collisione (linea dal frame precedente a quello corrente)
        if (proj.userData.prevPosition) {
            const points = [proj.userData.prevPosition.clone(), proj.position.clone()];
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const lineMaterial = new THREE.LineBasicMaterial({
                color: proj.userData.isMine ? 0x00ffff : 0xff00ff,
                transparent: true,
                opacity: 0.5
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            scene.add(line);
            hitboxHelpers.push(line);
        }
    });

    // Visualizza hitbox del mostro AI se presente
    if (isPvEMode && aiMonster && aiMonster.mesh && aiMonster.state !== 'dead') {
        const monsterHitbox = new THREE.Mesh(
            new THREE.CylinderGeometry(12, 12, 20, 16, 1, true),
            new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true, transparent: true, opacity: 0.5 })
        );
        monsterHitbox.position.copy(aiMonster.mesh.position);
        monsterHitbox.position.y += 10;
        scene.add(monsterHitbox);
        hitboxHelpers.push(monsterHitbox);
    }
}

// Non inizializzare subito - aspetta che menu.js chiami startGame()
// init();