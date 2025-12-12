// world.js - Sistema mappa SQUADRE

function setupWorld() {
    // Crea solo mappa team
    createTeamMap();
    createSky(); // VISUAL UPGRADE: Visible Moon & Stars
}

// MAPPA SQUADRE - 4 zone colorate per ogni team
// MAPPA SQUADRE - 4 zone colorate per ogni team
function createTeamMap() {
    console.log('[WORLD] Loading MEDIEVAL MAP (GLB)...');

    // 1. Pavimento di sicurezza (Collider Invisibile) per evitare cadute nel vuoto
    const safetyFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(5000, 5000),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    safetyFloor.rotation.x = -Math.PI / 2;
    safetyFloor.position.y = -0.1; // Appena sotto lo zero
    scene.add(safetyFloor);
    obstacles.push(safetyFloor);

    // 2. Carica il GLB
    const loader = new THREE.GLTFLoader();

    loader.load(`./map/fpsmaplowpoly.glb?v=${Date.now()}`, (gltf) => {
        const mapModel = gltf.scene;

        // SCALA x30 (Requested Update)
        mapModel.scale.set(30, 30, 30);
        // CENTRA
        mapModel.position.set(0, 0, 0);

        scene.add(mapModel);
        console.log('[WORLD] Map Loaded & Scaled x4');

        // 3. Generazione Collisioni (Option C: "Mesh Invisibile")
        // Analizziamo la geometria e creiamo colliders invisibili
        mapModel.traverse((child) => {
            if (child.isMesh) {
                // OPTIMIZATION: Configura la mesh visibile
                child.castShadow = true;
                child.receiveShadow = true;

                // LIGHTING: Add Lanterns/Torches to Buildings
                // DISABLED PER USER REQUEST (Performance Optimization)
                /*
                if (child.name && child.name.startsWith('Building_')) {
                    // Create Torch Light
                    // Position Note: Parent is scaled x30. 
                    // Local Y=5 becomes World Y=150.
                    const torchLight = new THREE.PointLight(0xffaa00, 0.6, 500, 2);
                    torchLight.castShadow = false; // PERFORMANCE: Ensure no shadows from these
                    torchLight.position.set(0, 5, 0);
                    child.add(torchLight);

                    // OPTIMIZATION: Track Light for Culling
                    window.mapLights = window.mapLights || [];
                    window.mapLights.push(torchLight);

                    console.log(`[LIGHTING] Added Lantern to ${child.name}`);
                }
                */

                // OPTIMIZATION: Track Building for Culling
                if (child.name && child.name.startsWith('Building_')) {
                    window.mapBuildings = window.mapBuildings || [];
                    window.mapBuildings.push(child);
                }

                // Se la texture ha trasparenza (alberi?), abilita alphaTest
                if (child.material) {
                    child.material.side = THREE.DoubleSide; // Evita buchi visivi
                    if (child.material.map) child.material.alphaTest = 0.5;
                }

                // CREA COLLIDER
                // Clona la mesh per usarla come hitbox fisica separata dalla visuale
                // Questo permette di avere visuali low-poly "pulite" ma collisioni precise
                // In questo caso usiamo la stessa geometria.
                const collider = child.clone();

                // Rendi il collider invisibile e leggero
                collider.material = new THREE.MeshBasicMaterial({
                    visible: false,
                    wireframe: true, // Debug: metti true se vuoi vedere le collisioni
                    color: 0x00ff00
                });

                // Importante: le trasformazioni locali sono preservate dal clone, 
                // ma dobbiamo assicurarci che siano attaccate alla scena o a un parent corretto
                // Se cloniamo solo la mesh, perde il contesto del parent (mapModel).
                // Soluzione migliore: Usiamo direttamente la mesh originale come obstacle se è statica?
                // L'utente ha chiesto un mesh invisibile separata ("Opzione C").
                // Aggiungiamo il collider alla scena con le stesse trasformazioni WORLD della mesh originale.

                // Siccome mapModel è scalato, i figli ereditano la scala.
                // Se aggiungiamo 'collider' direttamente a scene, dobbiamo applicare la scala manuale.
                // Molto più semplice: Aggiungiamo i collider a un gruppo "PhysicsWorld" scalato uguale.

                // PER ORA: Semplificazione -> Aggiungiamo direttamente la child mesh originale agli obstacles?
                // No, l'utente vuole mesh invisibile.
                // Facciamo così: Aggiungiamo la mesh originale agli obstacles (funziona uguale ed è efficiente).
                // SE vuole proprio una copia distinta:
                /* 
                   const shape = new THREE.Mesh(child.geometry, new THREE.MeshBasicMaterial({visible:false}));
                   shape.position.copy(child.position);
                   shape.rotation.copy(child.rotation);
                   shape.scale.copy(child.scale);
                   // Apply parent transforms... complex for nested hierarchies.
                */

                // DECISIONE: Usiamo la mesh visibile come obstacle "invisibilmente" (nel senso che il raycaster la colpisce).
                // Non c'è bisogno di duplicare la geometria in memoria se è identica.
                // L'unica differenza è se si vuole una collisione semplificata rispetto alla visuale.
                // Dato che è un GLB "lowpoly" (presumo), usiamo direttamente l'oggetto.
                obstacles.push(child);
            }
        });

        // Setup Spawn Points specifici per questa mappa?
        // Per ora manteniamo quelli di default (getSpawnPosition in game.js cercherà +/- 300)
        // Se la mappa è x4, 300 unità dovrebbero essere ok.



    }, undefined, (error) => {
        console.error('[WORLD] Error loading map:', error);
    });
}

