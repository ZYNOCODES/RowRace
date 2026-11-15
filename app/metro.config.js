// Metro config for the npm-workspaces monorepo: lets /app import /shared.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.join(workspaceRoot, 'shared')];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, 'node_modules'),
  path.join(workspaceRoot, 'node_modules'),
];
// Bundled replay fixtures are JSON Lines files.
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, 'jsonl', 'glb'])];

// three is ESM-only: its "require" entry (three.cjs) is a Node shim that calls
// process.emitWarning, which crashes in React Native. @react-three/fiber/native is CommonJS
// and require()s 'three', so always hand Metro the ES-module build.
// (three's "exports" hides its subpaths from require.resolve, so go via the main entry.)
const threeModule = path.join(
  path.dirname(require.resolve('three', { paths: [workspaceRoot] })),
  'three.module.js',
);
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') return { type: 'sourceFile', filePath: threeModule };
  return (defaultResolve || context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
