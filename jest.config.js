/**
 * Root Jest config: pure-logic tests only (shared protocol, theme, race engine, scene builders,
 * simulator). App files use ES modules, so they go through a minimal Babel transform
 * (no React Native).
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/shared', '<rootDir>/app/src', '<rootDir>/simulator/src'],
  testMatch: ['**/*.test.js'],
  // three is ESM-only (its .cjs entry just require()s the ESM build, which Jest can't load):
  // point Jest at the ESM build and let Babel transform three (cached after the first run).
  moduleNameMapper: { '^three$': '<rootDir>/node_modules/three/build/three.module.js' },
  transformIgnorePatterns: ['/node_modules/(?!three/)'],
  transform: {
    '\\.jsx?$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: [['@babel/preset-env', { targets: { node: 'current' } }]],
      },
    ],
  },
};
