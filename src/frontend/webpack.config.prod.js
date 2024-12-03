const path = require('path');
const webpack = require('webpack');
const {VueLoaderPlugin} = require('vue-loader');
// const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const CleanWebpackPlugin = require('clean-webpack-plugin');

module.exports = {
	entry: {
		// Output multiple files, one for each main page - important!: also include the polyfills in the output bundle
		article:        ['./src/utils/enable-polyfills.ts', './src/article.ts'],
		corpora:        ['./src/utils/enable-polyfills.ts', './src/corpora.ts'],
		search:         ['./src/utils/enable-polyfills.ts', './src/search.tsx'],
		'remote-index': ['./src/utils/enable-polyfills.ts', './src/remote-index.ts'],
		callback:       ['./src/utils/enable-polyfills.ts', './src/callback.ts'],
		config:         ['./src/utils/enable-polyfills.ts', './src/config.ts']
	},
	output: {
		filename: '[name].js',
		// Path on disk for output file
		path: path.resolve(__dirname, 'dist'),
		// Have bundle paths be relative to the root of the website (e.g. relative to the script requesting another part of the bundle, so basically to themselves)
		// This is required for monaco editor to work correctly, as it loads additional files from the same directory as the main bundle
		publicPath: 'auto',
	},
	resolve: {
		extensions: ['.js', '.ts'], // enable autocompleting .ts and .js extensions when using import '...'
		alias: {
			// Enable importing source files by their absolute path by prefixing with "@/"
			// Note: this also requires typescript to be able to find the imports (though it doesn't use them other than for type checking), see tsconfig.json
			"@": path.join(__dirname, "src"),
			// Make import Vue from 'vue' import the version that includes the template compiler.
			// Normally you don't need this, but we allow plugin components that may have to be compiled runtime.
			// Hence we need this alias.
			'vue$': 'vue/dist/vue.esm.js'
		}
	},
	module: {
		rules: [{
			test: /\.css$/,
			use: [ 'vue-style-loader', 'css-loader'],
		}, {
			test: /\.scss$/,
			use: [
				'vue-style-loader',
				'css-loader',
				'sass-loader'
			]
		}, {
			test: /\.vue$/,
			use: [
				'vue-loader',
			]
		}, {
			test: /\.tsx$/,
			use: [{
				// required for jsx
				loader: 'babel-loader'
			}, {
				loader: 'ts-loader',
				options: {
					transpileOnly: false,
					appendTsxSuffixTo: [/\.vue$/],
				}
			}]
		}, {
			test: /\.ts$/,
			use: [{
				loader: 'babel-loader',
			}, {
				loader: 'ts-loader',
				options: {
					/*
					Required for webpack-dev-server to support HMR (hot module reloading) from typescript files
					This however disables all type checking errors/warnings
					These are then re-enabled through ForkTsCheckerWebpackPlugin
					NOTE: the default behavior is to refresh the entire page on changes in a module
					this can be prevented by adding the following code (essentially manually replacing your imported functions with the updated version):
					But it needs to be done everywhere the module is used, and for every import that you want to update without refreshing the page...
					if (module.hot) {
						module.hot.accept('./exports-string', () => {
							const { valueToLog } = require('./exports-string'); // original imported value doesn't update, so you need to import it again
							document.write(`HMR valueToLog: ${valueToLog}`);
						});
					}
					*/
					transpileOnly: true,
					appendTsSuffixTo: [/\.vue$/],
				}
			}]
		}, {
			test: /\.js$/,
			exclude: [/node_modules/, '/src/vendor'],
			loader: 'babel-loader',
		}, {
			test: /\.ttf$/,
			type: 'asset/resource'
		}]
	},
	plugins: [
		// ProvidePlugin makes modules globally available under certain symbols, for both our own files as well as our imported dependencies.
		// This is unfortunately required to allow dependencies to augment other dependencies (such as jquery-ui and bootstrap augmenting jquery)
		// which requires the same instance of jquery to be visible to both the jquery-ui module as our own files
		// NOTE: the exports of these modules are not made available through the window object in the browser!
		new webpack.ProvidePlugin({
			'window.jQuery':    'jquery',
			'jQuery':           'jquery',
			'$':                'jquery',
		}),
		new VueLoaderPlugin(),
		// new BundleAnalyzerPlugin(),
		new CleanWebpackPlugin(['dist'], {
			verbose: false,
		}),
	],
	devtool: 'source-map',
	// Sometimes we get false-positive errors when importing a typescript type definition from a file which itself imported it from a third file
	// The cause for this is the "transpileOnly" setting in our ts-loader configuration above.
	// What happens is a .ts file is passed to the ts-loader, which turns it into a .js file, removing all typescript syntax & annotations

	// But due to the "transpileOnly" flag it does this in isolation, it doesn't inspect WHAT is actually imported.
	// So it leaves in type-only imports like "import { SomeTypeDefinition } from '...'"
	// At the same time, it removes the corresponding export statement "export type SomeTypeDefinition { ... }" from the other file (as that would be meaningless and a syntax error in the plain javascript output)

	// The output .js file is then passed to the next loader in the chain (babel-loader in this case)
	// That loader finds a leftover "import { SomeTypeDefinition }" statement that the ts-loader couldn't remove
	// (again - because it doesn't know whether SomeTypeDefinition is just a type definition or something else, such as an object or a function)
	// But this time, it does try to wire the two files together (to bundle them, to my understanding) and can't find the export statement, thus the warning.

	// We can safely ignore these warnings.
	// We run a second typescript compiler in a separate thread that does do actual deep validation, so we will still get warnings for genuine typescript errors.
	// (that process happens in the ForkTsCheckerWebpackPlugin we enabled above)
	stats: {
		warningsFilter: /export .* was not found in/
	}
};