// SKY SYSTEM: Moon Mesh & Stars
function createSky() {
    console.log('[WORLD] Creating Sky...');

    // COORDINATE UPDATE: Center on Map (-7773, 655, -2922)
    const mapCenter = new THREE.Vector3(-7773, 655, -2922);

    // 1. THE MOON MESH
    // Position relative to map center, same direction as light
    const moonDist = 8000; // Adjusted to 8000 per user request
    // Match the new light vector from game.js (2000, 1200, 2000)
    const lightOffset = new THREE.Vector3(2000, 1200, 2000);
    const moonPos = mapCenter.clone().add(lightOffset.normalize().multiplyScalar(moonDist));

    // VISUAL FIX: Use PlaneGeometry (Billboard) instead of Sphere
    // Spheres distort 2D images. A billboard always faces the camera/map and looks perfect.
    const moonGeo = new THREE.PlaneGeometry(1600, 1600); // 2D Plane, Size increased from split

    // Load Texture
    const textureLoader = new THREE.TextureLoader();
    const moonTexture = textureLoader.load('./map/moon.webp');

    const moonMat = new THREE.MeshBasicMaterial({
        map: moonTexture,
        color: new THREE.Color(2.0, 2.0, 2.0), // HDR Color (>1.0) to verify Bloom trigger
        transparent: true,
        side: THREE.FrontSide,
        fog: false
    });
    // ALTERNATIVE: If color clamping prevents this, we use emissive map on standard material, 
    // but MeshBasic is unlit. Standard Three.js Bloom works on color > threshold.
    // Let's ensure the texture doesn't darken it too much.

    const moonMesh = new THREE.Mesh(moonGeo, moonMat);
    moonMesh.position.copy(moonPos);
    moonMesh.lookAt(mapCenter);
    scene.add(moonMesh);

    // 2. STARS
    // Starfield centered on map
    const starCount = 5000; // Increased count for larger area
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];

    // Radius must be large enough to enclose the map
    const minR = 18000;
    const maxR = 22000;

    for (let i = 0; i < starCount; i++) {
        const r = minR + Math.random() * (maxR - minR);
        const theta = 2 * Math.PI * Math.random();
        const phi = Math.acos(2 * Math.random() - 1);

        const x = mapCenter.x + r * Math.sin(phi) * Math.cos(theta);
        const y = mapCenter.y + r * Math.sin(phi) * Math.sin(theta);
        const z = mapCenter.z + r * Math.cos(phi);

        starPos.push(x, y, z);
    }

    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));

    const starMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 30, // Larger stars for distance
        sizeAttenuation: true,
        fog: false
    });

    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    console.log('[WORLD] Sky Created (Centered on Map)');
}
// Funzioni helper rimosse/commentate poiché la mappa è statica ora
function createCentralBridge() { }
function createArenaWalls() { }
function createRock() { }
function createPillar() { }
function createPineTree() { }

