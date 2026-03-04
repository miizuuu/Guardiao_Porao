import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO DEFINITIVA E ULTRA BRILHANTE
 * Foco: Visibilidade Total, Sem Escuridão, Colisões Perfeitas.
 */

// --- CONFIGURAÇÃO GLOBAL ---
const clock = new THREE.Clock();
const scene = new THREE.Scene();

// Fundo muito mais claro (Neblina azulada suave)
scene.background = new THREE.Color(0x1a1a2e);
scene.fog = new THREE.Fog(0x1a1a2e, 15, 60);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas: document.querySelector('#bg'),
    antialias: true,
    alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

// --- ASSETS & MATERIAIS ---
const textureLoader = new THREE.TextureLoader();
const assetsPath = './public/assets/';

const loadTexture = (file, repeatX = 1, repeatY = 1) => {
    const t = textureLoader.load(assetsPath + file, undefined, undefined, (err) => {
        console.warn("Asset não encontrado: " + file);
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    return t;
};

// Texturas
const floorTex = loadTexture('floor.png', 15, 15);
const wallTex = loadTexture('wall.png', 5, 1);
const heroTex = textureLoader.load(assetsPath + 'hero.png');

// Materiais com cores base claras para o caso de falha na textura
const matFloor = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x888888, roughness: 0.7 });
const matWall = new THREE.MeshStandardMaterial({ map: wallTex, color: 0xaaaaaa, roughness: 0.8 });
const matHero = new THREE.MeshStandardMaterial({
    map: heroTex,
    transparent: true,
    alphaTest: 0.1, // Reduzido para tentar remover bordas indesejadas
    side: THREE.DoubleSide,
    emissive: 0xffffff,
    emissiveIntensity: 0.1 // Brilho próprio para o herói não ficar escuro
});

// --- ESTADO DO JOGO ---
const gameState = {
    player: {
        mesh: null,
        box: new THREE.Box3(),
        speed: 0.18,
        inv: [],
        activeWeapon: -1
    },
    rooms: { r2_active: false, r3_active: false, boss_active: false },
    levers: [],
    leverSeq: [],
    symbols: [],
    symbolSeq: [],
    orbs: [],
    orbSeq: [],
    walls: [], // Caixas de colisão
    interactables: []
};

const keys = { w: false, a: false, s: false, d: false, e: false };

// --- SISTEMA DE ILUMINAÇÃO (MUITO MAIS FORTE) ---
function initLights() {
    // Luz ambiente forte para eliminar escuridão total
    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    // Luzes direcionais para dar volume sem escurecer
    const sun = new THREE.DirectionalLight(0xffffff, 0.5);
    sun.position.set(5, 10, 5);
    scene.add(sun);

    // Luz da tocha do jogador (Dourada e Amigável)
    const torch = new THREE.PointLight(0xffeebb, 20, 20);
    torch.castShadow = true;
    torch.position.y = 3;
    scene.add(torch);
    gameState.torch = torch;

    // Luzes de destaque nas salas
    const r1Light = new THREE.PointLight(0xffffcc, 10, 15);
    r1Light.position.set(0, 5, 0);
    scene.add(r1Light);
}

// --- COLISÕES E MUNDO ---

function addWall(w, h, d, x, y, z, mat = matWall) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    // Adiciona caixa de colisão
    const box = new THREE.Box3().setFromObject(mesh);
    gameState.walls.push({ box, mesh });
    return mesh;
}

function createHub() {
    // Chão HUB (Largo e Limpo)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Limites do HUB (Visíveis e Brancos)
    addWall(24, 8, 1, 0, 4, -12); // Norte
    addWall(1, 8, 30, -12, 4, 3); // Oeste
    addWall(1, 8, 30, 12, 4, 3);  // Leste

    // Puzzle 1: Alavancas
    for (let i = 0; i < 3; i++) {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, 0.5), new THREE.MeshStandardMaterial({ color: 0x444444 }));
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.2), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
        stick.position.y = 0.6;
        stick.rotation.z = Math.PI / 4;
        group.add(base); group.add(stick);
        group.position.set(-6 + i * 6, 1, -11.2);
        group.userData = { id: i, type: 'lever', active: false, stick: stick };
        scene.add(group);
        gameState.interactables.push(group);
        gameState.levers.push(group);
    }

    // Passagem 1 -> Sala 2 (Porta Gigante Branca)
    const door1 = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(4, 7, 0.4), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
    leaf.position.x = 2; // Pivô na lateral
    door1.add(leaf);
    door1.position.set(11.5, 0, -4);
    door1.rotation.y = Math.PI / 2;
    scene.add(door1);

    const dBox = new THREE.Box3().setFromObject(door1);
    gameState.door1 = { group: door1, leaf, open: false, box: dBox };
    gameState.walls.push({ box: dBox, type: 'door1' });
}

