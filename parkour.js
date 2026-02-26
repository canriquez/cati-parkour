// Validar que THREE y CANNON se hayan cargado correctamente
if (typeof THREE === 'undefined') {
    console.error("Three.js no está cargado.");
}
if (typeof CANNON === 'undefined') {
    console.error("Cannon.js no está cargado.");
}

// -----------------------------------------------------------------
// CONFIGURACIÓN DE MOTOR DE FÍSICAS (CANNON.JS)
// -----------------------------------------------------------------
// El mundo físico donde vivirán las colisiones
const world = new CANNON.World();
world.gravity.set(0, -35, 0); // Gravedad hacia abajo
world.broadphase = new CANNON.NaiveBroadphase();
world.solver.iterations = 10;

// Material físico básico (con un poco de fricción)
const physMaterial = new CANNON.Material("standard");
const physContactMaterial = new CANNON.ContactMaterial(physMaterial, physMaterial, {
    friction: 0.1,
    restitution: 0.0 // Sin rebote al caer
});
world.addContactMaterial(physContactMaterial);

// -----------------------------------------------------------------
// CONFIGURACIÓN DE GRÁFICOS (THREE.JS)
// -----------------------------------------------------------------
const scene = new THREE.Scene();

// Guardamos los colores objetivo de Día y Noche para transicionar
const dayColor = new THREE.Color(0x87ceeb);
const nightColor = new THREE.Color(0x0a0a1a);
scene.background = new THREE.Color(0x87ceeb); // Color cielo inicial
scene.fog = new THREE.Fog(0x87ceeb, 15, 100);

// Variable para el ciclo de tiempo (Aumenta infinitamente)
// Configuramos para que un ciclo completo DÍA+NOCHE dure 24 minutos (12 min cada uno aprox)
// a 60 FPS = 3600 frames por minuto. 24 mins = 86400 frames para un círculo completo (Math.PI * 2)
let timeSeconds = 0;

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Controles en Primera Persona (PointerLockControls)
const controls = new THREE.PointerLockControls(camera, document.body);

const infoEl = document.getElementById('info');
const hudEl = document.getElementById('hud');
const progressBarEl = document.getElementById('progressBar');
const scoreTextEl = document.getElementById('scoreText');
const winMessageEl = document.getElementById('winMessage');
const loseMessageEl = document.getElementById('loseMessage');
const livesContainerEl = document.getElementById('livesContainer');
const livesBarEl = document.getElementById('livesBar');
const livesTextEl = document.getElementById('livesText');
const timerContainerEl = document.getElementById('timerContainer');
const timeTextEl = document.getElementById('timeText');
const timeBarEl = document.getElementById('timeBar');
const startScreenEl = document.getElementById('startScreen');
const startButtonEl = document.getElementById('startButton');

document.addEventListener('click', (e) => {
    if (!controls.isLocked) {
        // Solo atrapar el ratón si ya pasamos la pantalla principal, o si le dimos click exactamente al botón.
        if (startScreenEl.style.display === 'none' || e.target === startButtonEl) {
            controls.lock();
        }
    }
});

controls.addEventListener('lock', () => {
    if (startScreenEl) startScreenEl.style.display = 'none';
    if (infoEl) infoEl.style.display = 'none';
    if (hudEl) hudEl.style.display = 'block'; // Mostrar progreso al jugar
    if (livesContainerEl) livesContainerEl.style.display = 'block'; // Mostrar barrita de vidas
    if (timerContainerEl) timerContainerEl.style.display = 'block'; // Mostrar temporizador
});

controls.addEventListener('unlock', () => {
    // Mostrar cartel de pausa si la pantalla inicial no está
    if (startScreenEl && startScreenEl.style.display === 'none') {
        if (infoEl) infoEl.style.display = 'block';
    }
});
scene.add(controls.getObject());

// -----------------------------------------------------------------
// SISTEMA DE TIEMPO, PUNTOS Y REINICIO
// -----------------------------------------------------------------
const maxTimeLeft = 180; // 3 minutos en segundos
let timeLeft = maxTimeLeft;

let score = 0;
let collectibles = [];
const maxScore = 100;

let lives = 100;
const maxLives = 100;
let highestY = 0; // Para rastrear desde dónde se cayó
let hasWon = false;