function createCentralBridge() {
    // Platform material
    const platformMat = new THREE.MeshLambertMaterial({ color: 0x444444 });

    // Central Walkable Platform (Height 20)
    const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(40, 2, 120),
        platformMat
    );
    bridge.position.set(0, 20, 0);
    bridge.receiveShadow = true;
    bridge.castShadow = true;
    bridge.userData.isWalkable = true; // Flag for physics
    scene.add(bridge);
    obstacles.push(bridge); // Add to obstacles for Raycast

    // Ramps (4 sides)
    const rampLength = 60;
    const rampHeight = 20; // Reaches from 0 to 20
    const rampAngle = Math.atan(rampHeight / rampLength); // Calculate exact angle

    // Helper to create ramp
    const createRamp = (x, z, rotY) => {
        // Ramp is a rotated box.
        // Math: Hypotenuse length is sqrt(L^2 + H^2)
        const hyp = Math.sqrt(rampLength * rampLength + rampHeight * rampHeight);

        const ramp = new THREE.Mesh(
            new THREE.BoxGeometry(20, 2, hyp), // Width 20
            platformMat
        );

        // Position: Needs to be centered half-way up and out
        // Trigger math for perfect alignment is tricky, simple approx:
        ramp.position.set(x, rampHeight / 2, z);
        ramp.rotation.x = -rampAngle; // Incline up

        // Pivot rotation around center of world (0,0)
        // Actually simpler: Create at origin, rotate container? 
        // Or just straightforward math since it's cardinal directions

        // Let's do explicit placement for 4 sides
    };

    // North Ramp (Negative Z)
    const rampN = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 70), platformMat);
    rampN.position.set(0, 10, -90); // Center of ramp (bridge ends at -60, ground at -120 approx)
    rampN.rotation.x = 0.32; // Approx ~18 degrees
    rampN.castShadow = true;
    rampN.receiveShadow = true;
    rampN.userData.isWalkable = true;
    scene.add(rampN); obstacles.push(rampN);

    // South Ramp (Positive Z)
    const rampS = new THREE.Mesh(new THREE.BoxGeometry(20, 2, 70), platformMat);
    rampS.position.set(0, 10, 90);
    rampS.rotation.x = -0.32;
    rampS.castShadow = true;
    rampS.receiveShadow = true;
    rampS.userData.isWalkable = true;
    scene.add(rampS); obstacles.push(rampS);

    // East/West Ramps? Maybe just 2 for now to test.
    // Let's add simple graphical pillars support
    const support = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 20), platformMat);
    support.position.set(0, 10, 0);
    scene.add(support);
}



// Crea mura circolari
function createArenaWalls(centerX, centerZ, radius, height, color) {
    const segments = 32;
    for (let i = 0; i < segments; i++) {
        let angle1 = (i / segments) * Math.PI * 2;
        let angle2 = ((i + 1) / segments) * Math.PI * 2;

        let x = centerX + Math.cos(angle1) * radius;
        let z = centerZ + Math.sin(angle1) * radius;

        const wall = new THREE.Mesh(
            new THREE.BoxGeometry(radius * 0.2, height, 3),
            new THREE.MeshLambertMaterial({
                color: color,
                emissive: color,
                emissiveIntensity: 0.2
            })
        );
        wall.position.set(x, height / 2, z);
        wall.rotation.y = angle1;
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        // Add to collisions (Universal System)
        obstacles.push(wall);
    }
}

// Crea rocce
function createRock(x, z, seedOffset) {
    const size = 4 + seedOffset * 3; // Smaller rocks (4-7 units instead of 8-16)
    const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        new THREE.MeshLambertMaterial({
            color: 0x3a3a3a
        })
    );
    rock.position.set(x, size / 2, z);
    rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    rock.castShadow = true;
    rock.receiveShadow = true;
    scene.add(rock);
    obstacles.push(rock);
}

// Crea pilastri
function createPillar(x, z, height) {
    const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(5, 6, height, 8),
        new THREE.MeshLambertMaterial({
            color: 0x2a2a2a
        })
    );
    pillar.position.set(x, height / 2, z);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    scene.add(pillar);
    // Non aggiungiamo collisioni - solo decorativi
    // obstacles.push(pillar);
}

function createPineTree(x, z, seedOffset) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(2, 4, 30, 8), new THREE.MeshLambertMaterial({ color: 0x1a0f00 }));
    trunk.position.y = 15;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    grp.add(trunk);

    const leafMat = new THREE.MeshLambertMaterial({ color: 0x0a290a });
    const l1 = new THREE.Mesh(new THREE.ConeGeometry(16, 25, 8), leafMat); l1.position.y = 25; l1.castShadow = true; grp.add(l1);
    const l2 = new THREE.Mesh(new THREE.ConeGeometry(12, 25, 8), leafMat); l2.position.y = 40; l2.castShadow = true; grp.add(l2);
    const l3 = new THREE.Mesh(new THREE.ConeGeometry(8, 20, 8), leafMat); l3.position.y = 52; l3.castShadow = true; grp.add(l3);
    const scale = 0.8 + seedOffset * 0.6; grp.scale.setScalar(scale); scene.add(grp);
    // Non aggiungiamo agli obstacles per evitare collisioni bloccanti
}

