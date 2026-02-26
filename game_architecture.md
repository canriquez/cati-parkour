# Parkour Plaza 3D - Game Architecture

This document describes the internal structure, algorithms, and design patterns used to create the 3D parkour game running directly in a web browser using Three.js and Cannon.js.

## Overview
The game is a pure vanilla JavaScript application embedded into a single `.js` file (`parkour.js`) accompanied by an `index.html` file that serves as the wrapper and User Interface (UI).

It utilizes:
*   **Three.js (r128):** For rendering the 3D scene, cameras, lighting, object meshes, and textures.
*   **Cannon.js (0.6.2):** For handling the rigid-body physics, gravity, and collision detection.
*   **PointerLockControls:** A Three.js add-on for native First-Person Shooter (FPS) camera control capturing the mouse.

## Core Game Loop & Architecture

The application is built around a continuous *Render & Physics Loop* implemented through the `animate()` function.

### 1. Initialization and Setup
When the script loads, it sequentially initializes the core components:
1.  **Three.js Scene:** Sets up `scene`, `camera` (PerspectiveCamera), and `WebGLRenderer` with shadow maps enabled.
2.  **Cannon.js World:** Initializes the physics `world` with a gravity vector `(0, -35, 0)` and a basic material (`physMaterial`) that has specific friction and restitution (bounciness) to avoid slippery platforms.
3.  **Environment:** 
    *   Adds a ground plane (both visual mesh and physical Cannon.Plane).
    *   Adds ambient lighting and a directional light that casts dynamic shadows calculated from a large orthographic camera view.

### 2. Player Controller (First Person)
The player is represented by two linked entities:
*   **Visual:** The invisible `camera`.
*   **Physical:** A `CANNON.Body` shaped as a sphere (`playerRadius = 1.0`). A sphere is used instead of a box to allow the player to slide out of harsh edges rather than getting stuck abruptly.
*   **Movement Logic:** Managed within `animate()`. It reads input keys (W, A, S, D) and uses `controls.getDirection()` to apply velocity changes (`playerBody.velocity`) through interpolation (lerping) for smooth acceleration and deceleration, avoiding instantaneous physics breaks.
*   **Jumping:** In the `keydown` event, jumping is only permitted if `playerBody.velocity.y` is close to zero (simulating being grounded) and a cooldown `lastJump` has passed.

### 3. Level Generation (Factory Patterns)
The geometries aren't loaded from external 3D files (`.obj`, `.gltf`); they are procedurally generated using JavaScript helper/factory functions.

*   `createPlatform(x, z, width, height, depth, baseY, color)`: The master function for obstacles. Creates a `THREE.BoxGeometry`, applies a solid color material, and creates a corresponding `CANNON.Box` static body (`mass: 0`).
*   `createBox(x, z, scale, baseY, color)`: A wrapper around `createPlatform` for perfectly cubic obstacles.
*   `createBench()` / `createStrangeWall()`: Produce specific decorative but collidable obstacles with rotated physics. Use `quaternion.setFromAxisAngle` to match visual rotations perfectly.

### 4. Dynamic Elements
The map features objects that update their state independently on every frame inside `animate()`:

*   **Collectibles:** Floating octahedrons. The game pushes them to a `collectibles` array. In the loop, their `rotation` is incremented, and distance checks `distV.distanceTo(c.mesh.position) < 2.5` determine if the player collected them.
*   **Clouds:** A voxel-like group of boxes. The `clouds` array stores their meshes and a speed value. In the frame loop, their `x` position shifts, and if they step out of bounds `(c.mesh.position.x > 200)`, they wrap around to `-200` to create an infinite flow.
*   **Disappearing Spiral Stairs:** Stored in the `spiralStairs` array. This array tracks their `initialY` coordinate. If the player's Y position gets `currentY > stair.initialY + 2.5`, the game explicitly removes both the *Three.js Mesh* and the *Cannon.js Body*. A `setTimeout` of 3 seconds is triggered right after to re-insert them into both worlds for them to respawn.

### 5. Day/Night Cycle Shader Engine
The game features a completely code-driven infinite day/night cycle logic.
*   A variable `timeSeconds` constantly augments by the delta time `1/60`.
*   Using a sine wave `Math.sin()`, it converts this linear time into an oscillating `dayFactor` value between `0.0` (Full Day) and `1.0` (Full Night).
*   **Sky and Fog:** The `dayColor` lerps into the `nightColor` based on the `dayFactor`.
*   **Sunlight:** `dirLight` and `ambientLight` intensities are interpolated down when it's dark.
*   **Emissive Windows:** Background buildings have windows mapped to a `windowMaterials` collection. The loop checks the `dayFactor` and pushes their `emissiveIntensity` up when it's night time, making the city light up smoothly.

### 6. HTML & UI Bridge
The UI is standard HTML absolute-positioned `div` layers over the canvas, relying on standard DOM manipulation (`document.getElementById`).
*   Instead of WebGL menus, CSS layouts block screen inputs when active (like the `startScreen`). 
*   Updates to score, time, and lives are pushed via JavaScript string manipulation (`innerText`) and width percentage edits (`style.width`) inside lightweight update functions (`updateHUD()`, `updateTimerHUD()`).