function triggerCelebration() {
    // Sonido de victoria con Oscilador (para no depender de MP3s cargando)
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        function playNote(frequency, startTime, duration) {
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);

            gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.start(startTime);
            oscillator.stop(startTime + duration);
        }

        const t = audioCtx.currentTime;
        playNote(523.25, t, 0.2); // Do
        playNote(659.25, t + 0.2, 0.2); // Mi
        playNote(783.99, t + 0.4, 0.2); // Sol
        playNote(1046.50, t + 0.6, 0.6); // Do Acut
    } catch (e) { }

    // Lluvia de confeti
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;

    (function frame() {
        if (typeof confetti !== 'undefined') {
            confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#ffbb00', '#33ccff'] });
            confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#ff3366', '#33ff66'] });
        }
        if (Date.now() < animationEnd) {
            requestAnimationFrame(frame);
        }
    }());
}

function updateHUD() {
    if (!scoreTextEl || !progressBarEl) return;
    const progress = Math.min((score / collectibles.length) * maxScore, maxScore);
    scoreTextEl.innerText = Math.floor(progress);
    progressBarEl.style.width = progress + '%';

    if (progress >= maxScore) {
        winMessageEl.style.display = 'block';
        if (!hasWon) {
            hasWon = true;
            triggerCelebration();
        }
    } else {
        winMessageEl.style.display = 'none';
        hasWon = false;
    }
}

function updateLivesHUD() {
    if (!livesBarEl) return;
    const progress = (lives / maxLives) * 100;
    livesBarEl.style.width = progress + '%';
    if (livesTextEl) livesTextEl.innerText = Math.floor(progress);

    if (progress <= 20) {
        livesBarEl.style.backgroundColor = '#ff0000'; // Rojo de peligro
    } else {
        livesBarEl.style.backgroundColor = '#ff3366'; // Rosado normal
    }
}

function updateTimerHUD() {
    if (!timeTextEl || !timeBarEl) return;

    // Formatear SS a MM:SS
    const minutes = Math.floor(timeLeft / 60);
    const seconds = Math.floor(timeLeft % 60);
    timeTextEl.innerText = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

    const progress = (timeLeft / maxTimeLeft) * 100;
    timeBarEl.style.width = progress + '%';

    if (progress <= 20) {
        timeBarEl.style.backgroundColor = '#ff0000'; // Rojo de peligro
    } else {
        timeBarEl.style.backgroundColor = '#33ccff'; // Celeste normal
    }
}

function resetGame() {
    // Volver al spawn
    playerBody.position.set(0, 5, 20);
    playerBody.velocity.set(0, 0, 0);
    highestY = 0;
    timeLeft = maxTimeLeft;
    updateTimerHUD();
    ammo = 0;
    updateAmmoHUD();
    // Reiniciar puntos
    score = 0;
    collectibles.forEach(c => {
        c.collected = false;
        c.mesh.visible = true;
    });
    spiralStairs.forEach(stair => {
        if (!stair.active) {
            scene.add(stair.mesh);
            world.addBody(stair.body);
            stair.active = true;
        }
    });

    updateHUD();
}

function showLoseMessage() {
    if (!loseMessageEl) return;
    loseMessageEl.style.display = 'block';
    setTimeout(() => {
        loseMessageEl.style.display = 'none';
    }, 4000); // Se oculta a los 4 segundos
}

function createCollectible(x, y, z) {
    // Creado en forma de un pequeño rombo u objeto amarillo flotante
    const geom = new THREE.OctahedronGeometry(0.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffdd00, roughness: 0.3, metalness: 0.8 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y + 0.5, z); // Flotando un poquito arriba
    mesh.castShadow = true;

    scene.add(mesh);
    collectibles.push({ mesh: mesh, collected: false, baseY: y + 0.5 });
    updateHUD();
}



// -----------------------------------------------------------------
// EL JUGADOR (FÍSICAS)
// -----------------------------------------------------------------
const playerRadius = 1.0;
// Forma de esfera para que se deslice bien y no se tranque en las esquinas
const playerShape = new CANNON.Sphere(playerRadius);
const playerBody = new CANNON.Body({ mass: 60, shape: playerShape, material: physMaterial });
playerBody.position.set(0, 5, 20); // Aparece un poco elevado para caer
playerBody.fixedRotation = true;   // No queremos que ruede como una pelota
playerBody.updateMassProperties();
world.addBody(playerBody);

const keys = { w: false, a: false, s: false, d: false };
let canJump = false;

