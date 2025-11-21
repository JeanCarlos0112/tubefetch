const rules = require('./webpack.rules');
const webpack = require('webpack');

// Filtra regras CSS antigas
const filteredRules = rules.filter(rule => rule.test && rule.test.toString() !== /\.css$/.toString());

module.exports = {
  // Importante: Deixe sem 'target' ou use 'electron-renderer' padrão
  
  module: {
    rules: [
      ...filteredRules,
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.js', '.jsx', '.json', '.css'],
    // Se alguma lib pedir path ou fs, entregamos vazio para não quebrar no front
    fallback: {
      "path": false,
      "fs": false
    }
  },
  plugins: [
    // Força a substituição no código compilado
    new webpack.DefinePlugin({
      '__dirname': JSON.stringify('/'),
      'global': 'window',
    }),
  ],
  // Configuração nativa do Webpack 5 para simular Node
  node: {
    __dirname: true,
    __filename: true,
    global: true
  },
};