function createRoom2() {
    if (gameState.rooms.r2_active) return;
    gameState.rooms.r2_active = true;

    // Sala 2: O Salão dos Símbolos (Luz Azul Turquesa)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(30, 0, -4);
    scene.add(floor);

    addWall(30, 8, 1, 30, 4, -19); // Parede Norte R2
    addWall(30, 8, 1, 30, 4, 11);  // Parede Sul R2
    addWall(1, 8, 30, 45, 4, -4);  // Parede Leste R2

    const light2 = new THREE.PointLight(0x00ffff, 15, 25);
    light2.position.set(30, 6, -4);
    scene.add(light2);

    // Símbolos Gigantes e Brilhantes
    const icons = ["🔯", "☯️", "⚛️"];
    icons.forEach((icon, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 90px Arial';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(icon, 64, 64);

        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(3, 3),
            new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, emissive: 0x00ffff, emissiveIntensity: 0.5 })
        );
        mesh.position.set(20 + i * 10, 4, -18.4);
        mesh.userData = { id: i, type: 'symbol', active: false };
        scene.add(mesh);
        gameState.interactables.push(mesh);
        gameState.symbols.push(mesh);
    });

    // Porta 2 (Porta para Sala 3)
    const door2 = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(5, 7, 0.4), new THREE.MeshStandardMaterial({ color: 0xaaaaff }));
    leaf.position.x = 2.5;
    door2.add(leaf);
    door2.position.set(30, 0, 10.5);
    scene.add(door2);

    const dBox = new THREE.Box3().setFromObject(door2);
    gameState.door2 = { group: door2, leaf, open: false, box: dBox };
    gameState.walls.push({ box: dBox, type: 'door2' });
}

function createRoom3() {
    if (gameState.rooms.r3_active) return;
    gameState.rooms.r3_active = true;

    // Sala 3: O Labirinto de Orbes (Luz Magenta)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 40), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(30, 0, 45);
    scene.add(floor);

    addWall(30, 8, 1, 30, 4, 65); // Sul R3
    addWall(1, 8, 40, 15, 4, 45); // Oeste R3
    addWall(1, 8, 40, 45, 4, 45); // Leste R3

    const light3 = new THREE.PointLight(0xff00ff, 15, 30);
    light3.position.set(30, 6, 45);
    scene.add(light3);

    // Orbes Místicos
    const colors = [0xff0000, 0x00ff00, 0x0000ff];
    colors.forEach((col, i) => {
        const group = new THREE.Group();
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 32), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1 }));
        group.add(sphere);
        group.position.set(20 + i * 10, 2.5, 55);
        group.userData = { id: i, type: 'orb', active: false };
        scene.add(group);
        gameState.interactables.push(group);
        gameState.orbs.push(group);
    });

    // Final Door Area (Para Sala do Boss)
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.2, 1, 8), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    altar.position.set(30, 0.5, 63);
    scene.add(altar);
    const dBox = new THREE.Box3().setFromObject(altar);
    gameState.doorFinal = { mesh: altar, open: false, box: dBox };
    gameState.walls.push({ box: dBox, type: 'doorFinal' });
}

function createBossArena() {
    if (gameState.rooms.boss_active) return;
    gameState.rooms.boss_active = true;

    // Arena do Boss (Ampla e Super Clara)
    const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(30, 0, 100);
    scene.add(floor);

    const epicLight = new THREE.PointLight(0xffffff, 30, 50);
    epicLight.position.set(30, 15, 100);
    scene.add(epicLight);

    // Boss: Cérbero (Representação Gigante)
    const boss = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 4), new THREE.MeshStandardMaterial({ color: 0x550000 }));
    boss.add(body);

    gameState.heads = [];
    const hCols = [0xff5555, 0x55ff55, 0x5555ff];
    for (let i = 0; i < 3; i++) {
        const h = new THREE.Mesh(new THREE.SphereGeometry(1.5), new THREE.MeshStandardMaterial({ color: hCols[i], emissive: hCols[i], emissiveIntensity: 0.5 }));
        h.position.set(-3 + i * 3, 4, 2);
        h.userData = { id: i, hp: 100, colorName: i === 0 ? "Vermelha" : i === 1 ? "Verde" : "Azul" };
        boss.add(h);
        gameState.heads.push(h);
    }
    boss.position.set(30, 2.5, 115);
    scene.add(boss);
    gameState.bossObj = boss;
}

