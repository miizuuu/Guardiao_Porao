import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- CONFIGURAÇÃO BÁSICA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x020202);
scene.fog = new THREE.FogExp2(0x020202, 0.12);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// --- CARREGAMENTO DE TEXTURAS ---
const texLoader = new THREE.TextureLoader();
const textures = {
    floor: texLoader.load('assets/textures/floor.png'),
    wall: texLoader.load('assets/textures/wall.png'),
    wood: texLoader.load('assets/textures/wood.png')
};

Object.values(textures).forEach(tex => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
});

// --- LUZES ---
const ambientLight = new THREE.AmbientLight(0x4040a0, 0.1);
scene.add(ambientLight);

// Lanterna
const flashlight = new THREE.SpotLight(0xffffff, 80);
flashlight.angle = Math.PI / 7;
flashlight.penumbra = 0.4;
flashlight.decay = 1.8;
flashlight.distance = 35;
flashlight.castShadow = true;
scene.add(flashlight);
scene.add(flashlight.target);

// --- ESTADO DO JOGO ---
const gameState = {
    hasKey: false,
    hasSword: false,
    doorOpen: false,
    boardsBroken: false,
    cerberusHealth: 10,
    playerHealth: 100,
    isGameOver: false,
    selectedSlot: 0,
    inventory: [true, false, false]
};

const itemsInScene = { key: null, sword: null, door: null, boards: null, cerberus: null, torches: [] };

// --- COLISÕES OTIMIZADAS ---
const collidableObjects = [];
const collisionBoxes = [];
function addCollidable(mesh) {
    collidableObjects.push(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    collisionBoxes.push(box);
}

function checkCollision(pos) {
    const playerRadius = 0.4;
    for (let i = 0; i < collisionBoxes.length; i++) {
        if (!collidableObjects[i].visible) continue;
        const box = collisionBoxes[i];
        const closestPoint = new THREE.Vector3().copy(pos).clamp(box.min, box.max);
        if (pos.distanceTo(closestPoint) < playerRadius) return true;
    }
    return false;
}

// --- AMBIENTE ---
function createWall(w, h, d, x, y, z, color = 0x555555, name = "wall") {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({ map: textures.wall.clone(), color: color, roughness: 1.0 });
    mat.map.repeat.set(w / 4, h / 4);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true; mesh.castShadow = true; mesh.name = name;
    scene.add(mesh);
    addCollidable(mesh);
    return mesh;
}

function createStandingTorch(x, z) {
    const group = new THREE.Group();
    // Base/Pedestal
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 0.4, 8), new THREE.MeshStandardMaterial({ map: textures.wall, color: 0x222222 }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    pole.position.y = 1.1;

    // Cup
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.05, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 }));
    cup.position.y = 2.0;

    // Fire Visual
    const fire = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffaa00 }));
    fire.position.y = 2.15;

    group.add(base, pole, cup, fire);
    group.position.set(x, 0.2, z);
    scene.add(group);

    const light = new THREE.PointLight(0xff6600, 15, 20);
    light.position.set(x, 2.3, z);
    light.castShadow = true;
    scene.add(light);

    itemsInScene.torches.push({ light, fire, baseIntensity: 15 });
}

// Floor
const floorGeo = new THREE.PlaneGeometry(250, 250);
const floorMat = new THREE.MeshStandardMaterial({ map: textures.floor, roughness: 0.9 });
floorMat.map.repeat.set(50, 50);
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// SALAS
createWall(10, 5, 0.5, 0, 2.5, -5); createWall(10, 5, 0.5, 0, 2.5, 5); createWall(0.5, 5, 10, -5, 2.5, 0);
createWall(0.5, 5, 4, 5, 2.5, -3); createWall(0.5, 5, 4, 5, 2.5, 3); createWall(0.5, 1.5, 2, 5, 4.25, 0);
itemsInScene.door = createWall(0.4, 3.5, 2, 5, 1.75, 0, 0x884400, "door");
createWall(10, 5, 0.5, 10, 2.5, -1.5); createWall(10, 5, 0.5, 10, 2.5, 1.5);

const boardsMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.5, 3), new THREE.MeshStandardMaterial({ map: textures.wood }));
boardsMesh.position.set(15, 1.75, 0); scene.add(boardsMesh);
itemsInScene.boards = boardsMesh;
addCollidable(boardsMesh);

// SALA BOSS
const bS = 60; const bO = 15;
createWall(bS, 12, 1, bO + bS / 2, 6, -bS / 2);
createWall(bS, 12, 1, bO + bS / 2, 6, bS / 2);
createWall(1, 12, bS, bO + bS, 6, 0);
createWall(1, 12, (bS - 3) / 2, bO, 6, -(bS + 3) / 4);
createWall(1, 12, (bS - 3) / 2, bO, 6, (bS + 3) / 4);

