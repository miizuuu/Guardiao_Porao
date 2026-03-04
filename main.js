import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO SUPREMA
 * - Fundo PNG removido via Shader (Chroma Key Black)
 * - Animação Quadro a Quadro (Spritesheet 4x1)
 * - Colisões de Porta Reais
 * - Todas as 4 Salas Integradas
 */

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0510);
scene.fog = new THREE.Fog(0x0a0510, 5, 50);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;

// --- ILUMINAÇÃO "PEAK" ---
const hemi = new THREE.HemisphereLight(0xffaa00, 0x440066, 1.5);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xff7700, 1.2);
sun.position.set(10, 20, 10);
sun.castShadow = true;
scene.add(sun);

// --- ASSETS ---
const texLoader = new THREE.TextureLoader();
const assets = './public/assets/';

// Função para carregar textura com repetição
const loadT = (f, rx = 1, ry = 1) => {
    const t = texLoader.load(assets + f);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;
};

const floorMat = new THREE.MeshStandardMaterial({ map: loadT('floor.png', 15, 15), color: 0xffaa44 });
const wallMat = new THREE.MeshStandardMaterial({ map: loadT('wall.png', 5, 1), color: 0xff5533 });

// --- SHADER PARA REMOVER FUNDO PRETO DO PERSONAGEM ---
const heroTexture = texLoader.load(assets + 'hero.png');
heroTexture.magFilter = THREE.NearestFilter; // Pixel art look
heroTexture.repeat.set(0.25, 1); // Assume spritesheet 4x1

