module.exports = {
  preset: 'react-native',
  // The react-navigation packages ship untranspiled ESM; the preset's default
  // pattern only covers react-native itself.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-navigation)/)',
  ],
};
