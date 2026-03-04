import * as THREE from 'three';

/**
 * O GUARDIÃO DO PORÃO - VERSÃO DEFINITIVA
 * Foco: Qualidade Visual, Colisões Robustas e Gameplay Fluido.
 */

// --- CONFIGURAÇÃO GLOBAL ---
const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.Fog(0x050508, 10, 40);

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
    const t = textureLoader.load(assetsPath + file, undefined, undefined, () => console.warn("Asset não encontrado: " + file));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
    return t;
};

const floorTex = loadTexture('floor.png', 12, 12);
const wallTex = loadTexture('wall.png', 4, 1);
const heroTex = textureLoader.load(assetsPath + 'hero.png');

const matFloor = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x555555, roughness: 0.8 });
const matWall = new THREE.MeshStandardMaterial({ map: wallTex, color: 0x777777, roughness: 0.9 });
const matHero = new THREE.MeshStandardMaterial({ map: heroTex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });

// --- ESTADO DO JOGO ---
const gameState = {
    player: {
        mesh: null,
        box: new THREE.Box3(),
        speed: 0.15,
        targetPos: new THREE.Vector3(),
        inv: [],
        hp: 100,
        activeWeapon: -1
    },
    rooms: { r1: true, r2: false, r3: false, r4: false },
    levers: [],
    leverSeq: [],
    symbols: [],
    symbolSeq: [],
    orbs: [],
    orbColors: [0xff0000, 0x00ff00, 0x0000ff], // Red, Green, Blue
    boss: null,
    walls: [], // Para colisões realistas
    interactables: []
};

const keys = { w: false, a: false, s: false, d: false, e: false };

// --- CONSTRUTORES DE AMBIENTE ---

function createLight(color, intensity, pos, move = false) {
    const light = new THREE.PointLight(color, intensity, 15);
    light.position.copy(pos);
    light.castShadow = true;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    scene.add(light);
    if (move) {
        return { light, originY: pos.y };
    }
    return light;
}

const lights = [];
function initLights() {
    scene.add(new THREE.AmbientLight(0x4040ff, 0.4)); // Luz azulada mágica ambiental
    lights.push(createLight(0xffaa22, 20, new THREE.Vector3(0, 4, 0), true)); // Luz do Hub
}

function addWall(w, h, d, x, y, z, mat = matWall) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    scene.add(mesh);
    const box = new THREE.Box3().setFromObject(mesh);
    gameState.walls.push(box);
    return mesh;
}

function createHub() {
    // Chão Central
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Paredes HUB
    addWall(20, 10, 1, 0, 5, -10); // Norte
    addWall(1, 10, 30, -10, 5, 5); // Oeste
    addWall(1, 10, 30, 10, 5, 5);  // Leste

    // Puzzle 1: Alavancas
    for (let i = 0; i < 3; i++) {
        const group = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1, 0.4), new THREE.MeshStandardMaterial({ color: 0x333333 }));
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1), new THREE.MeshStandardMaterial({ color: 0xaaaaaa }));
        stick.position.y = 0.5;
        stick.rotation.z = Math.PI / 4;
        group.add(base); group.add(stick);
        group.position.set(-4 + i * 4, 1, -9.3);
        group.userData = { id: i, type: 'lever', active: false, stick: stick };
        scene.add(group);
        gameState.interactables.push(group);
        gameState.levers.push(group);
    }

    // Porta 1 -> Sala 2
    const dG = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(3, 6, 0.3), new THREE.MeshStandardMaterial({ color: 0x442200, emissive: 0x221100 }));
    dG.add(leaf);
    leaf.position.x = 1.5;
    dG.position.set(9.5, 0, -5);
    dG.rotation.y = Math.PI / 2;
    scene.add(dG);
    gameState.door1 = { mesh: dG, leaf: leaf, open: false, box: new THREE.Box3().setFromObject(dG) };
    gameState.walls.push(gameState.door1.box);
}

