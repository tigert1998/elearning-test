const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    // devtool: 'source-map',
    entry: {
        "service-worker": "./src/service-worker.ts",
        "script-injector": "./src/script-injector.ts",
        "content-script": "./src/content-script.ts"
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
        clean: true,
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    plugins: [new CopyPlugin({
        patterns: [
            { from: 'src/katex', to: 'katex' },
            { from: 'popup.html', to: 'popup.html' },
            { from: 'popup.js', to: 'popup.js' },
            { from: 'styles.css', to: 'styles.css' },
            { from: 'manifest.json', to: 'manifest.json' },
            { from: 'icon.png', to: 'icon.png' },
            { from: 'injected-script.js', to: 'injected-script.js' },
        ],
    })],
    resolve: {
        extensions: ['.ts', '.js'],
    },
    mode: 'production',
    optimization: {
        minimize: true,
        minimizer: [
            new TerserPlugin({
                parallel: true,
                terserOptions: {
                    ecma: 6,
                    output: {
                        ascii_only: true
                    },
                },
            }),
        ],
    }
};