// Torches on floor
for (let i = 0; i < 3; i++) {
    createStandingTorch(25 + i * 15, -15);
    createStandingTorch(25 + i * 15, 15);
}

// ITENS
const keyMesh = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.05, 12, 24),
    new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 1, roughness: 0.1, emissive: 0x442200 })
);
keyMesh.position.set(-3, 0.6, -3); keyMesh.name = "key"; scene.add(keyMesh);
itemsInScene.key = keyMesh;

const sword = new THREE.Group();
const sBlade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.3, 0.2), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.1 }));
const sHilt = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.1, 0.2), new THREE.MeshStandardMaterial({ color: 0x331100 }));
sHilt.position.y = -0.65; sword.add(sBlade, sHilt); sword.position.set(8, 0.7, 0); scene.add(sword);
itemsInScene.sword = sword;

// CÉRBERO ÉPICO
const cerberus = new THREE.Group();
const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.8, 4), new THREE.MeshStandardMaterial({ map: textures.wall, color: 0x220000 }));
cerberus.add(bodyMesh);

// Legs
function createLeg(x, z) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), new THREE.MeshStandardMaterial({ color: 0x110000 }));
    leg.position.set(x, -0.9, z);
    return leg;
}
cerberus.add(createLeg(1, 1.5), createLeg(-1, 1.5), createLeg(1, -1.5), createLeg(-1, -1.5));

// heads
function createEpicHead(x, y, z, rotationY) {
    const h = new THREE.Group();
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0x330000 }));
    neck.rotation.x = Math.PI / 3;
    const skull = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.6), new THREE.MeshStandardMaterial({ color: 0x330000 }));
    skull.position.z = 0.8; skull.position.y = 0.4;

    // Glowing red eyes
    const eyeGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eR = new THREE.Mesh(eyeGeo, eyeMat); const eL = new THREE.Mesh(eyeGeo, eyeMat);
    eR.position.set(0.3, 0.6, 1.4); eL.position.set(-0.3, 0.6, 1.4);

    h.add(neck, skull, eR, eL);
    h.position.set(x, y, z);
    h.rotation.y = rotationY;
    return h;
}
cerberus.add(createEpicHead(0.8, 0.5, 1.8, 0.5), createEpicHead(-0.8, 0.5, 1.8, -0.5), createEpicHead(0, 1.2, 1.8, 0));

cerberus.position.set(50, 1.8, 0); cerberus.name = "cerberus";
scene.add(cerberus); addCollidable(bodyMesh);
itemsInScene.cerberus = cerberus;

// --- CONTROLES E UI ---
const controls = new PointerLockControls(camera, document.body);
const instructions = document.getElementById('instructions');
instructions.addEventListener('click', () => { if (!gameState.isGameOver) controls.lock(); });
controls.addEventListener('lock', () => instructions.style.display = 'none');
controls.addEventListener('unlock', () => { if (!gameState.isGameOver) instructions.style.display = 'block'; });

const moveState = { f: 0, b: 0, l: 0, r: 0 };
const velocity = new THREE.Vector3();
document.addEventListener('keydown', (e) => {
    if (gameState.isGameOver) return;
    if (e.code === 'KeyW') moveState.f = 1; if (e.code === 'KeyS') moveState.b = 1;
    if (e.code === 'KeyA') moveState.l = 1; if (e.code === 'KeyD') moveState.r = 1;
    if (e.code === 'KeyE') interact();
    if (e.key === '1') { gameState.selectedSlot = 0; updateInventoryUI(); }
    if (e.key === '2') { gameState.selectedSlot = 1; updateInventoryUI(); }
    if (e.key === '3') { gameState.selectedSlot = 2; updateInventoryUI(); }
});
document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') moveState.f = 0; if (e.code === 'KeyS') moveState.b = 0;
    if (e.code === 'KeyA') moveState.l = 0; if (e.code === 'KeyD') moveState.r = 0;
});
document.addEventListener('mousedown', () => { if (controls.isLocked) attack(); });
document.addEventListener('wheel', (e) => {
    if (!controls.isLocked || gameState.isGameOver) return;
    gameState.selectedSlot = (gameState.selectedSlot + (e.deltaY > 0 ? 1 : -1) + 3) % 3;
    updateInventoryUI();
});

const raycaster = new THREE.Raycaster();
function showMessage(text) {
    const el = document.getElementById('messages');
    el.innerText = text;
    if (!gameState.isGameOver) setTimeout(() => { if (el.innerText === text) el.innerText = ''; }, 3000);
}

function updateInventoryUI() {
    for (let i = 0; i < 3; i++) {
        const slot = document.getElementById(`slot-${i}`);
        if (!slot) continue;
        slot.classList.remove('active');
        if (gameState.inventory[i]) slot.classList.add('obtained');
        if (gameState.selectedSlot === i) slot.classList.add('active');
    }
    flashlight.visible = (gameState.selectedSlot === 0);
}

function updateHealthUI() {
    document.getElementById('health-bar').style.width = `${gameState.playerHealth}%`;
}