function createRoom2() {
    // Sala dos Símbolos (Brilhante e Azul)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(20, 0, -5);
    scene.add(floor);

    addWall(20, 10, 1, 20, 5, -15); // Norte R2
    addWall(20, 10, 1, 20, 5, 5);  // Sul R2
    addWall(1, 10, 20, 30, 5, -5);  // Leste R2

    createLight(0x00ffff, 15, new THREE.Vector3(20, 6, -5));

    // Símbolos
    const symbolsChars = ["🔯", "☯️", "⚛️"];
    symbolsChars.forEach((char, i) => {
        const canvas = document.createElement('canvas');
        canvas.width = 128; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#00ffff'; ctx.font = 'bold 80px Outfit';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowBlur = 10; ctx.shadowColor = '#00ffff';
        ctx.fillText(char, 64, 64);

        const tex = new THREE.CanvasTexture(canvas);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), new THREE.MeshStandardMaterial({ map: tex, transparent: true, emissive: 0x005555 }));
        mesh.position.set(15 + i * 5, 4, -14.4);
        mesh.userData = { id: i, type: 'symbol', active: false };
        scene.add(mesh);
        gameState.interactables.push(mesh);
        gameState.symbols.push(mesh);
    });

    // Porta 2 -> Sala 3
    const dG = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(4, 6, 0.3), new THREE.MeshStandardMaterial({ color: 0x111122, emissive: 0x001133 }));
    dG.add(leaf);
    leaf.position.x = 2;
    dG.position.set(20, 0, 4.5);
    scene.add(dG);
    gameState.door2 = { mesh: dG, leaf: leaf, open: false, box: new THREE.Box3().setFromObject(dG) };
    gameState.walls.push(gameState.door2.box);
}

function createRoom3() {
    // Labirinto Mágico (Cores e Espelhos)
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 30), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(20, 0, 20);
    scene.add(floor);

    addWall(20, 10, 1, 20, 5, 35); // Sul R3
    addWall(1, 10, 30, 10, 5, 20); // Oeste R3
    addWall(1, 10, 30, 30, 5, 20); // Leste R3

    // Puzzle: Orbes de Cor
    const orbColors = [0xff0000, 0x00ff00, 0x0000ff];
    orbColors.forEach((color, i) => {
        const group = new THREE.Group();
        const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), new THREE.MeshStandardMaterial({ color: color, emissive: color, emissiveIntensity: 2 }));
        const glow = new THREE.PointLight(color, 5, 5);
        group.add(sphere); group.add(glow);
        group.position.set(15 + i * 5, 2, 25);
        group.userData = { id: i, type: 'orb', active: false };
        scene.add(group);
        gameState.interactables.push(group);
        gameState.orbs.push(group);
    });

    createLight(0xff00ff, 10, new THREE.Vector3(20, 5, 20));

    // Altar Final (Porta Boss)
    const altar = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, 1, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    altar.position.set(20, 0.5, 30);
    scene.add(altar);
    gameState.doorFinal = { open: false, box: new THREE.Box3().setFromObject(altar) };
    gameState.walls.push(gameState.doorFinal.box);
}

function createBossRoom() {
    // Arena do Cérbero
    const floor = new THREE.Mesh(new THREE.CircleGeometry(25, 64), matFloor);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(20, 0, 60);
    scene.add(floor);

    createLight(0xff4422, 30, new THREE.Vector3(20, 10, 60));

    // Boss: Cérbero (Representação 2.5D Complexa)
    const bossGroup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 3), new THREE.MeshStandardMaterial({ color: 0x440000 }));
    bossGroup.add(body);

    gameState.bossHeads = [];
    const headColors = [0xff2222, 0x22ff22, 0x2222ff];
    for (let i = 0; i < 3; i++) {
        const head = new THREE.Mesh(new THREE.SphereGeometry(1.2), new THREE.MeshStandardMaterial({ color: headColors[i], emissive: headColors[i], emissiveIntensity: 0.5 }));
        head.position.set(-2.5 + i * 2.5, 3.5, 1);
        head.userData = { id: i, hp: 100, color: headColors[i] };
        bossGroup.add(head);
        gameState.bossHeads.push(head);
    }

    bossGroup.position.set(20, 2, 80);
    scene.add(bossGroup);
    gameState.boss = bossGroup;
}

// --- SISTEMA DE JOGADOR & CONTROLES ---

function initPlayer() {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.6), matHero);
    mesh.position.set(0, 1.8, 5);
    mesh.castShadow = true;
    scene.add(mesh);
    gameState.player.mesh = mesh;
}

window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = true;
    if (e.key === ' ') handleAction();
});
window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (keys.hasOwnProperty(k)) keys[k] = false;
});

