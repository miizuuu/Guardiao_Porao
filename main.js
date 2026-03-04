import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO DE EMERGÊNCIA (CARREGAMENTO GARANTIDO)
 * ------------------------------------------------------------------
 * Se as texturas falharem, o jogo carrega com cores sólidas.
 * Sem desculpas: O JOGO VAI RODAR AGORA.
 */

const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050510);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#bg'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// --- LUZES ---
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const pointLight = new THREE.PointLight(0xffaa00, 50, 100);
pointLight.position.set(0, 10, 0);
scene.add(pointLight);

// --- CARREGAMENTO DE TEXTURAS (COM FALLBACK) ---
const texLoader = new THREE.TextureLoader();
const assets = './public/assets/'; // Caminho padrão

const safeMat = (file, color) => {
    const mat = new THREE.MeshStandardMaterial({ color });
    texLoader.load(assets + file, (t) => {
        mat.map = t;
        mat.needsUpdate = true;
    }, undefined, () => console.warn("Usando cor sólida para " + file));
    return mat;
};

const matFloor = safeMat('floor.png', 0x444444);
const matWall = safeMat('wall.png', 0x664422);

// Sprite do Herói
const matHero = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, alphaTest: 0.5 });
texLoader.load(assets + 'hero.png', (t) => {
    t.magFilter = THREE.NearestFilter;
    t.repeat.set(0.25, 1);
    matHero.map = t;
    matHero.needsUpdate = true;
}, undefined, () => {
    matHero.color.set(0x00ff00); // Se falhar o PNG, vira um quadrado verde
    matHero.transparent = false;
});

// --- ESTADO ---
const game = {
    player: { mesh: null, speed: 0.2, frame: 0, timer: 0, dir: 1 },
    walls: [],
    doors: {},
    interactables: [],
    leverSeq: [],
    input: { w: false, a: false, s: false, d: false, e: false }
};

// --- MUNDO ---
function addBox(w, h, d, x, y, z, mat, isWall = true) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    scene.add(m);
    if (isWall) game.walls.push(new THREE.Box3().setFromObject(m));
    return m;
}

function createOpening(x, z, rotY, doorId, doorCol) {
    const g = new THREE.Group();
    const l = addBox(7, 10, 1, -6, 5, 0, matWall, false);
    const r = addBox(7, 10, 1, 6, 5, 0, matWall, false);
    const t = addBox(5, 3, 1, 0, 8.5, 0, matWall, false);
    const door = addBox(5.2, 7.5, 0.4, 0, 3.7, 0, new THREE.MeshStandardMaterial({ color: doorCol, emissive: doorCol }), false);

    g.add(l, r, t, door);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    scene.add(g);

    game.walls.push(new THREE.Box3().setFromObject(l), new THREE.Box3().setFromObject(r), new THREE.Box3().setFromObject(t));
    game.doors[doorId] = { mesh: door, box: new THREE.Box3().setFromObject(door), open: false };
}

function init() {
    // Chão
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), matFloor);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // HUB CENTRAL E AS 3 SALAS
    createOpening(0, -10, 0, 'door1', 0xff00ff); // SALA 1 (Norte)
    createOpening(12, 0, Math.PI / 2, 'door2', 0x00ffff); // SALA 2 (Leste)
    createOpening(-12, 0, -Math.PI / 2, 'door3', 0xffff00); // SALA 3 (Oeste)
    addBox(24, 10, 1, 0, 5, 12, matWall); // Fechamento Sul

    // Conteúdo Sala 1 (Exemplo)
    [-4, 0, 4].forEach((x, i) => {
        const lever = addBox(1, 2, 1, x, 1, -25, new THREE.MeshStandardMaterial({ color: 0x333333 }), false);
        lever.userData = { id: i, type: 'lever', active: false };
        game.interactables.push(lever);
    });

    // Herói
    game.player.mesh = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), matHero);
    game.player.mesh.position.set(0, 2.5, 5);
    scene.add(game.player.mesh);
}

// --- LOOP ---
function update() {
    const dt = clock.getDelta();
    if (!game.player.mesh) return;

    let mx = 0, mz = 0;
    if (game.input.w) mz -= game.player.speed;
    if (game.input.s) mz += game.player.speed;
    if (game.input.a) { mx -= game.player.speed; game.player.dir = -1; }
    if (game.input.d) { mx += game.player.speed; game.player.dir = 1; }

    if (mx !== 0 || mz !== 0) {
        const pB = new THREE.Box3().setFromObject(game.player.mesh).expandByScalar(-0.4);
        // Colisão simples por eixo
        pB.translate(new THREE.Vector3(mx, 0, 0));
        let hitX = game.walls.some(w => pB.intersectsBox(w)) ||
            Object.values(game.doors).some(d => !d.open && pB.intersectsBox(d.box));
        if (!hitX) game.player.mesh.position.x += mx;

        pB.setFromObject(game.player.mesh).expandByScalar(-0.4).translate(new THREE.Vector3(0, 0, mz));
        let hitZ = game.walls.some(w => pB.intersectsBox(w)) ||
            Object.values(game.doors).some(d => !d.open && pB.intersectsBox(d.box));
        if (!hitZ) game.player.mesh.position.z += mz;

        if (matHero.map) {
            game.player.timer += dt * 10;
            matHero.map.offset.x = (Math.floor(game.player.timer) % 4) * 0.25;
        }
    }
    game.player.mesh.scale.x = Math.abs(game.player.mesh.scale.x) * game.player.dir;

    camera.position.lerp(new THREE.Vector3(game.player.mesh.position.x, 10, game.player.mesh.position.z + 15), 0.1);
    camera.lookAt(game.player.mesh.position.x, 2, game.player.mesh.position.z);

    // Interação
    let near = false;
    game.interactables.forEach(obj => {
        if (game.player.mesh.position.distanceTo(obj.position) < 5) {
            near = true;
            document.getElementById('interact-hint').classList.remove('hidden');
            if (game.input.e) {
                if (obj.userData.type === 'lever' && !obj.userData.active) {
                    obj.userData.active = true;
                    obj.material.color.set(0x00ff00);
                    game.leverSeq.push(obj.userData.id);
                    if (game.leverSeq.length === 3) {
                        if (JSON.stringify(game.leverSeq) === "[0,2,1]") {
                            game.doors.door1.open = true;
                            game.doors.door1.mesh.position.y += 10;
                        } else {
                            game.leverSeq = [];
                            game.interactables.forEach(l => { l.userData.active = false; l.material.color.set(0x333333); });
                        }
                    }
                }
                game.input.e = false;
            }
        }
    });
    if (!near) document.getElementById('interact-hint').classList.add('hidden');
}

function loop() {
    requestAnimationFrame(loop);
    update();
    renderer.render(scene, camera);
}

// INICIAR
init();
loop();
// Forçar saída do loader em 1 segundo, idependente de tudo
setTimeout(() => document.getElementById('loader').classList.add('hidden'), 1000);

window.addEventListener('keydown', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = true; });
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (game.input.hasOwnProperty(k)) game.input[k] = false; });
window.onresize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