function createFantasyHouse(x, z, seedOffset) {
    const grp = new THREE.Group(); grp.position.set(x, 0, z);
    const width = 20 + seedOffset * 10; const depth = 20 + seedOffset * 10; const height = 15;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), new THREE.MeshLambertMaterial({ color: 0x4a3c31 }));
    walls.position.y = height / 2;
    walls.castShadow = true;
    walls.receiveShadow = true;
    grp.add(walls);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.8, 10, 4), new THREE.MeshLambertMaterial({ color: 0x2c1e1e }));
    roof.position.y = height + 5;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    grp.add(roof);

    const door = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 1), new THREE.MeshLambertMaterial({ color: 0x1a1110 }));
    door.position.set(0, 5, depth / 2 + 0.1);
    grp.add(door);

    grp.rotation.y = seedOffset * Math.PI * 2; scene.add(grp);
    // Non aggiungiamo agli obstacles per evitare collisioni bloccanti
}


// ---------------------------------------------------------
// ZONA TEST FISICA (Richiesta Utente)
// ---------------------------------------------------------
function createPhysicsTestZone(scene, obstacles) {
    const matRed = new THREE.MeshLambertMaterial({ color: 0xff0000 });
    const matBlue = new THREE.MeshLambertMaterial({ color: 0x0000ff });
    const matGreen = new THREE.MeshLambertMaterial({ color: 0x00ff00 });
    const matYellow = new THREE.MeshLambertMaterial({ color: 0xffff00 });
    const matPurple = new THREE.MeshLambertMaterial({ color: 0x800080 });
    const matGray = new THREE.MeshLambertMaterial({ color: 0x888888 });

    // 1. Cubo
    const cube = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10), matRed);
    cube.position.set(40, 5, 130);
    scene.add(cube); obstacles.push(cube);

    // 2. Sfera
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(6, 32, 32), matBlue);
    sphere.position.set(60, 6, 130);
    scene.add(sphere); obstacles.push(sphere);

    // 3. Cilindro
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 12, 32), matGreen);
    cylinder.position.set(80, 6, 130);
    scene.add(cylinder); obstacles.push(cylinder);

    // 4. Piramide (Cono a 4 facce)
    const pyramid = new THREE.Mesh(new THREE.ConeGeometry(6, 10, 4), matYellow);
    pyramid.position.set(100, 5, 130);
    scene.add(pyramid); obstacles.push(pyramid);

    // 5. Cono
    const cone = new THREE.Mesh(new THREE.ConeGeometry(5, 10, 32), matPurple);
    cone.position.set(120, 5, 130);
    scene.add(cone); obstacles.push(cone);

    // 6. Concave Shape: U-Wall Trap
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(20, 10, 2), matGray);
    wallBack.position.set(40, 5, 160);
    scene.add(wallBack); obstacles.push(wallBack);

    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 15), matGray);
    wallLeft.position.set(31, 5, 167.5);
    scene.add(wallLeft); obstacles.push(wallLeft);

    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(2, 10, 15), matGray);
    wallRight.position.set(49, 5, 167.5);
    scene.add(wallRight); obstacles.push(wallRight);

    // 7. Hole Mechanism
    const holeY = 3;
    const p1 = new THREE.Mesh(new THREE.BoxGeometry(30, 6, 10), matGray);
    p1.position.set(100, holeY, 150); p1.userData.isWalkable = true;
    scene.add(p1); obstacles.push(p1);

    const p2 = new THREE.Mesh(new THREE.BoxGeometry(30, 6, 10), matGray);
    p2.position.set(100, holeY, 170); p2.userData.isWalkable = true;
    scene.add(p2); obstacles.push(p2);

    const p3 = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), matGray);
    p3.position.set(80, holeY, 160); p3.userData.isWalkable = true;
    scene.add(p3); obstacles.push(p3);

    const p4 = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), matGray);
    p4.position.set(120, holeY, 160); p4.userData.isWalkable = true;
    scene.add(p4); obstacles.push(p4);

    const holeRamp = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 20), matGray);
    holeRamp.position.set(100, 2, 185); holeRamp.rotation.x = -0.4; holeRamp.userData.isWalkable = true;
    scene.add(holeRamp); obstacles.push(holeRamp);

    // 8. Escalating Walls (West Side)
    // Heights: 5, 10, 20, 40, 80
    const wallHeights = [5, 10, 20, 40, 80];
    const wallColors = [0x00ff00, 0xadff2f, 0xffff00, 0xffa500, 0xff0000]; // Green->Red

    for (let i = 0; i < wallHeights.length; i++) {
        const h = wallHeights[i];
        const w = new THREE.Mesh(new THREE.BoxGeometry(2, h, 20), new THREE.MeshLambertMaterial({ color: wallColors[i] }));
        w.position.set(-40, h / 2, 130 + (i * 15)); // Spaced along Z
        w.castShadow = true; w.receiveShadow = true;
        scene.add(w); obstacles.push(w);
    }
}