function handleAction() {
    if (gameState.boss) {
        // Lógica de Ataque ao Boss
        gameState.bossHeads.forEach(head => {
            const dist = gameState.player.mesh.position.distanceTo(gameState.boss.position.clone().add(head.position));
            if (dist < 10 && head.visible) {
                const weapon = gameState.player.inv[gameState.player.activeWeapon];
                let effective = false;
                if (head.userData.id === 0 && weapon === 'Faca Curta') effective = true;
                if (head.userData.id === 1 && weapon === 'Pistola Velha') effective = true;
                if (head.userData.id === 2 && weapon === 'Cetro Rúnico') effective = true;

                if (effective) {
                    head.userData.hp -= 25;
                    head.scale.multiplyScalar(0.9);
                    showDialog("DANO CRÍTICO NA CABEÇA!");
                    if (head.userData.hp <= 0) {
                        head.visible = false;
                        showDialog("UMA CABEÇA FOI DERROTADA!");
                    }
                } else {
                    showDialog("ESSA ARMA NÃO CAUSA DANO AQUI!");
                }
            }
        });

        if (gameState.bossHeads.every(h => !h.visible)) {
            showDialog("O GUARDIÃO CAIU! VOCÊ ESCAPOU DO PORÃO.");
            setTimeout(() => location.reload(), 5000);
        }
    }
}

// --- LOOP DE ATUALIZAÇÃO ---

function updateCollision(moveX, moveZ) {
    const pMesh = gameState.player.mesh;
    const oldPos = pMesh.position.clone();

    // Testa X
    pMesh.position.x += moveX;
    gameState.player.box.setFromObject(pMesh);
    let collision = false;
    for (let wall of gameState.walls) {
        if (gameState.player.box.intersectsBox(wall)) { collision = true; break; }
    }
    if (collision) pMesh.position.x = oldPos.x;

    // Testa Z
    pMesh.position.z += moveZ;
    gameState.player.box.setFromObject(pMesh);
    collision = false;
    for (let wall of gameState.walls) {
        if (gameState.player.box.intersectsBox(wall)) { collision = true; break; }
    }
    if (collision) pMesh.position.z = oldPos.z;
}

function update() {
    const delta = clock.getDelta();
    const p = gameState.player;
    if (!p.mesh) return;

    // Movimentação
    let mX = 0, mZ = 0;
    if (keys.w) mZ -= p.speed;
    if (keys.s) mZ += p.speed;
    if (keys.a) mX -= p.speed;
    if (keys.d) mX += p.speed;
    updateCollision(mX, mZ);

    // Billboarding (Efeito 2.5D)
    p.mesh.rotation.y = Math.atan2(camera.position.x - p.mesh.position.x, camera.position.z - p.mesh.position.z);

    // Câmera Suave
    const targetCam = new THREE.Vector3(p.mesh.position.x, 10, p.mesh.position.z + 16);
    camera.position.lerp(targetCam, 0.08);
    camera.lookAt(p.mesh.position.x, 2, p.mesh.position.z);

    // Animação de Luzes
    lights.forEach(l => {
        if (l.light) l.light.position.y = l.originY + Math.sin(Date.now() * 0.002) * 0.5;
    });

    // Interações
    checkInteractions();
}

function checkInteractions() {
    let nearInteractable = null;
    let minDist = 3;

    gameState.interactables.forEach(obj => {
        const dist = gameState.player.mesh.position.distanceTo(obj.position);
        if (dist < minDist) {
            nearInteractable = obj;
            minDist = dist;
        }
    });

    if (nearInteractable) {
        showPrompt("Pressione [E] para interagir");
        if (keys.e) {
            handleInteraction(nearInteractable);
            keys.e = false;
        }
    } else {
        hidePrompt();
    }
}

