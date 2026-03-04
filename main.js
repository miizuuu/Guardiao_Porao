import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO DEFINITIVA
 * - HUB CENTRAL CONECTANDO 3 SALAS
 * - REMOÇÃO DE FUNDO PNG VIA SHADER (CHROMA KEY)
 * - COLISÕES REAIS POR EIXO
 */

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a0a2e);
scene.fog = new THREE.Fog(0x1a0a2e, 10, 70);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ILUMINAÇÃO "PEAK" ---
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const sun = new THREE.PointLight(0xffae00, 30, 50);
sun.position.set(0, 10, 0);
sun.castShadow = true;
scene.add(sun);

// --- ASSETS ---
const texLoader = new THREE.TextureLoader();
const assets = './public/assets/';

const loadT = (f, rx = 1, ry = 1) => {
    const t = texLoader.load(assets + f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
};

const matFloor = new THREE.MeshStandardMaterial({ map: loadT('floor.png', 20, 20), color: 0x887766 });
const matWall = new THREE.MeshStandardMaterial({ map: loadT('wall.png', 2, 1), color: 0xaa5544 });

// --- REMOÇÃO DE FUNDO DO PERSONAGEM (SHADER CHROMA KEY) ---
// Tenta remover fundos pretos, brancos ou cinzas de "fake transparency"
const heroTexture = texLoader.load(assets + 'hero.png');
heroTexture.magFilter = THREE.NearestFilter;
heroTexture.repeat.set(0.25, 1);

const matHero = new THREE.ShaderMaterial({
    uniforms: {
        tDiffuse: { value: heroTexture },
        offset: { value: new THREE.Vector2(0, 0) }
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec2 offset;
        varying vec2 vUv;
        void main() {
            vec2 uv = vUv * vec2(0.25, 1.0) + offset;
            vec4 col = texture2D(tDiffuse, uv);
            
            // FILTRO DE TRANSPARÊNCIA AGRESSIVO
            // Remove preto puro, branco puro e cinza de quadriculado 'fake png'
            float brightness = (col.r + col.g + col.b) / 3.0;
            if (brightness < 0.05 || brightness > 0.95) discard; 
            if (abs(col.r - col.g) < 0.02 && abs(col.g - col.b) < 0.02 && brightness > 0.4 && brightness < 0.6) discard;

            gl_FragColor = col;
        }
    `,
    transparent: true,
    side: THREE.DoubleSide
});

// --- ESTADO ---
const game = {
    player: { mesh: null, box: new THREE.Box3(), speed: 0.2, frame: 0, timer: 0, dir: 1 },
    walls: [], // Array de Box3
    doors: {},
    interactables: [],
    leverSeq: [], symbolSeq: [], orbSeq: [],
    input: { w: false, a: false, s: false, d: false, e: false }
};

// --- CONSTRUÇÃO ---

function addWall(w, h, d, x, y, z) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), matWall);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    game.walls.push(new THREE.Box3().setFromObject(mesh));
}

function createGate(x, z, rotY, doorId, color) {
    const group = new THREE.Group();
    // Vãos laterais
    const l = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall); l.position.set(-6.5, 5, 0);
    const r = new THREE.Mesh(new THREE.BoxGeometry(7, 10, 1), matWall); r.position.set(6.5, 5, 0);
    const t = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 1), matWall); t.position.set(0, 8.5, 0);

    const door = new THREE.Mesh(new THREE.BoxGeometry(6, 7, 0.4), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.5 }));
    door.position.set(0, 3.5, 0);

    group.add(l, r, t, door);
    group.position.set(x, 0, z);
    group.rotation.y = rotY;
    scene.add(group);

    game.walls.push(new THREE.Box3().setFromObject(l), new THREE.Box3().setFromObject(r), new THREE.Box3().setFromObject(t));
    const dBox = new THREE.Box3().setFromObject(door);
    game.doors[doorId] = { mesh: door, box: dBox, open: false };
}

function initWorld() {
    // Chão Base
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // HUB CENTRAL (0,0)
    createGate(0, -10, 0, 'door1', 0x9d00ff); // Norte -> Sala 1
    createGate(10, 0, Math.PI / 2, 'door2', 0x00ffcc); // Leste -> Sala 2
    createGate(-10, 0, Math.PI / 2, 'door3', 0xffae00); // Oeste -> Sala 3
    addWall(21, 10, 1, 0, 5, 10); // Sul do Hub

    // SALA 1 (NORTE) - ALAVANCAS
    addWall(20, 10, 1, 0, 5, -30); // Parede Fundo
    addWall(1, 10, 20, -10, 5, -20);
    addWall(1, 10, 20, 10, 5, -20);
    [-5, 0, 5].forEach((x, i) => {
        const g = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.6), new THREE.MeshStandardMaterial({ color: 0x332200 }));
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
        s.position.y = 0.5; s.rotation.z = Math.PI / 4;
        g.add(base, s); g.position.set(x, 1, -29);
        g.userData = { id: i, type: 'lever', stick: s, active: false };
        scene.add(g); game.interactables.push(g);
    });

    // SALA 2 (LESTE) - SÍMBOLOS
    addWall(1, 10, 20, 30, 5, 0);
    addWall(20, 10, 1, 20, 5, -10);
    addWall(20, 10, 1, 20, 5, 10);
    ["🔯", "☯️", "⚛️"].forEach((icon, i) => {
        const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d'); ctx.fillStyle = '#00ffcc'; ctx.font = 'bold 90px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(icon, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x00ffcc, emissiveIntensity: 0.5 }));
        m.position.set(29.4, 4, -5 + i * 5); m.rotation.y = -Math.PI / 2;
        m.userData = { id: i, type: 'symbol', active: false };
        scene.add(m); game.interactables.push(m);
    });

    // SALA 3 (OESTE) - ORBES
    addWall(1, 10, 20, -30, 5, 0);
    addWall(20, 10, 1, -20, 5, -10);
    addWall(20, 10, 1, -20, 5, 10);
    [0xff0000, 0x00ff00, 0x0000ff].forEach((col, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
        m.position.set(-29, 3, -5 + i * 5);
        m.userData = { id: i, type: 'orb', active: false };
        scene.add(m); game.interactables.push(m);
    });
}

function initPlayer() {
    game.player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), matHero);
    game.player.mesh.position.set(0, 2.5, 5);
    game.player.mesh.castShadow = true;
    scene.add(game.player.mesh);
}

// --- COLISÃO ROBUSTA ---
function canMoveTo(vx, vz) {
    const pBox = new THREE.Box3().setFromObject(game.player.mesh);
    // Cria um bounding box futuro menor para suavizar a colisão
    pBox.expandByScalar(-0.5);
    pBox.min.x += vx; pBox.max.x += vx;
    pBox.min.z += vz; pBox.max.z += vz;

    for (let wall of game.walls) {
        if (pBox.intersectsBox(wall)) return false;
    }
    for (let id in game.doors) {
        if (!game.doors[id].open && pBox.intersectsBox(game.doors[id].box)) return false;
    }
    return true;
}

function update() {
    const delta = new THREE.Clock().getDelta(); // Local delta fix
    const p = game.player;
    if (!p.mesh) return;

    let moveX = 0, moveZ = 0;
    if (game.input.w) moveZ -= p.speed;
    if (game.input.s) moveZ += p.speed;
    if (game.input.a) { moveX -= p.speed; p.dir = -1; }
    if (game.input.d) { moveX += p.speed; p.dir = 1; }

    if (moveX !== 0 || moveZ !== 0) {
        // Tenta mover nos eixos separadamente para "deslizar" nas paredes
        if (canMoveTo(moveX, 0)) p.mesh.position.x += moveX;
        if (canMoveTo(0, moveZ)) p.mesh.position.z += moveZ;

        p.timer += 0.1; // Timer simplificado
        p.frame = Math.floor(p.timer) % 4;
        matHero.uniforms.offset.value.set(p.frame * 0.25, 0);
    } else {
        matHero.uniforms.offset.value.set(0, 0);
    }
    p.mesh.scale.x = Math.abs(p.mesh.scale.x) * p.dir;

    camera.position.lerp(new THREE.Vector3(p.mesh.position.x, 10, p.mesh.position.z + 15), 0.1);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    // Interações
    let near = false;
    game.interactables.forEach(obj => {
        if (p.mesh.position.distanceTo(obj.position) < 5) {
            near = true;
            document.getElementById('interaction-label').classList.remove('hidden');
            if (game.input.e) { handleInteraction(obj); game.input.e = false; }
        }
    });
    if (!near) document.getElementById('interaction-label').classList.add('hidden');
}

function handleInteraction(obj) {
    const d = obj.userData;
    if (d.type === 'lever' && !d.active) {
        d.active = true; d.stick.rotation.z = -Math.PI / 4; game.leverSeq.push(d.id);
        if (game.leverSeq.length === 3) {
            if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                showMsg("PORTA 1 ABERTA!"); game.doors.door1.open = true;
                const anim = () => { game.doors.door1.mesh.position.y += 0.2; if (game.doors.door1.mesh.position.y < 12) requestAnimationFrame(anim); }; anim();
            } else {
                showMsg("RESET."); setTimeout(() => { game.leverSeq = []; game.interactables.forEach(o => { if (o.userData.type === 'lever') { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; } }); }, 800);
            }
        }
    }
    if (d.type === 'symbol' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 3; game.symbolSeq.push(d.id);
        if (game.symbolSeq.length === 3) {
            if (JSON.stringify(game.symbolSeq) === "[2,0,1]") {
                showMsg("PORTA 2 ABERTA!"); game.doors.door2.open = true;
                const anim = () => { game.doors.door2.mesh.position.x += 0.2; if (game.doors.door2.mesh.position.x < 12) requestAnimationFrame(anim); }; anim();
            } else {
                showMsg("ERRO."); setTimeout(() => { game.symbolSeq = []; game.interactables.forEach(o => { if (o.userData.type === 'symbol') { o.userData.active = false; o.material.emissiveIntensity = 0.5; } }); }, 1000);
            }
        }
    }
    if (d.type === 'orb' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 5; game.orbSeq.push(d.id);
        if (game.orbSeq.length === 3) {
            if (JSON.stringify(game.orbSeq) === "[1,0,2]") {
                showMsg("PORTA 3 ABERTA!"); game.doors.door3.open = true;
                const anim = () => { game.doors.door3.mesh.position.x -= 0.2; if (game.doors.door3.mesh.position.x > -12) requestAnimationFrame(anim); }; anim();
            } else {
                showMsg("RITUAL FALHOU."); setTimeout(() => { game.orbSeq = []; game.interactables.forEach(o => { if (o.userData.type === 'orb') { o.userData.active = false; o.material.emissiveIntensity = 2; } }); }, 1000);
            }
        }
    }
}

function showMsg(t) { const b = document.getElementById('msg-box'); document.getElementById('msg-text').innerText = t; b.classList.remove('hidden'); b.onclick = () => b.classList.add('hidden'); }

function loop() {
    requestAnimationFrame(loop);
    update();
    renderer.render(scene, camera);
}

// BOOT
initWorld();
initPlayer();
loop();

window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = false; });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
setTimeout(() => document.getElementById('loader').style.display = 'none', 1000);
