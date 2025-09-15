const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    // devtool: 'source-map',
    entry: {
        "service-worker": "./src/ts/service-worker.ts",
        "script-injector": "./src/ts/script-injector.ts",
        "content-script": "./src/ts/content-script.ts",
        "popup": "./src/ts/popup.ts",
        "injected-script": "./src/ts/injected-script.ts"
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
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/assets', to: '.' },
                { from: 'manifest.json', to: 'manifest.json' },
                { from: 'icons', to: 'icons' },
            ],
        }),
        new HtmlWebpackPlugin({
            template: "src/html/popup.html",
            filename: "popup.html",
            chunks: ["popup"]
        })
    ],
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
