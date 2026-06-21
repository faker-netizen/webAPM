const path = require('path');

module.exports = {
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'web-apm-sdk.esm.js',
    library: {
      type: 'module'
    },
    module: true,
    clean: true,
    environment: {
      module: true
    }
  },
  experiments: {
    outputModule: true
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['> 1%', 'last 2 versions', 'not dead']
                },
                useBuiltIns: false
              }]
            ]
          }
        }
      }
    ]
  },
  resolve: {
    extensions: ['.js']
  },
  externals: {
    rrweb: 'rrweb',
    react: 'react',
    'web-vitals': 'web-vitals',
    'source-map': 'source-map'
  },
  devtool: 'source-map',
  optimization: {
    minimize: true,
    splitChunks: false,
    runtimeChunk: false
  }
};
