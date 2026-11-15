# Character library

Rowers are Mixamo-rigged characters (the shared `mixamorig:*` skeleton). One procedural driver
(`app/src/scene/characters/mixamoRower.js`) rows all of them from the PM5 stroke:

- hips on the sliding seat;
- two-bone IK legs to the footboard;
- body swing on the spine;
- two-bone IK arms to the oar handles.

No rowing animation clip is needed, and the motion stays in sync with the real stroke.

## Add characters

1. **Mixamo:** sign in at mixamo.com, pick a character, download as **FBX Binary, T-pose, no animation needed**. **CC0 / other:** any GLB with a Mixamo-compatible rig.
2. Put the file anywhere in the repo (e.g. `fbx-caracters/`, which is git-ignored).
3. Add an entry to `tools/characters/characters.json`:
   ```json
   {
     "id": "kai",
     "name": "Kai",
     "source": "fbx-caracters/kai.fbx",
     "origin": "mixamo",
     "license": "Mixamo (Adobe): free to use in projects, no standalone redistribution",
     "bundled": false
   }
   ```
   `bundled: true` ships the character inside the APK (keep this to ~4); `false` makes it an on-demand download.
4. Run:
   ```bash
   npm run characters          # FBX → optimized GLB, catalog, bundled requires
   npm run characters:thumbs   # 256 px thumbnails (needs Google Chrome/Chromium)
   ```

The converter:

- keeps only the base color map (512 px; JPEG, or PNG when the material needs alpha);
- removes animations;
- simplifies to about 10k triangles;
- quantizes the mesh (`KHR_mesh_quantization`, which three's loader decodes without WebAssembly; Draco and meshopt can't run on Hermes);
- checks the required bones.

A character whose rig is missing a bone is rejected, with the bone names listed.

The first four Mixamo FBX files (220 MB) became 2.4 MB of GLB.

## Host on-demand characters (GitHub Releases)

On-demand characters are assets of a GitHub Release. The app downloads them from:

```
https://github.com/<owner>/<repo>/releases/download/characters-v1/<id>.glb
```

One-time setup:

1. Install the GitHub CLI and sign in: `sudo apt install gh`, then `gh auth login`.
2. Use a **public** repo: the app has no GitHub token, so private release assets can't be downloaded.
   It can be this project's repo, or a separate assets-only repo (e.g. `rowrace-characters`).
3. In `tools/characters/characters.json` set:
   ```json
   "release": { "repo": "<owner>/<repo>", "tag": "characters-v1" }
   ```

Each time you add or change on-demand characters:

```bash
npm run characters            # convert; writes dist/characters/*.glb and the catalog URLs
npm run characters:thumbs     # thumbnails (bundled in the app for every character)
npm run characters:publish    # create the release if needed, upload, and check each public URL
```

`characters:publish -- --dry` lists what would be uploaded without uploading. After publishing, rebuild or reload the app: the catalog with the URLs is part of the JS bundle.

The app downloads a character the first time it is picked (GitHub redirects to its file CDN, and the download follows it), checks the size against the catalog, and keeps it in `documents/characters/` for offline use. Characters without a URL show as "Coming soon". (`remoteBaseUrl` still works for any other static host.)

**Licensing:** a public release makes the GLB files downloadable by anyone. Mixamo assets are free to use inside your app, but Adobe's terms don't allow redistributing them as standalone files, and a public release may count as that. Safer options:

- keep Mixamo characters **bundled** in the APK;
- use **CC0** characters for the on-demand library;
- check Adobe's current terms before publishing Mixamo GLBs.

## In the app

- Home → **Rower** opens the picker (`app/app/characters.jsx`). The choice is saved in settings (`characterId`; `classic` = the built-in box rower).
- The race scene builds immediately with the built-in rower and swaps in the character once its GLB has loaded. If loading fails, the race keeps the built-in rower and the error is logged (`character.load`).
- Only the user's boat uses a skinned character; pace boats keep the light model (frame-rate budget).
- Materials are replaced with Lambert (base map only); hair and eyelashes use alpha-test.
