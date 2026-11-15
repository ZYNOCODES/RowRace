/**
 * Root Jest config: pure-logic tests only (shared protocol, theme, race engine, simulator).
 * App files use ES modules, so they go through a minimal Babel transform (no React Native).
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/shared', '<rootDir>/app/src', '<rootDir>/simulator/src'],
  testMatch: ['**/*.test.js'],
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