function handleInteraction(obj) {
    const data = obj.userData;

    if (data.type === 'lever' && !data.active) {
        data.active = true;
        data.stick.rotation.z = -Math.PI / 4;
        gameState.leverSeq.push(data.id);
        if (gameState.leverSeq.length === 3) {
            if (JSON.stringify(gameState.leverSeq) === "[0,2,1]") {
                showDialog("Você ouviu um som de engrenagens... A passagem abriu! (Obteve: Faca Curta)");
                openDoor1();
                addToInv("Faca Curta", "slot-1", "🗡️");
            } else {
                showDialog("Nada aconteceu... As alavancas resetaram.");
                setTimeout(resetLevers, 800);
            }
        }
    }

    if (data.type === 'symbol' && !data.active) {
        data.active = true;
        obj.material.emissive.set(0x00ffff);
        gameState.symbolSeq.push(data.id);
        if (gameState.symbolSeq.length === 3) {
            if (JSON.stringify(gameState.symbolSeq) === "[2,0,1]") {
                showDialog("Uma aura mística te envolve. Você se sente mais forte. (Obteve: Pistola Velha)");
                openDoor2();
                addToInv("Pistola Velha", "slot-2", "🔫");
            } else {
                showDialog("Os símbolos brilham em vermelho e apagam.");
                setTimeout(resetSymbols, 800);
            }
        }
    }

    if (data.type === 'orb' && !data.active) {
        data.active = true;
        obj.children[0].material.emissiveIntensity = 5;
        gameState.orbSeq = gameState.orbSeq || [];
        gameState.orbSeq.push(data.id);
        if (gameState.orbSeq.length === 3) {
            if (JSON.stringify(gameState.orbSeq) === "[1,0,2]") {
                showDialog("O altar central se ilumina! O caminho para o Guardião está aberto. (Obteve: Cetro Rúnico)");
                openFinalPath();
                addToInv("Cetro Rúnico", "slot-3", "🔮");
            } else {
                showDialog("As orbes tremem e apagam.");
                setTimeout(resetOrbs, 800);
            }
        }
    }
}

// --- HELPERS DE PUZZLE ---

function openDoor1() {
    gameState.door1.open = true;
    gameState.walls = gameState.walls.filter(b => b !== gameState.door1.box);
    let f = 0; const a = () => { f++; gameState.door1.leaf.position.x += 0.08; if (f < 50) requestAnimationFrame(a); }; a();
    createRoom2();
}

function openDoor2() {
    gameState.door2.open = true;
    gameState.walls = gameState.walls.filter(b => b !== gameState.door2.box);
    let f = 0; const a = () => { f++; gameState.door2.leaf.position.x += 0.08; if (f < 50) requestAnimationFrame(a); }; a();
    createRoom3();
}

function openFinalPath() {
    gameState.doorFinal.open = true;
    gameState.walls = gameState.walls.filter(b => b !== gameState.doorFinal.box);
    createBossRoom();
}

function resetLevers() {
    gameState.leverSeq = [];
    gameState.levers.forEach(l => {
        l.userData.active = false;
        l.userData.stick.rotation.z = Math.PI / 4;
    });
}

function resetSymbols() {
    gameState.symbolSeq = [];
    gameState.symbols.forEach(s => {
        s.userData.active = false;
        s.material.emissive.set(0x005555);
    });
}

function resetOrbs() {
    gameState.orbSeq = [];
    gameState.orbs.forEach(o => {
        o.userData.active = false;
        o.children[0].material.emissiveIntensity = 2;
    });
}

// --- UI HELPERS ---
function showPrompt(t) { const el = document.getElementById('interaction-prompt'); el.innerText = t; el.classList.add('visible'); el.classList.remove('hidden'); }
function hidePrompt() { const el = document.getElementById('interaction-prompt'); el.classList.remove('visible'); }
function showDialog(t) { document.getElementById('dialog-text').innerText = t; document.getElementById('dialog-box').classList.add('visible'); }
document.getElementById('close-dialog').onclick = () => document.getElementById('dialog-box').classList.remove('visible');
function addToInv(name, slotId, icon) {
    const s = document.getElementById(slotId);
    s.innerHTML = icon;
    s.classList.add('active');
    gameState.player.inv.push(name);
    gameState.player.activeWeapon = gameState.player.inv.length - 1;
    document.getElementById('weapon-name').innerText = name;
}

// --- BOOTSTRAP ---
function init() {
    initLights();
    createHub();
    initPlayer();

    function animateLoop() {
        requestAnimationFrame(animateLoop);
        update();
        renderer.render(scene, camera);
    }
    animateLoop();

    // Resize
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Finalize Loading
    setTimeout(() => {
        const ls = document.getElementById('loading-screen');
        ls.style.opacity = '0';
        setTimeout(() => ls.style.display = 'none', 1200);
    }, 2500);
}

init();
