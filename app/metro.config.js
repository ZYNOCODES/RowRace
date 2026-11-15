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
config.resolver.assetExts = [...config.resolver.assetExts, 'jsonl'];

module.exports = config;
