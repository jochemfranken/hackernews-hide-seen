import path from "node:path";
import { fileURLToPath } from "node:url";
import CopyPlugin from "copy-webpack-plugin";
import WebExtPlugin from "web-ext-plugin";

const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, "dist");

export default {
	entry: {
		"hide-seen": path.join(root, "hide-seen.js"),
		background: path.join(root, "background.js")
	},
	output: {
		path: output,
		filename: "[name].js",
		clean: true
	},
	plugins: [
		new CopyPlugin({
			patterns: [
				{ from: path.join(root, "manifest.json"), to: "manifest.json" },
				{ from: path.join(root, "icons"), to: "icons" }
			]
		}),
		new WebExtPlugin({
			sourceDir: output,
			artifactsDir: path.join(root, "web-ext-artifacts"),
			buildPackage: true,
			outputFilename: "hackernews-hide-seen.zip",
			overwriteDest: true
		})
	]
};