// --- SISTEMA DE JOGADOR ---

function initPlayer() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 3.5), matHero);
    mesh.position.set(0, 1.75, 5);
    mesh.castShadow = true;
    scene.add(mesh);
    gameState.player.mesh = mesh;
}

// --- LÓGICA DE CONTROLE E COLISÃO ---

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true;
    if (e.key === ' ') handleAttack();
});
window.addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (keys.hasOwnProperty(k)) keys[k] = false; });

function handleCollision(vx, vz) {
    const p = gameState.player.mesh;
    const oldX = p.position.x;
    const oldZ = p.position.z;

    // Tentar mover X
    p.position.x += vx;
    gameState.player.box.setFromObject(p);
    let hit = false;
    for (let w of gameState.walls) {
        if (gameState.player.box.intersectsBox(w.box)) { hit = true; break; }
    }
    if (hit) p.position.x = oldX;

    // Tentar mover Z
    p.position.z += vz;
    gameState.player.box.setFromObject(p);
    hit = false;
    for (let w of gameState.walls) {
        if (gameState.player.box.intersectsBox(w.box)) { hit = true; break; }
    }
    if (hit) p.position.z = oldZ;
}

function handleAttack() {
    if (!gameState.bossObj) return;
    const pPos = gameState.player.mesh.position;
    const weapon = gameState.player.inv[gameState.player.activeWeapon];

    gameState.heads.forEach(h => {
        if (!h.visible) return;
        const hPos = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld);
        const dist = pPos.distanceTo(hPos);

        if (dist < 12) {
            let dmg = false;
            if (h.userData.id === 0 && weapon === 'Faca Curta') dmg = true;
            if (h.userData.id === 1 && weapon === 'Pistola Velha') dmg = true;
            if (h.userData.id === 2 && weapon === 'Cetro Rúnico') dmg = true;

            if (dmg) {
                h.userData.hp -= 20;
                h.scale.multiplyScalar(0.9);
                showDialog("ACERTOU! CABEÇA " + h.userData.colorName + " PERDEU VIDA.");
                if (h.userData.hp <= 0) { h.visible = false; showDialog("UMA CABEÇA FOI DESTRUÍDA!"); }
            } else {
                showDialog("ARMA ERRADA! Tente outra arma contra a cabeça " + h.userData.colorName);
            }
        }
    });

    if (gameState.heads.every(h => !h.visible)) {
        showDialog("O GUARDIÃO FOI DERROTADO! VOCÊ ESTÁ LIVRE!");
        setTimeout(() => location.reload(), 5000);
    }
}

// --- INTERAÇÕES ---

function checkInteractions() {
    let best = null;
    let maxDist = 3.5;

    gameState.interactables.forEach(obj => {
        const dist = gameState.player.mesh.position.distanceTo(obj.position);
        if (dist < maxDist) {
            best = obj;
            maxDist = dist;
        }
    });

    if (best) {
        showPrompt("Pressione [E] para " + (best.userData.type === 'lever' ? 'Puxar' : best.userData.type === 'symbol' ? 'Tocar' : 'Ativar'));
        if (keys.e) {
            triggerInteraction(best);
            keys.e = false;
        }
    } else {
        hidePrompt();
    }
}