document.addEventListener('keydown', (e) => {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') keys.w = true;
    if (code === 'KeyA' || code === 'ArrowLeft') keys.a = true;
    if (code === 'KeyS' || code === 'ArrowDown') keys.s = true;
    if (code === 'KeyD' || code === 'ArrowRight') keys.d = true;
    if (code === 'Space' && canJump) {
        playerBody.velocity.y = 11; // Fuerza del salto (reducida para ser más realista y controlable)
        canJump = false;
    }
});
document.addEventListener('keyup', (e) => {
    const code = e.code;
    if (code === 'KeyW' || code === 'ArrowUp') keys.w = false;
    if (code === 'KeyA' || code === 'ArrowLeft') keys.a = false;
    if (code === 'KeyS' || code === 'ArrowDown') keys.s = false;
    if (code === 'KeyD' || code === 'ArrowRight') keys.d = false;
});

// Detectar si el jugador está tocando el piso
world.addEventListener('postStep', () => {
    // Asumimos que no puede saltar salvo que confirmemos que toca algo por debajo
    let contactFloor = false;
    for (let i = 0; i < world.contacts.length; i++) {
        const c = world.contacts[i];
        if (c.bi === playerBody || c.bj === playerBody) {
            // Verificar si la normal de colisión apunta hacia arriba
            if (c.bi === playerBody) {
                c.ni.negate(c.ni); // Asegurarse de que ni apunta DE a hacia b
            }
            // Si la normal y apunta fuertemente hacia abajo relativo al body, estamos sobre el piso
            if (c.ni.y < -0.5 || c.ni.y > 0.5) { // Cannon aveces invierte las normales dependiendo del orden bi bj
                contactFloor = true;
                break;
            }
        }
    }
    canJump = contactFloor;
});

// -----------------------------------------------------------------
// ILUMINACIÓN Y ENTORNO
// -----------------------------------------------------------------
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffe0, 1.2);
// Ajustamos la luz para moverse más tarde
dirLight.position.set(15, 30, 15);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 100;
dirLight.shadow.camera.top = 25;
dirLight.shadow.camera.bottom = -25;
dirLight.shadow.camera.left = -25;
dirLight.shadow.camera.right = 25;
scene.add(dirLight);

// Array para guardar materiales de ventanas que deben brillar intensamente de noche
const windowMaterials = [];

// Suelo Visual
const floorGeometry = new THREE.PlaneGeometry(80, 80);
const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x3e8531, roughness: 1.0, metalness: 0.0 });
const floor = new THREE.Mesh(floorGeometry, floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Suelo Físico (Plano infinito en CANNON)
const floorShape = new CANNON.Plane();
const floorPhysObj = new CANNON.Body({ mass: 0, shape: floorShape, material: physMaterial });
// Cannon los planos miran al Z positivo por defecto, en Three miramos hacia Y, lo rotamos
floorPhysObj.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(floorPhysObj);

const gridHelper = new THREE.GridHelper(80, 40, 0x000000, 0x000000);
gridHelper.material.opacity = 0.2;
gridHelper.material.transparent = true;
scene.add(gridHelper);

// -----------------------------------------------------------------
// TEXTURAS COMPARTIDAS
// -----------------------------------------------------------------
function createBrickTextureCanvas(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8b3232'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#b0b0b0';
    const brickWidth = 128; const brickHeight = 64; const mortar = 4;
    for (let y = 0; y < canvas.height; y += brickHeight) {
        const offset = (y / brickHeight) % 2 === 0 ? 0 : brickWidth / 2;
        ctx.fillRect(0, y - mortar / 2, canvas.width, mortar);
        for (let x = -brickWidth; x < canvas.width; x += brickWidth) {
            ctx.fillRect(x + offset - mortar / 2, y, mortar, brickHeight);
        }
    }
    return canvas;
}
const sharedBrickTexture = new THREE.CanvasTexture(createBrickTextureCanvas(512, 512));
sharedBrickTexture.wrapS = THREE.RepeatWrapping; sharedBrickTexture.wrapT = THREE.RepeatWrapping;

function createGraffitiTexture(text, hue) {
    const baseCanvas = createBrickTextureCanvas(1024, 512);
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512; const ctx = canvas.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0);
    ctx.font = 'bold 150px "Impact", sans-serif'; ctx.fillStyle = hue;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = hue; ctx.shadowBlur = 25;
    ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate((Math.random() - 0.5) * 0.3);
    ctx.fillText(text, 0, 0); ctx.fillText(text, 0, 0);
    ctx.shadowBlur = 0; ctx.strokeStyle = '#222'; ctx.lineWidth = 8; ctx.strokeText(text, 0, 0); ctx.restore();
    return new THREE.CanvasTexture(canvas);
}

// -----------------------------------------------------------------
// OBJETOS Y FÍSICAS
// -----------------------------------------------------------------
const benchGeom = new THREE.BoxGeometry(4, 0.4, 1.2);
const legGeom = new THREE.BoxGeometry(0.4, 1, 0.8);
const benchMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
const metalMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6, metalness: 0.7 });

