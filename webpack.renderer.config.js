const rules = require('./webpack.rules');
const webpack = require('webpack');

const filteredRules = rules.filter(rule => rule.test && rule.test.toString() !== /\.css$/.toString());

module.exports = {
  
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
    fallback: {
      "path": false,
      "fs": false
    }
  },
  plugins: [
    new webpack.DefinePlugin({
      '__dirname': JSON.stringify('/'),
      'global': 'window',
    }),
  ],
  node: {
    __dirname: true,
    __filename: true,
    global: true
  },
};