function triggerInteraction(obj) {
    const data = obj.userData;

    if (data.type === 'lever' && !data.active) {
        data.active = true;
        data.stick.rotation.z = -Math.PI / 4;
        gameState.leverSeq.push(data.id);
        if (gameState.leverSeq.length === 3) {
            if (JSON.stringify(gameState.leverSeq) === "[0,2,1]") {
                showDialog("Um rugido mecânico ecoa... A porta lateral abriu! (Obteve Faca Curta)");
                openDoor1();
                addToInv("Faca Curta", "slot-1", "🗡️");
            } else {
                showDialog("As alavancas travam e resetam. Tente outra ordem.");
                setTimeout(() => {
                    gameState.leverSeq = [];
                    gameState.levers.forEach(l => { l.userData.active = false; l.userData.stick.rotation.z = Math.PI / 4; });
                }, 800);
            }
        }
    }

    if (data.type === 'symbol' && !data.active) {
        data.active = true;
        obj.material.emissiveIntensity = 2;
        gameState.symbolSeq.push(data.id);
        if (gameState.symbolSeq.length === 3) {
            if (JSON.stringify(gameState.symbolSeq) === "[2,0,1]") {
                showDialog("O salão vibra com energia. Uma nova porta se abriu! (Obteve Pistola Velha)");
                openDoor2();
                addToInv("Pistola Velha", "slot-2", "🔫");
            } else {
                showDialog("Símbolos incorretos. A magia se dissipa.");
                setTimeout(() => {
                    gameState.symbolSeq = [];
                    gameState.symbols.forEach(s => { s.userData.active = false; s.material.emissiveIntensity = 0.5; });
                }, 1000);
            }
        }
    }

    if (data.type === 'orb' && !data.active) {
        data.active = true;
        obj.children[0].material.emissiveIntensity = 4;
        gameState.orbSeq.push(data.id);
        if (gameState.orbSeq.length === 3) {
            if (JSON.stringify(gameState.orbSeq) === "[1,0,2]") {
                showDialog("O altar brilhou! O caminho para o Cérbero está livre. (Obteve Cetro Rúnico)");
                openFinalPath();
                addToInv("Cetro Rúnico", "slot-3", "🔮");
            } else {
                showDialog("As orbes se apagam. Recomece o ritual.");
                setTimeout(() => {
                    gameState.orbSeq = [];
                    gameState.orbs.forEach(o => { o.userData.active = false; o.children[0].material.emissiveIntensity = 1; });
                }, 1000);
            }
        }
    }
}

// --- ANIMAÇÕES DE PORTA ---

function openDoor1() {
    gameState.door1.open = true;
    gameState.walls = gameState.walls.filter(w => w.type !== 'door1');
    let f = 0; const a = () => { f++; gameState.door1.leaf.position.x += 0.1; if (f < 45) requestAnimationFrame(a); }; a();
    createRoom2();
}

function openDoor2() {
    gameState.door2.open = true;
    gameState.walls = gameState.walls.filter(w => w.type !== 'door2');
    let f = 0; const a = () => { f++; gameState.door2.leaf.position.x += 0.12; if (f < 45) requestAnimationFrame(a); }; a();
    createRoom3();
}

function openFinalPath() {
    gameState.doorFinal.open = true;
    gameState.walls = gameState.walls.filter(w => w.type !== 'doorFinal');
    createBossArena();
}

// --- UI HELPERS ---
function showPrompt(t) { const el = document.getElementById('interaction-prompt'); el.innerText = t; el.classList.add('visible'); el.classList.remove('hidden'); }
function hidePrompt() { document.getElementById('interaction-prompt').classList.remove('visible'); }
function showDialog(t) { document.getElementById('dialog-text').innerText = t; document.getElementById('dialog-box').classList.add('visible'); }
document.getElementById('close-dialog').onclick = () => document.getElementById('dialog-box').classList.remove('visible');
function addToInv(name, id, icon) { const s = document.getElementById(id); s.innerHTML = icon; s.classList.add('active'); gameState.player.inv.push(name); gameState.player.activeWeapon = gameState.player.inv.length - 1; document.getElementById('weapon-name').innerText = name; }

// --- LOOP PRINCIPAL ---

function update() {
    if (!gameState.player.mesh) return;

    // Movimento com Colisão
    let vx = 0, vz = 0;
    if (keys.w) vz -= gameState.player.speed;
    if (keys.s) vz += gameState.player.speed;
    if (keys.a) vx -= gameState.player.speed;
    if (keys.d) vx += gameState.player.speed;
    handleCollision(vx, vz);

    // Tocha segue o jogador
    gameState.torch.position.set(gameState.player.mesh.position.x, 3, gameState.player.mesh.position.z + 1);

    // Herói sempre encara a câmera
    gameState.player.mesh.rotation.y = Math.atan2(camera.position.x - gameState.player.mesh.position.x, camera.position.z - gameState.player.mesh.position.z);

    // Câmera persegue suavemente
    const targetCam = new THREE.Vector3(gameState.player.mesh.position.x, 10, gameState.player.mesh.position.z + 16);
    camera.position.lerp(targetCam, 0.1);
    camera.lookAt(gameState.player.mesh.position.x, 2, gameState.player.mesh.position.z);

    checkInteractions();
}

function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
}

// --- BOOT ---
initLights();
createHub();
initPlayer();
animate();

window.addEventListener('load', () => { setTimeout(() => { const ls = document.getElementById('loading-screen'); ls.style.opacity = '0'; setTimeout(() => ls.style.display = 'none', 1200); }, 1500); });
window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
