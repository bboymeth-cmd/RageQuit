// world.js - Sistema mappa SQUADRE

function setupWorld() {
    // Crea solo mappa team
    createTeamMap();
}

// MAPPA SQUADRE - 4 zone colorate per ogni team
function createTeamMap() {
    console.log('[WORLD] Creating TEAM Map');

    // Griglia (disattivata)
    // const gridHelper = new THREE.GridHelper(2000, 100, 0x004444, 0x002222);
    // scene.add(gridHelper);

    // Pavimento con texture gore rossa
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Crea pattern terreno molto scuro quasi nero
    for (let i = 0; i < 512; i += 16) {
        for (let j = 0; j < 512; j += 16) {
            const rand = Math.random();
            if (rand < 0.15) {
                // Macchie di sangue scuro
                const gradient = ctx.createRadialGradient(i + 8, j + 8, 2, i + 8, j + 8, 10);
                gradient.addColorStop(0, '#1a0000');
                gradient.addColorStop(0.5, '#100000');
                gradient.addColorStop(1, '#0a0000');
                ctx.fillStyle = gradient;
            } else if (rand < 0.3) {
                // Sangue coagulato nero
                ctx.fillStyle = `rgb(${10 + Math.random() * 15}, ${2 + Math.random() * 8}, ${2 + Math.random() * 8})`;
            } else if (rand < 0.5) {
                // Terreno nero con hint rosso
                ctx.fillStyle = `rgb(${8 + Math.random() * 12}, ${5 + Math.random() * 10}, ${5 + Math.random() * 10})`;
            } else {
                // Terreno nero base
                const base = 5 + Math.random() * 10;
                ctx.fillStyle = `rgb(${base}, ${base * 0.5}, ${base * 0.5})`;
            }
            ctx.fillRect(i, j, 16, 16);

            // Aggiungi schizzi di sangue scuro
            if (Math.random() < 0.2) {
                ctx.strokeStyle = 'rgba(30,0,0,0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(i + Math.random() * 16, j + Math.random() * 16);
                ctx.lineTo(i + Math.random() * 16, j + Math.random() * 16);
                ctx.stroke();
            }
            // Gocce di sangue molto scure
            if (Math.random() < 0.1) {
                ctx.fillStyle = '#220000';
                ctx.beginPath();
                ctx.arc(i + Math.random() * 16, j + Math.random() * 16, 1 + Math.random() * 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    const floorTexture = new THREE.CanvasTexture(canvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(10, 10);

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000),
        new THREE.MeshLambertMaterial({
            map: floorTexture,
            emissive: 0x050000,
            emissiveIntensity: 0.05
        })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    scene.add(floor);

    // Zone colorate per ogni squadra (4 angoli)
    const teamZones = [
        { team: 'red', x: -300, z: -300, color: 0xff0000 },
        { team: 'black', x: 300, z: -300, color: 0x666666 },
        { team: 'green', x: -300, z: 300, color: 0x00ff00 },
        { team: 'purple', x: 300, z: 300, color: 0xff00ff }
    ];

    teamZones.forEach(zone => {
        // Base colorata per ogni squadra
        const base = new THREE.Mesh(
            new THREE.CircleGeometry(80, 16),
            new THREE.MeshLambertMaterial({
                color: zone.color,
                emissive: zone.color,
                emissiveIntensity: 0.3,
                roughness: 0.6
            })
        );
        base.rotation.x = -Math.PI / 2;
        base.position.set(zone.x, 0.3, zone.z);
        scene.add(base);

        // Mura protettive rimosse (causavano collisioni invisibili)
        // createArenaWalls(zone.x, zone.z, 90, 15, zone.color);

        // Alberi attorno alla base
        for (let i = 0; i < 8; i++) {
            let angle = (i / 8) * Math.PI * 2;
            let x = zone.x + Math.cos(angle) * 120;
            let z = zone.z + Math.sin(angle) * 120;
            createPineTree(x, z, random());
        }
    });

    // Arena centrale neutra
    const centralPlatform = new THREE.Mesh(
        new THREE.CylinderGeometry(60, 60, 5, 16),
        new THREE.MeshLambertMaterial({
            color: 0x333333
        })
    );
    centralPlatform.position.set(0, 2.5, 0);
    centralPlatform.castShadow = true;
    centralPlatform.receiveShadow = true;
    scene.add(centralPlatform);
    // Non aggiungiamo agli obstacles per renderla calpestabile

    // Pilastri centrali rimossi (causavano blocchi)
    // for(let i=0; i<4; i++) {
    //     let angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    //     let x = Math.cos(angle) * 40;
    //     let z = Math.sin(angle) * 40;
    //     createPillar(x, z, 30);
    // }

    // Ostacoli tra le zone (ridotti) (ridotti)
    for (let i = 0; i < 8; i++) {
        let angle = (i / 8) * Math.PI * 2;
        let radius = 150 + random() * 50;
        let x = Math.cos(angle) * radius;
        let z = Math.sin(angle) * radius;
        createRock(x, z, random());
    }

    createCentralBridge();
    createPhysicsTestZone(scene, obstacles);
}

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