function interact() {
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0 && intersects[0].distance < 3) {
        const obj = intersects[0].object;
        if (obj === itemsInScene.key || obj.name === "key") {
            gameState.inventory[1] = true; itemsInScene.key.visible = false;
            updateInventoryUI(); showMessage("VOCÊ PRESSENTE QUE ESTE OURO ABRIRÁ CAMINHOS.");
        } else if (obj === itemsInScene.door && !gameState.doorOpen) {
            if (gameState.inventory[1] && gameState.selectedSlot === 1) {
                gameState.doorOpen = true; itemsInScene.door.visible = false;
                showMessage("A PORTA CEDE AO TOQUE DA CHAVE RELUZENTE.");
            } else showMessage("DURA COMO PEDRA... PRECISO DE ALGO PARA ABRIR.");
        } else if (obj.parent === itemsInScene.sword || obj.name === "sword") {
            gameState.inventory[2] = true; itemsInScene.sword.visible = false;
            updateInventoryUI(); showMessage("A LÂMINA PRATEADA ESTÁ PRONTA PARA O SANGUE.");
        }
    }
}

function attack() {
    if (gameState.selectedSlot !== 2 || !gameState.inventory[2]) return;
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (intersects.length > 0 && intersects[0].distance < 4.5) {
        const obj = intersects[0].object;
        if (obj === itemsInScene.boards) {
            gameState.boardsBroken = true; itemsInScene.boards.visible = false;
            showMessage("MADEIRAS ESTRALHAM!");
        }
        let hit = false; let c = obj;
        while (c) { if (c === itemsInScene.cerberus) { hit = true; break; } c = c.parent; }
        if (hit) {
            gameState.cerberusHealth--;
            showMessage(`GOLPE CERTEIRO! O CÉRBERO SENTE A LÂMINA.`);
            if (gameState.cerberusHealth <= 0) {
                itemsInScene.cerberus.visible = false;
                endGame(true);
            }
        }
    }
}

function endGame(victory) {
    gameState.isGameOver = true;
    controls.unlock();
    document.getElementById('ui-container').style.display = 'none';
    if (victory) {
        document.getElementById('final-screen-victory').classList.add('active');
    } else {
        document.getElementById('final-screen-defeat').classList.add('active');
    }
}

let cerberusLastAttack = 0;
function updateCerberusIA(delta) {
    if (!itemsInScene.cerberus.visible || gameState.isGameOver) return;
    const boss = itemsInScene.cerberus;
    const dist = boss.position.distanceTo(camera.position);

    if (gameState.boardsBroken || dist < 18) {
        const targetAngle = Math.atan2(camera.position.x - boss.position.x, camera.position.z - boss.position.z);
        boss.rotation.y = THREE.MathUtils.lerp(boss.rotation.y, targetAngle, 3 * delta);

        if (dist > 3.5) {
            const dir = new THREE.Vector3().subVectors(camera.position, boss.position).normalize();
            boss.position.x += dir.x * 6 * delta;
            boss.position.z += dir.z * 6 * delta;
            boss.position.y = 1.8 + Math.sin(performance.now() * 0.01) * 0.3;
        } else if (performance.now() - cerberusLastAttack > 1000) {
            gameState.playerHealth -= 25; updateHealthUI();
            showMessage("CARNE RASGADA! O CÉRBERO TE ALCANÇOU.");
            cerberusLastAttack = performance.now();
            if (gameState.playerHealth <= 0) endGame(false);
        }
    }
}

let prevTime = performance.now();
function animate() {
    requestAnimationFrame(animate);
    const time = performance.now();
    const delta = Math.min((time - prevTime) / 1000, 0.1);

    itemsInScene.torches.forEach(t => {
        t.light.intensity = t.baseIntensity + Math.sin(time * 0.005) * 2 + Math.random() * 0.5;
        t.fire.scale.setScalar(1 + Math.sin(time * 0.02) * 0.1);
    });

    if (controls.isLocked && !gameState.isGameOver) {
        velocity.x -= velocity.x * 10 * delta; velocity.z -= velocity.z * 10 * delta;
        if (moveState.f) velocity.z -= 60 * delta; if (moveState.b) velocity.z += 60 * delta;
        if (moveState.l) velocity.x -= 60 * delta; if (moveState.r) velocity.x += 60 * delta;

        const old = camera.position.clone();
        controls.moveForward(-velocity.z * delta);
        if (checkCollision(camera.position)) camera.position.copy(old);
        const mid = camera.position.clone();
        controls.moveRight(-velocity.x * delta);
        if (checkCollision(camera.position)) camera.position.copy(mid);

        flashlight.position.copy(camera.position);
        flashlight.target.position.copy(camera.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion));

        updateCerberusIA(delta);
    }
    renderer.render(scene, camera);
    prevTime = time;
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

updateInventoryUI(); updateHealthUI(); animate();
