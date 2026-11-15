#!/usr/bin/env node
/**
 * Character pipeline: Mixamo FBX (or any Mixamo-rigged GLB) → small, mobile-ready GLB.
 *
 *   npm run characters                 convert everything in characters.json
 *   npm run characters -- --only erika convert one
 *
 * Per character:
 *   1. FBX → GLB with FBX2glTF (GLB sources are used as-is)
 *   2. keep only the base color map (normal/specular/gloss/emissive maps dropped: the app uses
 *      Lambert materials), resize to ≤ 512 px, JPEG unless the material needs alpha
 *   3. drop animations (rowing is procedural), simplify to ≤ TARGET_TRIS, weld, quantize
 *      (KHR_mesh_quantization: decoded by three's GLTFLoader with no WebAssembly, unlike
 *      Draco/meshopt which can't run on Hermes)
 *   4. check the Mixamo bones the rowing driver needs
 * Bundled characters → app/assets/characters/, others → dist/characters/ (to host).
 * Writes app/src/characters/catalog.json and app/src/characters/bundled.js.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = path.join(ROOT, 'tools/characters/characters.json');
const BUNDLED_DIR = path.join(ROOT, 'app/assets/characters');
const REMOTE_DIR = path.join(ROOT, 'dist/characters');
const CATALOG = path.join(ROOT, 'app/src/characters/catalog.json');
const BUNDLED_JS = path.join(ROOT, 'app/src/characters/bundled.js');
const FBX2GLTF = path.join(
  ROOT,
  'node_modules/fbx2gltf/bin',
  os.type(),
  os.type() === 'Windows_NT' ? 'FBX2glTF.exe' : 'FBX2glTF',
);

export const TARGET_TRIS = 10000;
const TEXTURE_SIZE = 512;
export const REQUIRED_BONES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
];
const BONE_PREFIX = /^mixamorig\d*[:_]?/;

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const noQuantize = args.includes('--no-quantize');

/** Download URL of an on-demand character: GitHub Release asset, or a custom base URL. */
export function remoteUrl(manifest, id) {
  const r = manifest.release;
  if (r?.repo && r?.tag) return `https://github.com/${r.repo}/releases/download/${r.tag}/${id}.glb`;
  return manifest.remoteBaseUrl ? `${manifest.remoteBaseUrl.replace(/\/$/, '')}/${id}.glb` : null;
}

function triangles(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives())
      n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  }
  return Math.round(n);
}

function toGlb(entry, tmp) {
  const src = path.join(ROOT, entry.source);
  if (!fs.existsSync(src)) throw new Error(`missing source ${entry.source}`);
  if (src.toLowerCase().endsWith('.glb')) return src;
  const out = path.join(tmp, entry.id);
  execFileSync(FBX2GLTF, ['--binary', '--input', src, '--output', out], { stdio: 'pipe' });
  return `${out}.glb`;
}

async function optimize(io, file) {
  const doc = await io.read(file);
  const root = doc.getRoot();
  const before = triangles(doc);

  for (const a of root.listAnimations()) a.dispose();
  for (const m of root.listMaterials()) {
    m.setNormalTexture(null)
      .setEmissiveTexture(null)
      .setOcclusionTexture(null)
      .setMetallicRoughnessTexture(null);
    m.setEmissiveFactor([0, 0, 0]);
    for (const ext of m.listExtensions()) m.setExtension(ext.extensionName, null);
  }
  for (const ext of root.listExtensionsUsed()) {
    if (ext.extensionName !== 'KHR_mesh_quantization') ext.dispose();
  }
  // Opaque base maps → JPEG; maps used with alpha (hair, eyelashes) stay PNG.
  const alphaTextures = new Set();
  for (const m of root.listMaterials()) {
    const t = m.getBaseColorTexture();
    if (t && m.getAlphaMode() !== 'OPAQUE') alphaTextures.add(t);
  }
  root
    .listTextures()
    .forEach((t, i) => t.setName(`${alphaTextures.has(t) ? 'alpha' : 'opaque'}_${i}`));

  await MeshoptSimplifier.ready;
  const ratio = Math.min(1, TARGET_TRIS / Math.max(1, before));
  await doc.transform(
    prune(),
    dedup(),
    weld(),
    ...(ratio < 1 ? [simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 })] : []),
    textureCompress({
      encoder: sharp,
      pattern: /^opaque_/,
      targetFormat: 'jpeg',
      quality: 82,
      resize: [TEXTURE_SIZE, TEXTURE_SIZE],
    }),
    textureCompress({
      encoder: sharp,
      pattern: /^alpha_/,
      targetFormat: 'png',
      resize: [TEXTURE_SIZE, TEXTURE_SIZE],
    }),
    ...(noQuantize
      ? []
      : [
          quantize({
            quantizePosition: 14,
            quantizeNormal: 10,
            quantizeTexcoord: 12,
            quantizeWeight: 8,
          }),
        ]),
    prune(),
  );
  return { doc, before, after: triangles(doc) };
}

