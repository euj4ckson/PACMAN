import * as THREE from "three";

export class World {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly renderer: THREE.WebGLRenderer;

  private readonly container: HTMLElement;
  private readonly environmentGroup = new THREE.Group();
  private readonly onResizeBound: () => void;
  private readonly accentLights: THREE.PointLight[] = [];

  private floorMesh: THREE.Mesh | null = null;
  private floorMaterial: THREE.MeshStandardMaterial | null = null;
  private floorTexture: THREE.CanvasTexture | null = null;
  private frameGroup: THREE.Group | null = null;
  private starField: THREE.Points | null = null;
  private pulseTime = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x040914);
    this.scene.fog = new THREE.Fog(0x040914, 19, 56);

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 180);
    this.camera.position.set(0, 10, 9);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.container.appendChild(this.renderer.domElement);

    this.scene.add(this.environmentGroup);

    this.addLights();
    this.addSkyShell();
    this.addStarField();

    this.onResizeBound = () => this.resize();
    window.addEventListener("resize", this.onResizeBound);
    this.resize();
  }

  public setGround(width: number, depth: number): void {
    if (this.floorMesh) {
      this.environmentGroup.remove(this.floorMesh);
      this.floorMesh.geometry.dispose();
      this.floorMesh = null;
    }
    if (this.floorMaterial) {
      this.floorMaterial.dispose();
      this.floorMaterial = null;
    }
    if (this.floorTexture) {
      this.floorTexture.dispose();
      this.floorTexture = null;
    }
    if (this.frameGroup) {
      this.disposeGroup(this.frameGroup);
      this.environmentGroup.remove(this.frameGroup);
      this.frameGroup = null;
    }

    this.floorTexture = this.createFloorTexture();
    this.floorTexture.wrapS = THREE.RepeatWrapping;
    this.floorTexture.wrapT = THREE.RepeatWrapping;
    this.floorTexture.repeat.set(Math.max(6, width * 0.65), Math.max(6, depth * 0.65));
    this.floorTexture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();

    this.floorMaterial = new THREE.MeshStandardMaterial({
      color: 0x0c1940,
      map: this.floorTexture,
      emissive: 0x10275d,
      emissiveIntensity: 0.26,
      roughness: 0.92,
      metalness: 0.03,
    });

    const floorGeometry = new THREE.PlaneGeometry(width + 8, depth + 8, 1, 1);
    this.floorMesh = new THREE.Mesh(floorGeometry, this.floorMaterial);
    this.floorMesh.name = "maze-floor";
    this.floorMesh.rotation.x = -Math.PI / 2;
    this.floorMesh.position.y = -0.02;
    this.floorMesh.receiveShadow = true;

    this.environmentGroup.add(this.floorMesh);
    this.frameGroup = this.createArenaFrame(width, depth);
    this.environmentGroup.add(this.frameGroup);
  }

  public update(deltaSeconds: number): void {
    this.pulseTime += deltaSeconds;

    if (this.floorMaterial) {
      this.floorMaterial.emissiveIntensity = 0.24 + Math.sin(this.pulseTime * 2.2) * 0.045;
    }

    if (this.starField) {
      this.starField.rotation.y += deltaSeconds * 0.016;
    }

    if (this.accentLights.length >= 2) {
      this.accentLights[0].intensity = 1.05 + Math.sin(this.pulseTime * 1.8) * 0.28;
      this.accentLights[1].intensity = 0.92 + Math.sin(this.pulseTime * 2.3 + 1.2) * 0.22;
    }
  }

  public render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    window.removeEventListener("resize", this.onResizeBound);
    this.disposeGroup(this.environmentGroup);
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private addLights(): void {
    const hemiLight = new THREE.HemisphereLight(0x8dc0ff, 0x03060f, 0.48);
    this.scene.add(hemiLight);

    const ambient = new THREE.AmbientLight(0xa8c7ff, 0.28);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xe9f2ff, 1.08);
    keyLight.position.set(9, 17, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -21;
    keyLight.shadow.camera.right = 21;
    keyLight.shadow.camera.top = 21;
    keyLight.shadow.camera.bottom = -21;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 44;
    this.scene.add(keyLight);

    const rimA = new THREE.PointLight(0x4ec4ff, 1.0, 42, 2.2);
    rimA.position.set(-10, 5, -9);
    this.scene.add(rimA);

    const rimB = new THREE.PointLight(0xff7e5f, 0.9, 38, 2.1);
    rimB.position.set(10, 4, 9);
    this.scene.add(rimB);

    this.accentLights.push(rimA, rimB);
  }

  private addSkyShell(): void {
    const skyGeometry = new THREE.SphereGeometry(95, 36, 24);
    const skyMaterial = new THREE.MeshBasicMaterial({
      color: 0x08142f,
      side: THREE.BackSide,
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.position.set(0, 12, 0);
    this.environmentGroup.add(sky);
  }

  private addStarField(): void {
    const starCount = 560;
    const positions = new Float32Array(starCount * 3);
    const colors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i += 1) {
      const radius = 40 + Math.random() * 42;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.42;
      const x = Math.cos(theta) * Math.sin(phi) * radius;
      const y = 8 + Math.cos(phi) * radius;
      const z = Math.sin(theta) * Math.sin(phi) * radius;

      const base = i * 3;
      positions[base] = x;
      positions[base + 1] = y;
      positions[base + 2] = z;

      const tint = 0.8 + Math.random() * 0.2;
      colors[base] = 0.46 * tint;
      colors[base + 1] = 0.7 * tint;
      colors[base + 2] = 1.0 * tint;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.12,
      vertexColors: true,
      transparent: true,
      opacity: 0.86,
      depthWrite: false,
    });

    this.starField = new THREE.Points(geometry, material);
    this.environmentGroup.add(this.starField);
  }

  private createFloorTexture(): THREE.CanvasTexture {
    const size = 512;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Nao foi possivel criar textura do piso.");
    }

    ctx.fillStyle = "#07122c";
    ctx.fillRect(0, 0, size, size);

    const step = 32;
    for (let x = 0; x <= size; x += step) {
      ctx.strokeStyle = x % (step * 2) === 0 ? "rgba(97, 214, 255, 0.35)" : "rgba(97, 214, 255, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }

    for (let y = 0; y <= size; y += step) {
      ctx.strokeStyle = y % (step * 2) === 0 ? "rgba(97, 214, 255, 0.35)" : "rgba(97, 214, 255, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }

    for (let i = 0; i < 240; i += 1) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const radius = Math.random() * 1.4 + 0.2;
      ctx.fillStyle = Math.random() > 0.82 ? "rgba(255, 230, 109, 0.44)" : "rgba(110, 225, 255, 0.18)";
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    return new THREE.CanvasTexture(canvas);
  }

  private createArenaFrame(width: number, depth: number): THREE.Group {
    const frame = new THREE.Group();
    const railMaterial = new THREE.MeshStandardMaterial({
      color: 0x4ba7ff,
      emissive: 0x2a67d0,
      emissiveIntensity: 0.55,
      roughness: 0.33,
      metalness: 0.48,
    });

    const railThickness = 0.18;
    const railHeight = 0.22;
    const widthRailGeometry = new THREE.BoxGeometry(width + 1.9, railHeight, railThickness);
    const depthRailGeometry = new THREE.BoxGeometry(railThickness, railHeight, depth + 1.9);

    const topRail = new THREE.Mesh(widthRailGeometry, railMaterial);
    topRail.position.set(0, railHeight * 0.5, -(depth * 0.5 + 0.95));
    topRail.castShadow = true;

    const bottomRail = new THREE.Mesh(widthRailGeometry, railMaterial);
    bottomRail.position.set(0, railHeight * 0.5, depth * 0.5 + 0.95);
    bottomRail.castShadow = true;

    const leftRail = new THREE.Mesh(depthRailGeometry, railMaterial);
    leftRail.position.set(-(width * 0.5 + 0.95), railHeight * 0.5, 0);
    leftRail.castShadow = true;

    const rightRail = new THREE.Mesh(depthRailGeometry, railMaterial);
    rightRail.position.set(width * 0.5 + 0.95, railHeight * 0.5, 0);
    rightRail.castShadow = true;

    frame.add(topRail, bottomRail, leftRail, rightRail);
    return frame;
  }

  private disposeGroup(group: THREE.Group): void {
    group.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.InstancedMesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          material.dispose();
        }
      }
    });
  }
}