function createBench(x, z, rotationY, baseY = 0) {
    const group = new THREE.Group();
    const seat = new THREE.Mesh(benchGeom, benchMat);
    seat.position.y = 1; seat.castShadow = true; seat.receiveShadow = true; group.add(seat);
    const leg1 = new THREE.Mesh(legGeom, metalMat);
    leg1.position.set(-1.5, 0.5, 0); leg1.castShadow = true; leg1.receiveShadow = true; group.add(leg1);
    const leg2 = new THREE.Mesh(legGeom, metalMat);
    leg2.position.set(1.5, 0.5, 0); leg2.castShadow = true; leg2.receiveShadow = true; group.add(leg2);
    group.position.set(x, baseY, z); group.rotation.y = rotationY;
    scene.add(group);

    // Punito coleccionable encima del banco
    createCollectible(x, baseY + 1.2, z);

    // FÍSICA: Una caja perimetral simple
    const shape = new CANNON.Box(new CANNON.Vec3(2, 0.7, 0.6)); // Dimensiones mitad: ancho/2, alto/2, prof/2
    const body = new CANNON.Body({ mass: 0, shape: shape, material: physMaterial });
    body.position.set(x, baseY + 0.7, z); // Elevamos al centro aprox
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), rotationY);
    world.addBody(body);
}

// Colocación de bancos
createBench(-6, 8, Math.PI / 4); createBench(6, 8, -Math.PI / 4); createBench(0, -10, 0);
createBench(12, 0, Math.PI / 2); createBench(-12, -4, -Math.PI / 6); createBench(-8, 14, Math.PI / 8);
createBench(16, 10, -Math.PI / 3); createBench(0, 15, Math.PI);

const solidMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: sharedBrickTexture, roughness: 0.9 });
function createStrangeWall(x, y, z, width, height, depth, rotY, rotZ, text, textColor) {
    const geom = new THREE.BoxGeometry(width, height, depth);
    const graffitiMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: createGraffitiTexture(text, textColor), roughness: 0.9 });
    const materials = [solidMaterial, solidMaterial, solidMaterial, solidMaterial, graffitiMat, graffitiMat];
    const wall = new THREE.Mesh(geom, materials);
    wall.position.set(x, y, z); wall.rotation.y = rotY; wall.rotation.z = rotZ;
    wall.castShadow = true; wall.receiveShadow = true;
    scene.add(wall);

    // FÍSICA: Muro extraño
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const body = new CANNON.Body({ mass: 0, shape: shape, material: physMaterial });
    body.position.set(x, y, z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rotY, rotZ));
    body.quaternion.set(q.x, q.y, q.z, q.w);
    world.addBody(body);
}

// Paredes raras
createStrangeWall(-10, 3, -6, 8, 6, 1.5, Math.PI / 6, 0.1, 'JUMP!', '#ff2255');
createStrangeWall(10, 4, -4, 5, 8, 1.2, -Math.PI / 3, -0.15, 'URBAN', '#00ffcc');
createStrangeWall(15, 2, 15, 10, 4, 1, 0, 0, 'PKR-LIFE', '#ffcc00'); // Movido hacia el lado para no bloquear el inicio
createStrangeWall(-12, 2.5, 5, 4, 5, 1, Math.PI / 2, 0, 'W-RUN', '#cc00ff');

// Removida la enorme plataforma central porque estorbaba en el spawn y camino.
createCollectible(0, 0.5, 0); // Coleccionable movido al piso


function createPlatform(x, z, width, height, depth, baseY = 0, color = 0xcc4422) {
    const geom = new THREE.BoxGeometry(width, height, depth);
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, baseY + height / 2, z); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);

    // Punto coleccionable encima de cada plataforma/caja
    createCollectible(x, baseY + height, z);

    // FÍSICA: Plataforma
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const body = new CANNON.Body({ mass: 0, shape: shape, material: physMaterial });
    body.position.set(x, baseY + height / 2, z);
    world.addBody(body);
}

function createBox(x, z, scale, baseY = 0, color = 0xcc4422) {
    createPlatform(x, z, scale, scale, scale, baseY, color);
}

// Cajas iniciales más chicas y bajas para ir acostumbrándose al salto
createBox(0, -2, 1.0, 0, 0xff7733);
createBox(0, -6, 1.5, 0, 0x33aaee);
createBox(0, -10, 1.8, 0, 0x55cc55);

// Camino secundario
createBox(4, -6, 1.4); createBox(7, -6, 1.6); createBox(10, -6, 1.8); createBox(13, -6, 2.2);

