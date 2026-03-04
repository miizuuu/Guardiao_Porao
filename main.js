import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO OTIMIZADA
 * Performance & Estrutura Refinados
 */

// --- CONFIGURAÇÃO CORE ---
const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0a2e);
scene.fog = new THREE.Fog(0x1a0a2e, 10, 60);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap; // Otimização: Shadow Map mais simples

// --- CACHE DE GEOMETRIAS E MATERIAIS (REUSO) ---
const GEOS = {
    wall: new THREE.BoxGeometry(1, 1, 1),
    floor: new THREE.PlaneGeometry(1, 1),
    sprite: new THREE.PlaneGeometry(1, 1),
    leverBase: new THREE.BoxGeometry(1, 1.5, 0.5),
    leverStick: new THREE.CylinderGeometry(0.1, 0.1, 1.2),
    symbol: new THREE.PlaneGeometry(4, 4)
};

const texLoader = new THREE.TextureLoader();
const assets = './public/assets/';

const loadTex = (f, rx = 1, ry = 1) => {
    const t = texLoader.load(assets + f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
};

const MATS = {
    floor: new THREE.MeshStandardMaterial({ map: loadTex('floor.png', 20, 20), color: 0xffaa44 }),
    wall: new THREE.MeshStandardMaterial({ map: loadTex('wall.png'), color: 0xff5533 }),
    door: new THREE.MeshStandardMaterial({ color: 0x9d00ff, emissive: 0x9d00ff, emissiveIntensity: 0.3 }),
    hero: new THREE.MeshStandardMaterial({
        map: texLoader.load(assets + 'hero.png', (t) => {
            t.magFilter = THREE.NearestFilter;
            t.repeat.set(0.25, 1);
        }),
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        emissive: 0xffffff,
        emissiveIntensity: 0.1
    }),
    leverBase: new THREE.MeshStandardMaterial({ color: 0x332200 }),
    leverStick: new THREE.MeshStandardMaterial({ color: 0xffaa00 })
};

// --- ESTADO ---
const game = {
    player: {
        mesh: null,
        box: new THREE.Box3(),
        speed: 0.18,
        frame: 0,
        timer: 0,
        dir: 1,
        isMoving: false
    },
    walls: [],
    doors: {},
    interactables: [],
    leverSeq: [], symbolSeq: [], orbSeq: [],
    input: { w: false, a: false, s: false, d: false, e: false }
};

// --- FUNÇÕES DE CONSTRUÇÃO ---

function createBox(w, h, d, x, y, z, mat, collidable = true) {
    const mesh = new THREE.Mesh(GEOS.wall, mat);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    scene.add(mesh);
    if (collidable) {
        game.walls.push(new THREE.Box3().setFromObject(mesh));
    }
    return mesh;
}

function createWallWithGate(x, z, rotY, doorId) {
    const group = new THREE.Group();

    // Pilares e Viga otimizados
    const p1 = createBox(7, 10, 1, -6.5, 5, 0, MATS.wall, false);
    const p2 = createBox(7, 10, 1, 6.5, 5, 0, MATS.wall, false);
    const p3 = createBox(6, 3, 1, 0, 8.5, 0, MATS.wall, false);

    const door = createBox(6, 7, 0.4, 0, 3.5, 0, MATS.door.clone(), false);

    group.add(p1, p2, p3, door);
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    // Cache de colisões
    game.walls.push(new THREE.Box3().setFromObject(p1), new THREE.Box3().setFromObject(p2), new THREE.Box3().setFromObject(p3));
    game.doors[doorId] = { mesh: door, box: new THREE.Box3().setFromObject(door), open: false };
}

function initMap() {
    // Chão
    const floor = new THREE.Mesh(GEOS.floor, MATS.floor);
    floor.scale.set(150, 150, 1);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Hub e Salas
    createWallWithGate(0, -10, 0, 'door1'); // Norte
    createWallWithGate(10, 0, Math.PI / 2, 'door2'); // Leste
    createWallWithGate(-10, 0, Math.PI / 2, 'door3'); // Oeste
    createBox(21, 10, 1, 0, 5, 10, MATS.wall); // Sul

    // Sala 1: Alavancas
    createBox(20, 10, 1, 0, 5, -30, MATS.wall);
    createBox(1, 10, 20, -10, 5, -20, MATS.wall);
    createBox(1, 10, 20, 10, 5, -20, MATS.wall);

    [-5, 0, 5].forEach((x, i) => {
        const g = new THREE.Group();
        const b = new THREE.Mesh(GEOS.leverBase, MATS.leverBase);
        const s = new THREE.Mesh(GEOS.leverStick, MATS.leverStick);
        s.position.y = 0.5; s.rotation.z = Math.PI / 4;
        g.add(b, s); g.position.set(x, 1, -29);
        g.userData = { id: i, type: 'lever', stick: s, active: false };
        scene.add(g); game.interactables.push(g);
    });

    // Luzes
    const sun = new THREE.PointLight(0xffaa44, 25, 40);
    sun.position.set(0, 10, 0);
    sun.castShadow = true;
    scene.add(sun, new THREE.AmbientLight(0xffffff, 0.7));
}

// --- JOGADOR ---
function initPlayer() {
    game.player.mesh = new THREE.Mesh(GEOS.sprite, MATS.hero);
    game.player.mesh.scale.set(4, 5, 1);
    game.player.mesh.position.set(0, 2.5, 5);
    game.player.mesh.castShadow = true;
    scene.add(game.player.mesh);
    game.player.box.setFromObject(game.player.mesh);
}

// --- SISTEMA DE COLISÃO OTIMIZADO ---
function checkCollision(vx, vz) {
    // Atualiza a box do jogador baseada no movimento pretendido
    const pBox = game.player.box.clone();
    pBox.translate(new THREE.Vector3(vx, 0, vz));

    for (let i = 0; i < game.walls.length; i++) {
        if (pBox.intersectsBox(game.walls[i])) return true;
    }
    for (let id in game.doors) {
        const d = game.doors[id];
        if (!d.open && pBox.intersectsBox(d.box)) return true;
    }
    return false;
}

// --- UPDATE LOOP ---
function update() {
    const delta = clock.getDelta();
    const p = game.player;
    if (!p.mesh) return;

    let vx = 0, vz = 0;
    if (game.input.w) vz -= p.speed;
    if (game.input.s) vz += p.speed;
    if (game.input.a) { vx -= p.speed; p.dir = -1; }
    if (game.input.d) { vx += p.speed; p.dir = 1; }

    p.isMoving = (vx !== 0 || vz !== 0);

    if (p.isMoving) {
        if (!checkCollision(vx, 0)) p.mesh.position.x += vx;
        if (!checkCollision(0, vz)) p.mesh.position.z += vz;
        p.box.setFromObject(p.mesh); // Atualiza box apenas ao mover

        p.timer += delta * 10;
        p.frame = Math.floor(p.timer) % 4;
        MATS.hero.map.offset.x = p.frame * 0.25;
    } else {
        MATS.hero.map.offset.x = 0;
    }
    p.mesh.scale.x = 4 * p.dir;

    // Câmera e Billboard
    camera.position.lerp(new THREE.Vector3(p.mesh.position.x, 10, p.mesh.position.z + 15), 0.1);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    // Interações
    let near = false;
    for (let i = 0; i < game.interactables.length; i++) {
        const obj = game.interactables[i];
        if (p.mesh.position.distanceTo(obj.position) < 5) {
            near = true;
            document.getElementById('interaction-label').classList.remove('hidden');
            if (game.input.e) { handleInteraction(obj); game.input.e = false; }
            break;
        }
    }
    if (!near) document.getElementById('interaction-label').classList.add('hidden');
}

function handleInteraction(obj) {
    const d = obj.userData;
    if (d.type === 'lever' && !d.active) {
        d.active = true; d.stick.rotation.z = -Math.PI / 4; game.leverSeq.push(d.id);
        if (game.leverSeq.length === 3) {
            if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                showMsg("PORTA BLOQUEADA LIBERADA!"); game.doors.door1.open = true;
                const dMesh = game.doors.door1.mesh;
                const anim = () => { dMesh.position.y += 0.2; if (dMesh.position.y < 12) requestAnimationFrame(anim); };
                anim();
            } else {
                showMsg("RESET.");
                setTimeout(() => {
                    game.leverSeq = [];
                    game.interactables.forEach(o => { if (o.userData.type === 'lever') { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; } });
                }, 800);
            }
        }
    }
}

function showMsg(t) {
    const b = document.getElementById('msg-box');
    document.getElementById('msg-text').innerText = t;
    b.classList.remove('hidden');
    b.onclick = () => b.classList.add('hidden');
}

const loop = () => {
    requestAnimationFrame(loop);
    update();
    renderer.render(scene, camera);
};

// --- EVENTS ---
window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = false; });
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// BOOT
initMap();
initPlayer();
loop();
setTimeout(() => document.getElementById('loader').style.display = 'none', 1000);
