/**
 * Sky dome (gradient + sun glow) and water (one cheap shader pass: analytic ripple normals,
 * Fresnel sky reflection, sun glint, V-shaped foam wake behind the user's boat, fog).
 * No reflection render target, no textures: fits the mobile budget.
 */
import * as THREE from 'three';

const SKY_RADIUS = 1800;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // always at the far plane
}`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunSize;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = h > 0.0
    ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.55, h), 0.75))
    : mix(uHorizon, uGround, smoothstep(0.0, 0.12, -h));
  float s = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunColor * (pow(s, 900.0 * uSunSize) * 1.2 + pow(s, 12.0) * 0.25);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

const WATER_VERT = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uReflect;
uniform vec3 uFoam;
uniform vec3 uFog;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCam;
uniform vec2 uBoat;
uniform float uSpeed;
uniform float uFogNear;
uniform float uFogFar;
uniform float uSparkle;
varying vec3 vWorld;

// Slope of a sum of four directional sine waves (cheap analytic normal, no texture).
vec2 slope(vec2 p, float t) {
  vec2 s = vec2(0.0);
  s += 0.060 * vec2(0.80, 0.60) * cos(dot(p, vec2(0.80, 0.60)) * 0.9 + t * 1.1);
  s += 0.050 * vec2(-0.50, 0.85) * cos(dot(p, vec2(-0.50, 0.85)) * 1.7 + t * 1.6);
  s += 0.035 * vec2(0.95, -0.30) * cos(dot(p, vec2(0.95, -0.30)) * 3.1 + t * 2.3);
  s += 0.020 * vec2(-0.20, -0.98) * cos(dot(p, vec2(-0.20, -0.98)) * 6.3 + t * 3.0);
  return s;
}

void main() {
  vec2 p = vWorld.xz;
  float dist = length(uCam - vWorld);
  // Flatten ripples with distance: less aliasing far away, calmer look from high cameras.
  vec2 sl = slope(p, uTime) / (1.0 + dist * 0.006);
  vec3 n = normalize(vec3(-sl.x, 1.0, -sl.y));
  vec3 v = normalize(uCam - vWorld);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 5.0) * 0.6 + 0.04;
  vec3 base = mix(uDeep, uShallow, clamp(0.5 + sl.x * 1.6 - sl.y * 0.9, 0.0, 1.0));
  vec3 col = mix(base, uReflect, fres);
  vec3 h = normalize(normalize(uSunDir) + v);
  col += uSunColor * pow(max(dot(n, h), 0.0), 160.0) * uSparkle;

  // Wake: the boat moves toward -z, so "behind" is larger z. Two thin diverging lines plus a
  // faint turbulent strip in the middle, fading over ~40 m and with boat speed.
  float d = vWorld.z - uBoat.y + 3.5;
  float foam = 0.0;
  if (d > 0.0 && d < 45.0) {
    float dx = abs(vWorld.x - uBoat.x);
    float spread = 0.3 + d * 0.15;
    float edge = 1.0 - smoothstep(0.0, 0.18 + d * 0.012, abs(dx - spread));
    float center = (1.0 - smoothstep(0.0, 0.35 + d * 0.02, dx)) * 0.25;
    float fade = (1.0 - smoothstep(0.0, 40.0, d)) * clamp(uSpeed / 4.0, 0.0, 1.0);
    // Low-frequency breakup only: high frequencies alias into a checker pattern on mobile.
    float grain = 0.8 + 0.2 * sin(p.y * 2.3 + p.x * 1.7 + uTime * 2.0);
    foam = max(edge * 0.6, center) * fade * grain;
  }
  col = mix(col, uFoam, clamp(foam, 0.0, 0.6));

  float fogF = smoothstep(uFogNear, uFogFar, dist);
  gl_FragColor = vec4(mix(col, uFog, fogF), 1.0);
  #include <colorspace_fragment>
}`;

const color = (hex) => new THREE.Color(hex);

/** @param {import('./maps').MapDef} map */
export function createSky(map) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: color(map.sky.top) },
      uHorizon: { value: color(map.sky.horizon) },
      uGround: { value: color(map.sky.ground) },
      uSunDir: { value: new THREE.Vector3(...map.light.dir).normalize() },
      uSunColor: { value: color(map.light.color).multiplyScalar(map.stars ? 0.15 : 1) },
      uSunSize: { value: map.stars ? 2 : 1 },
    },
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(SKY_RADIUS, 24, 12), mat);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Water plane that follows the camera along z (the shader works in world space, so ripples
 * and fog don't slide with it).
 * @param {import('./maps').MapDef} map
 */
export function createWater(map) {
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: color(map.water.deep) },
    uShallow: { value: color(map.water.shallow) },
    uReflect: { value: color(map.water.reflect) },
    uFoam: { value: color(map.water.foam) },
    uFog: { value: color(map.fog.color) },
    uSunDir: { value: new THREE.Vector3(...map.light.dir).normalize() },
    uSunColor: { value: color(map.light.color) },
    uCam: { value: new THREE.Vector3() },
    uBoat: { value: new THREE.Vector2() },
    uSpeed: { value: 0 },
    uFogNear: { value: map.fog.near },
    uFogFar: { value: map.fog.far },
    uSparkle: { value: map.water.sparkle },
  };
  const mat = new THREE.ShaderMaterial({
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    uniforms,
  });
  const geo = new THREE.PlaneGeometry(1200, 3200, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'water';
  mesh.frustumCulled = false;

  /** @param {{ time: number, camera: THREE.Camera, boatX: number, boatZ: number, speed: number }} f */
  mesh.userData.update = (f) => {
    uniforms.uTime.value = f.time;
    uniforms.uCam.value.copy(f.camera.position);
    uniforms.uBoat.value.set(f.boatX, f.boatZ);
    uniforms.uSpeed.value = f.speed;
    mesh.position.set(f.camera.position.x, 0, f.camera.position.z - 1400);
  };
  return mesh;
}

/** Night sky stars: one Points draw call, follows the camera. */
export function createStars(count = 900, seed = 3) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const y = 0.08 + rand() * 0.92;
    const r = Math.sqrt(1 - y * y);
    pos.set([Math.cos(theta) * r * 1500, y * 1500, Math.sin(theta) * r * 1500], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: '#E8ECFF',
    size: 2.2,
    sizeAttenuation: false,
    fog: false,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'stars';
  pts.frustumCulled = false;
  return pts;
}