// El Gran Ascenso: Más difícil, más largo y mucho más alto
createPlatform(-4, -13, 3, 0.5, 3, 1.5, 0xffaa00); // 1. Plataforma ancha naranja
createPlatform(-9, -15, 2, 0.5, 2, 3.0, 0x33ccff); // 2. Plataforma azul (Salto medio)
createBox(-13, -13, 1.5, 4.0, 0xff3366);           // 3. Cubo rosa (Bajado)
createPlatform(-17, -9, 4, 0.2, 1.5, 6.0, 0x9933ff);// 4. Tabla morada
createBench(-16, -2, Math.PI / 3, 6.6);            // 5. Banco flotante alejado
createPlatform(-10, 0, 1.5, 0.5, 1.5, 8.3, 0x33ff66); // 6. Plataforma verde muy chiquita, salto preciso
createBox(-8, 5, 2.0, 8.0, 0xdddd22);             // 7. Cubo amarillo hacia el otro lado
createPlatform(-2, 8, 1.5, 0.5, 4, 10.7, 0xff5522); // 8. Tabla larga roja horizontal
createPlatform(4, 12, 2, 1, 2, 11.5, 0xffaa00);    // 9. Naranja, subida brusca (Salto en largo + alto)
createBox(8, 7, 1.2, 12.6, 0x33ccff);              // 10. Cubito azul celeste, difícil apuntar
createPlatform(10, -1, 3, 0.5, 1.5, 14.5, 0xff3366); // 11. Tabla rosa girando en círculo
createPlatform(5, -6, 2, 0.5, 2, 15.7, 0x9933ff);  // 12. Plataforma morada
createBench(0, -9, 0, 16.5);                       // 13. Banco pequeño
createBox(-5, -6, 1.0, 17.7, 0x33ff66);            // 14. Cubo verde microscópico, salto fe ciega
createPlatform(-10, -2, 2, 0.5, 2, 19.5, 0xdddd22);// 15. Plataforma amarilla de recuperación
createPlatform(-5, 4, 1.5, 0.5, 5, 20.7, 0xff5522); // 16. Puente rojo hacia el final

// 17. Escaleras Mágicas en Espiral (Desaparecen al Subir)
const spiralStairs = [];
const spiralColors = [0xff2222, 0x2222ff, 0x22ff22, 0xffff22]; // Rojo, azul, verde, amarillo
const numStairs = 45;
const spiralRadius = 12;

for (let i = 0; i < numStairs; i++) {
    const angle = i * 0.45;
    const x = Math.sin(angle) * spiralRadius;
    const z = Math.cos(angle) * spiralRadius;
    const y = 20.7 + i * 1.0;

    // Crear la escalera rotada apuntando al centro
    const width = 5; // Largo radial
    const height = 0.5;
    const depth = 2.0; // Ancho tangencial

    const geom = new THREE.BoxGeometry(width, height, depth);
    const color = spiralColors[i % 4];
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y + height / 2, z);
    mesh.rotation.y = angle;
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);

    // Coleccionable intermitente cada 3 escalones
    if (i % 3 === 0) createCollectible(x, y + height, z);

    // FÍSICA rotada
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const body = new CANNON.Body({ mass: 0, shape: shape, material: physMaterial });
    body.position.set(x, y + height / 2, z);
    body.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 1, 0), angle);
    world.addBody(body);

    spiralStairs.push({ mesh: mesh, body: body, active: true, initialY: y + height / 2 });
}

// GRAN META AL FINAL DE LA ESPIRAL
const finalY = 20.7 + numStairs * 1.0;
createPlatform(0, 0, 10, 1.0, 10, finalY, 0xffffff);   // 18. GRAN META ALTA EN LAS NUBES

// -----------------------------------------------------------------
// NUBES
// -----------------------------------------------------------------
const clouds = [];
const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1.0, emissive: 0x222222 });

function createCloud(x, y, z, scale) {
    const cloudGroup = new THREE.Group();
    // Tres rectangulos simples para hacer una nube estilo voxel (bloque)
    const m1 = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 3), cloudMaterial);
    m1.position.set(0, 0, 0);
    const m2 = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 2.5), cloudMaterial);
    m2.position.set(-1.5, -0.5, 0.5);
    const m3 = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.5, 2), cloudMaterial);
    m3.position.set(2, -0.25, -0.5);

    cloudGroup.add(m1); cloudGroup.add(m2); cloudGroup.add(m3);

    // Escalar aleatoriamente y posicionar
    cloudGroup.scale.set(scale, scale, scale);
    cloudGroup.position.set(x, y, z);
    scene.add(cloudGroup);

    // Velocidad azarosa hacia alguna dirección lateral del cielo
    clouds.push({ mesh: cloudGroup, speed: (Math.random() * 2 + 0.5) * (Math.random() > 0.5 ? 1 : -1) });
}