const heroMat = new THREE.ShaderMaterial({
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
            vec4 color = texture2D(tDiffuse, uv);
            // Chroma key: remove preto puro ou quase preto
            if (color.r < 0.1 && color.g < 0.1 && color.b < 0.1) discard;
            gl_FragColor = color;
        }
    `,
    transparent: true,
    side: THREE.DoubleSide
});

// --- ESTADO DO JOGO ---
const game = {
    player: { mesh: null, speed: 0.18, frame: 0, animTimer: 0, dir: 1, state: 'idle' },
    walls: [], // {box: Box3, active: bool}
    interactables: [],
    leverSeq: [], symbolSeq: [], orbSeq: [],
    inv: []
};

const keys = { w: false, a: false, s: false, d: false, e: false, ' ': false };

// --- CONSTRUÇÃO DO MUNDO ---

function addBox(w, h, d, x, y, z, mat, isDoor = false) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    const wallObj = { box, mesh, active: true, isDoor };
    game.walls.push(wallObj);
    return wallObj;
}

function createRoom1() {
    // Chão Hub
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Paredes
    addBox(30, 10, 1, 0, 5, -15, wallMat);   // Norte
    addBox(1, 10, 40, -15, 5, 5, wallMat);  // Oeste
    addBox(1, 10, 40, 15, 5, 5, wallMat);   // Leste

    // Alavancas
    for (let i = 0; i < 3; i++) {
        const g = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x332200 }));
        const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5), new THREE.MeshStandardMaterial({ color: 0xffaa00 }));
        s.position.y = 0.5; s.rotation.z = Math.PI / 4;
        g.add(b); g.add(s);
        g.position.set(-8 + i * 8, 1, -14);
        g.userData = { id: i, type: 'lever', stick: s, active: false };
        scene.add(g);
        game.interactables.push(g);
    }

    // PORTA 1 (BLOQUEIO REAL)
    game.door1 = addBox(1, 8, 6, 15, 4, -5, new THREE.MeshStandardMaterial({ color: 0x9d00ff, emissive: 0x9d00ff, emissiveIntensity: 0.5 }), true);
}

function createRoom2() {
    // Sala dos Símbolos
    addBox(30, 10, 1, 30, 5, -20, wallMat); // Norte R2
    addBox(30, 10, 1, 30, 5, 10, wallMat);  // Sul R2
    addBox(1, 10, 30, 45, 5, -5, wallMat);  // Leste R2

    const icons = ["🔯", "☯️", "⚛️"];
    icons.forEach((icon, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#33ff33'; ctx.font = 'bold 100px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(icon, 64, 64);
        const m = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x33ff33, emissiveIntensity: 0.5 }));
        m.position.set(25 + i * 10, 4, -19.2);
        m.userData = { id: i, type: 'symbol', active: false };
        scene.add(m);
        game.interactables.push(m);
    });

    // PORTA 2
    game.door2 = addBox(6, 8, 1, 30, 4, 10, new THREE.MeshStandardMaterial({ color: 0x33ff33, emissive: 0x33ff33, emissiveIntensity: 0.5 }), true);
}

function createRoom3() {
    // Labirinto/Orbes
    addBox(30, 10, 1, 30, 5, 60, wallMat); // Sul R3
    addBox(1, 10, 50, 15, 5, 35, wallMat); // Oeste R3
    addBox(1, 10, 50, 45, 5, 35, wallMat); // Leste R3

    const colors = [0xff3300, 0x33ff33, 0x9d00ff];
    colors.forEach((col, i) => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(1.5), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 2 }));
        m.position.set(25 + i * 8, 3, 50);
        m.userData = { id: i, type: 'orb', active: false };
        scene.add(m);
        game.interactables.push(m);
    });
}

function createBoss() {
    // Arena do Cérbero
    const boss = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 6), new THREE.MeshStandardMaterial({ color: 0x440000 }));
    boss.add(body);
    for (let i = 0; i < 3; i++) {
        const head = new THREE.Mesh(new THREE.SphereGeometry(2), new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000 }));
        head.position.set(-4 + i * 4, 5, 2);
        boss.add(head);
    }
    boss.position.set(30, 3, 90);
    scene.add(boss);
}

// --- LOGICA DE JOGO ---

function handleCollision(vx, vz) {
    const p = game.player;
    const oldPos = p.mesh.position.clone();

    // Testa X
    p.mesh.position.x += vx;
    const pBox = new THREE.Box3().setFromObject(p.mesh);
    let hit = false;
    for (let w of game.walls) {
        if (w.active && pBox.intersectsBox(w.box)) { hit = true; break; }
    }
    if (hit) p.mesh.position.x = oldPos.x;

    // Testa Z
    p.mesh.position.z += vz;
    const pZBox = new THREE.Box3().setFromObject(p.mesh);
    hit = false;
    for (let w of game.walls) {
        if (w.active && pZBox.intersectsBox(w.box)) { hit = true; break; }
    }
    if (hit) p.mesh.position.z = oldPos.z;
}

function updateAnimation(delta) {
    const p = game.player;
    if (p.state === 'walking') {
        p.animTimer += delta * 10;
        p.frame = Math.floor(p.animTimer) % 4;
        heroMat.uniforms.offset.value.set(p.frame * 0.25, 0);
    } else {
        heroMat.uniforms.offset.value.set(0, 0); // Frame idle
    }
    // Flip horizontal
    p.mesh.scale.x = Math.abs(p.mesh.scale.x) * p.dir;
}

function update() {
    const delta = clock.getDelta();
    if (!game.player.mesh) return;

    let vx = 0, vz = 0;
    if (keys.w) vz -= game.player.speed;
    if (keys.s) vz += game.player.speed;
    if (keys.a) { vx -= game.player.speed; game.player.dir = -1; }
    if (keys.d) { vx += game.player.speed; game.player.dir = 1; }

    if (vx !== 0 || vz !== 0) {
        game.player.state = 'walking';
        handleCollision(vx, vz);
    } else {
        game.player.state = 'idle';
    }

    updateAnimation(delta);

    // Câmera Perfeita
    camera.position.lerp(new THREE.Vector3(game.player.mesh.position.x, 10, game.player.mesh.position.z + 14), 0.1);
    camera.lookAt(game.player.mesh.position.x, 2, game.player.mesh.position.z);

    // Billboarding suave
    game.player.mesh.rotation.y = Math.atan2(camera.position.x - game.player.mesh.position.x, camera.position.z - game.player.mesh.position.z);

    // Interações
    let near = false;
    game.interactables.forEach(obj => {
        if (game.player.mesh.position.distanceTo(obj.position) < 5) {
            near = true;
            document.getElementById('interaction-label').classList.remove('hidden');
            if (keys.e) { handleInteraction(obj); keys.e = false; }
        }
    });
    if (!near) document.getElementById('interaction-label').classList.add('hidden');
}

function handleInteraction(obj) {
    const d = obj.userData;
    if (d.type === 'lever' && !d.active) {
        d.active = true; d.stick.rotation.z = -Math.PI / 4;
        game.leverSeq.push(d.id);
        if (game.leverSeq.length === 3) {
            if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                showMsg("PORTA ROXA ABERTA!");
                game.door1.active = false;
                game.door1.mesh.visible = false;
                addToInv("slot-1", "🗡️");
            } else {
                showMsg("RESETANDO...");
                setTimeout(() => { game.leverSeq = []; game.interactables.filter(o => o.userData.type === 'lever').forEach(o => { o.userData.active = false; o.userData.stick.rotation.z = Math.PI / 4; }); }, 800);
            }
        }
    }

    if (d.type === 'symbol' && !d.active) {
        d.active = true; obj.material.emissiveIntensity = 3;
        game.symbolSeq.push(d.id);
        if (game.symbolSeq.length === 3) {
            if (JSON.stringify(game.symbolSeq) === "[2,0,1]") {
                showMsg("PASSAGEM VERDE LIBERADA!");
                game.door2.active = false;
                game.door2.mesh.visible = false;
                addToInv("slot-2", "🔫");
            } else {
                showMsg("ERROU.");
                setTimeout(() => { game.symbolSeq = []; game.interactables.filter(o => o.userData.type === 'symbol').forEach(o => { o.userData.active = false; o.material.emissiveIntensity = 0.5; }); }, 1000);
            }
        }
    }
}

function showMsg(t) { const b = document.getElementById('msg-box'); document.getElementById('msg-text').innerText = t; b.classList.remove('hidden'); b.onclick = () => b.classList.add('hidden'); }
function addToInv(id, icon) { const s = document.getElementById(id); s.classList.add('active'); s.setAttribute('data-label', icon); }

function loop() {
    requestAnimationFrame(loop);
    update();
    renderer.render(scene, camera);
}

// --- BOOT ---
createRoom1();
createRoom2();
createRoom3();
createBoss();

const charPlane = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), heroMat);
charPlane.position.set(0, 2.5, 5);
scene.add(charPlane);
game.player.mesh = charPlane;

loop();

window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = false; });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

setTimeout(() => { document.getElementById('loader').style.display = 'none'; }, 2000);