function checkBones(doc) {
  const names = new Set(
    doc
      .getRoot()
      .listNodes()
      .map((n) => n.getName().replace(BONE_PREFIX, '')),
  );
  const missing = REQUIRED_BONES.filter((b) => !names.has(b));
  return { ok: missing.length === 0, missing };
}

function height(doc) {
  let min = Infinity;
  let max = -Infinity;
  for (const m of doc.getRoot().listMeshes()) {
    for (const p of m.listPrimitives()) {
      const a = p.getAttribute('POSITION');
      min = Math.min(min, a.getMin([])[1]);
      max = Math.max(max, a.getMax([])[1]);
    }
  }
  return Number((max - min).toFixed(3));
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const prev = fs.existsSync(CATALOG)
    ? JSON.parse(fs.readFileSync(CATALOG, 'utf8'))
    : { characters: [] };
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rowrace-chars-'));
  fs.mkdirSync(BUNDLED_DIR, { recursive: true });
  fs.mkdirSync(REMOTE_DIR, { recursive: true });

  const catalog = [];
  let failed = 0;
  for (const entry of manifest.characters) {
    if (only && entry.id !== only) {
      const kept = prev.characters.find((c) => c.id === entry.id);
      if (kept) catalog.push(kept);
      continue;
    }
    try {
      const glb = toGlb(entry, tmp);
      const { doc, before, after } = await optimize(io, glb);
      const bones = checkBones(doc);
      if (!bones.ok)
        throw new Error(`not a Mixamo rig, missing bones: ${bones.missing.join(', ')}`);
      const outDir = entry.bundled ? BUNDLED_DIR : REMOTE_DIR;
      const out = path.join(outDir, `${entry.id}.glb`);
      await io.write(out, doc);
      const bytes = fs.statSync(out).size;
      catalog.push({
        id: entry.id,
        name: entry.name,
        origin: entry.origin,
        license: entry.license,
        bundled: !!entry.bundled,
        url: entry.bundled ? null : remoteUrl(manifest, entry.id),
        bytes,
        triangles: after,
        height: height(doc),
      });
      console.log(
        `✓ ${entry.id.padEnd(12)} ${String(before).padStart(6)} → ${String(after).padStart(6)} tris  ${(bytes / 1024).toFixed(0).padStart(5)} KB  ${entry.bundled ? 'bundled' : 'remote'}`,
      );
    } catch (e) {
      failed += 1;
      console.error(`✗ ${entry.id}: ${e.message}`);
    }
  }

  fs.mkdirSync(path.dirname(CATALOG), { recursive: true });
  fs.writeFileSync(
    CATALOG,
    JSON.stringify({ generated: new Date().toISOString(), characters: catalog }, null, 2) + '\n',
  );
  const requires = catalog
    .filter((c) => c.bundled)
    .map((c) => `  ${JSON.stringify(c.id)}: require('../../assets/characters/${c.id}.glb'),`)
    .join('\n');
  fs.writeFileSync(
    BUNDLED_JS,
    `// Generated by tools/characters/convert.mjs. Do not edit.\n// Metro needs static require() calls for bundled assets.\nexport default {\n${requires}\n};\n`,
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`\n${catalog.length} characters in the catalog, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

main();