// Llenar el cielo de nubes
for (let i = 0; i < 20; i++) {
    const rx = (Math.random() - 0.5) * 300;
    const ry = 40 + Math.random() * 30; // Altas en el cielo
    const rz = (Math.random() - 0.5) * 300;
    const s = 1.0 + Math.random() * 3.0; // Distintos tamaños gigantes
    createCloud(rx, ry, rz, s);
}

const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
const leavesMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
function createTree(x, z, scale) {
    const group = new THREE.Group();
    const trunkGeom = new THREE.CylinderGeometry(0.5 * scale, 0.7 * scale, 3 * scale, 6);
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.y = 1.5 * scale; trunk.castShadow = true; trunk.receiveShadow = true; group.add(trunk);
    const leavesGeom = new THREE.ConeGeometry(2.5 * scale, 5 * scale, 7);
    const leaves = new THREE.Mesh(leavesGeom, leavesMat);
    leaves.position.y = (3 * scale) + (2.5 * scale) - (1 * scale); leaves.castShadow = true; leaves.receiveShadow = true; group.add(leaves);
    group.position.set(x, 0, z); group.rotation.y = Math.random() * Math.PI;
    scene.add(group);

    // FÍSICA: Tronco colisionable
    const shape = new CANNON.Box(new CANNON.Vec3(0.5 * scale, 1.5 * scale, 0.5 * scale));
    const body = new CANNON.Body({ mass: 0, shape: shape, material: physMaterial });
    body.position.set(x, 1.5 * scale, z);
    world.addBody(body);
}

createTree(-15, -15, 1.5); createTree(18, -12, 1.0); createTree(-18, 15, 0.7);
createTree(15, 18, 1.2); createTree(25, 5, 2.0); createTree(-25, 0, 0.8);

function createBuildingWindowsTexture() {
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256; const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const winW = 20; const winH = 30; const gapX = 12; const gapY = 15;
    for (let y = gapY; y < canvas.height; y += winH + gapY) {
        for (let x = gapX; x < canvas.width; x += winW + gapX) {
            if (Math.random() > 0.85) ctx.fillStyle = Math.random() > 0.5 ? '#fff5cc' : '#e6f7ff'; else ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(x, y, winW, winH);
        }
    }
    return canvas;
}
const sharedWindowTexture = new THREE.CanvasTexture(createBuildingWindowsTexture());
sharedWindowTexture.wrapS = THREE.RepeatWrapping; sharedWindowTexture.wrapT = THREE.RepeatWrapping;
const buildingMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.9 }),
    new THREE.MeshStandardMaterial({ color: 0x9e8a76, roughness: 0.9 }), new THREE.MeshStandardMaterial({ color: 0x3d4a54, roughness: 0.9 })
];

function createBuilding(x, z, width, depth, height, matIndex) {
    const geom = new THREE.BoxGeometry(width, height, depth);
    const building = new THREE.Mesh(geom, buildingMaterials[matIndex]);
    building.position.set(x, height / 2, z); building.castShadow = true; building.receiveShadow = true;
    scene.add(building);
    const winGeom = new THREE.PlaneGeometry(width * 0.8, height * 0.9);
    const instWindowTexture = sharedWindowTexture.clone();
    instWindowTexture.needsUpdate = true; instWindowTexture.repeat.set(width / 8, height / 10);
    const instWindowMaterial = new THREE.MeshStandardMaterial({
        map: instWindowTexture,
        roughness: 0.2,
        metalness: 0.8,
        emissiveMap: instWindowTexture,
        emissive: new THREE.Color(0xaaaaaa),
        emissiveIntensity: 0.0 // Empiezan apagadas de día
    });
    windowMaterials.push(instWindowMaterial); // Guardamos para transicion de noche
    const windowMesh = new THREE.Mesh(winGeom, instWindowMaterial);

    if (Math.abs(x) > Math.abs(z)) {
        windowMesh.position.set(x > 0 ? x - width / 2 - 0.1 : x + width / 2 + 0.1, height / 2, z); windowMesh.rotation.y = x > 0 ? -Math.PI / 2 : Math.PI / 2;
    } else {
        windowMesh.position.set(x, height / 2, z > 0 ? z - depth / 2 - 0.1 : z + depth / 2 + 0.1); windowMesh.rotation.y = z > 0 ? Math.PI : 0;
    }
    scene.add(windowMesh);

    // FÍSICA: Rascacielos
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const body = new CANNON.Body({ mass: 0, shape: shape, material: physMaterial });
    body.position.set(x, height / 2, z);
    world.addBody(body);
}

