const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const escapedProjectRoot = __dirname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\/g, "[\\\\/]");

config.resolver.blockList = new RegExp(
  `${escapedProjectRoot}[\\\\/](dist-web|export-check|\\.npm-cache|\\.expo)[\\\\/].*|${escapedProjectRoot}[\\\\/](expo-env\\.d\\.ts|expo-web.*\\.log)$`
);

module.exports = withNativeWind(config, { input: "./global.css" });