const offset = 45;
for (let i = -40; i <= 40; i += 15) {
    if (Math.random() > 0.3) createBuilding(i + (Math.random() * 5), -offset, 10 + Math.random() * 10, 10 + Math.random() * 5, 20 + Math.random() * 40, Math.floor(Math.random() * buildingMaterials.length));
    if (Math.random() > 0.3) createBuilding(i + (Math.random() * 5), offset, 10 + Math.random() * 10, 10 + Math.random() * 5, 20 + Math.random() * 40, Math.floor(Math.random() * buildingMaterials.length));
    if (Math.random() > 0.3) createBuilding(offset, i + (Math.random() * 5), 10 + Math.random() * 5, 10 + Math.random() * 10, 20 + Math.random() * 40, Math.floor(Math.random() * buildingMaterials.length));
    if (Math.random() > 0.3) createBuilding(-offset, i + (Math.random() * 5), 10 + Math.random() * 5, 10 + Math.random() * 10, 20 + Math.random() * 40, Math.floor(Math.random() * buildingMaterials.length));
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
});

// Bucle principal de animación
const timeStep = 1 / 60;
function animate() {
    requestAnimationFrame(animate);

    // Siempre ejecutamos las físicas para que el mundo sea sólido y haya gravedad
    world.step(timeStep);

    if (controls.isLocked) {
        // --- Movimiento manual empujando la velocidad CANNON en dirección de la cámara ---
        const dir = new THREE.Vector3();
        controls.getDirection(dir);
        dir.y = 0; dir.normalize(); // Dirección hacia adelante ignorando arriba/abajo
        const right = new THREE.Vector3();
        right.crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize(); // Dirección a los lados

        let moveX = 0; let moveZ = 0;
        if (keys.w) { moveX += dir.x; moveZ += dir.z; }
        if (keys.s) { moveX -= dir.x; moveZ -= dir.z; }
        if (keys.d) { moveX += right.x; moveZ += right.z; }
        if (keys.a) { moveX -= right.x; moveZ -= right.z; }

        const moveSpeed = 25; // Velocidad del jugador
        let targetX = 0;
        let targetZ = 0;

        if (moveX !== 0 || moveZ !== 0) {
            const mag = Math.sqrt(moveX * moveX + moveZ * moveZ);
            targetX = (moveX / mag) * moveSpeed;
            targetZ = (moveZ / mag) * moveSpeed;
        }

        // Interpolar (lerp) la velocidad física directa para frenado/arranque suave sin romper las colisiones
        playerBody.velocity.x += (targetX - playerBody.velocity.x) * 0.2;
        playerBody.velocity.z += (targetZ - playerBody.velocity.z) * 0.2;

        // Comprobar colección de puntos cercanos
        for (let i = 0; i < collectibles.length; i++) {
            const c = collectibles[i];
            if (!c.collected) {
                // Rotar y animar el punto flotante
                c.mesh.rotation.y += 0.05;
                c.mesh.rotation.x += 0.02;
                c.mesh.position.y = c.baseY + Math.sin(Date.now() * 0.005) * 0.2;

                // Distancia entre jugador y coleccionable
                const distV = new THREE.Vector3(playerBody.position.x, playerBody.position.y, playerBody.position.z);
                if (distV.distanceTo(c.mesh.position) < 2.5) { // Radio de colisión
                    c.collected = true;
                    c.mesh.visible = false;
                    score++;
                    ammo = Math.min(ammo + 5, maxAmmo); // Recarga 5 per perla
                    updateAmmoHUD();
                    updateHUD();
                }
            }
        }

        // Rastrear altura máxima alcanzada para saber desde dónde cayó
        if (playerBody.position.y > highestY) {
            highestY = playerBody.position.y;
        }

        // Comprobar y manejar caídas (perder)
        if (playerBody.position.y < -5) {
            // Si estaba en el bloque rosa o más arriba (Y real del jugador > 6.0 comprobando la altura) resta 5%
            if (highestY >= 6.0) {
                lives -= 5;
                updateLivesHUD();
            }

            if (lives <= 0) {
                // Perdió todas las vidas, se resetea TODO
                lives = maxLives;
                updateLivesHUD();
                resetGame();
                showLoseMessage();
            } else {
                // Pierde vida pero solo vuelve al principio (mantiene los puntos)
                playerBody.position.set(0, 5, 20);
                playerBody.velocity.set(0, 0, 0);
                highestY = 0; // Reiniciar rastreo al volver abajo
            }
        }

        // Verificar victoria puramente por llegar al escenario superior de meta
        if (playerBody.position.y > finalY + 0.5 && !hasWon) {
            score = Math.max(score, collectibles.length); // Llenar barra visual
            updateHUD(); // Forzamos disparar la victoria
        }

        // --- Lógica de escaleras en Espiral que desaparecen ---
        for (let i = 0; i < spiralStairs.length; i++) {
            const stair = spiralStairs[i];
            // Si el jugador salta y sobrepasa por 2.5 metros por encima la escalera, esta desaparece
            if (stair.active && playerBody.position.y > stair.initialY + 2.5) {
                scene.remove(stair.mesh);
                world.removeBody(stair.body);
                stair.active = false;

                // Reaparecer la escalera después de 3 segundos
                setTimeout(() => {
                    if (!stair.active && !hasWon) { // Asegurarse de que sigan activas si no se ha reiniciado ya
                        scene.add(stair.mesh);
                        world.addBody(stair.body);
                        stair.active = true;
                    }
                }, 3000);
            }
        }
    } else {
        // Frenar al jugador si está pausado
        playerBody.velocity.x *= 0.8;
        playerBody.velocity.z *= 0.8;
    }

    // CICLO DE DÍA Y NOCHE CONTINUO (24 minutos en total: 12 de día, 12 de noche)
    if (controls.isLocked) {
        timeSeconds += timeStep; // Sumamos segundos reales (aprox)
        // Convertimos los segundos a un ciclo senoidal.
        // 12 minutos = 720 segundos. Un ciclo completo (Día -> Noche -> Día) necesita 1440 segundos.
        // Math.PI * 2 / 1440 será nuestra velocidad matemática

        // calculamos un factor entre 0 (pleno día) y 1 (plena noche)
        const cycleSpeed = (Math.PI * 2) / 1440;

        let dayFactor = (Math.sin(timeSeconds * cycleSpeed - Math.PI / 2) + 1) / 2;
        // dayFactor: 0 (Día MÁXIMO) -> 1 (Noche MÁXIMA) 

        // Transicionar colores del cielo (Día a Noche y viceversa)
        scene.background.copy(dayColor).lerp(nightColor, dayFactor);
        scene.fog.color.copy(dayColor).lerp(nightColor, dayFactor);

        // Bajar luces del sol (de 1.2 a 0.1) y luz ambiente (de 0.6 a 0.2)
        ambientLight.intensity = 0.6 - (dayFactor * 0.4);
        dirLight.intensity = 1.2 - (dayFactor * 1.1);

        // Encender ventanitas fluorescentes gradualmente según qué tan de noche sea
        windowMaterials.forEach(mat => {
            mat.emissiveIntensity = dayFactor * 1.5;
        });

        // Actualizar límite de tiempo de juego
        if (score < collectibles.length) { // Si no ha ganado todavía
            timeLeft -= timeStep;
            updateTimerHUD();
            if (timeLeft <= 0) {
                // Perdió por tiempo
                lives = maxLives;
                updateLivesHUD();
                resetGame();
                showLoseMessage();
            }
        }
    }

    // SIEMPRE anclamos la cámara TRES a la cabeza del cuerpo FÌSICO (así no queda el fondo gris la primera vez)
    // radius = 1, sumamos algo extra para que esté a la altura de los ojos
    camera.position.set(playerBody.position.x, playerBody.position.y + playerRadius * 0.4, playerBody.position.z);

    // Animar el movimiento lento de las nubes en el cielo
    clouds.forEach(c => {
        c.mesh.position.x += c.speed * timeStep;
        // Si se alejan demasiado (se salen del mapa visual), las reaparecemos en el extremo opuesto
        if (c.mesh.position.x > 200) c.mesh.position.x = -200;
        if (c.mesh.position.x < -200) c.mesh.position.x = 200;

        // Oscurecer ligeramente si es de noche basándonos en el dayFactor que se calculaba más arriba
        // pero que no sale en este scope de la condicional, lo calculamos igual:
        const cs = (Math.PI * 2) / 1440;
        const df = (Math.sin(timeSeconds * cs - Math.PI / 2) + 1) / 2;
        // Cambiar material para que no brillen igual de dia que de noche
        cloudMaterial.color.setHex(0xffffff).lerp(new THREE.Color(0x555555), df);
    });

    renderer.render(scene, camera);
}

animate();
