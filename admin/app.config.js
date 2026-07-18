const fs = require("fs");

const appJson = require("./app.json");

function readEnvValue(key) {
  try {
    const env = fs.readFileSync(".env", "utf8");
    const line = env.split(/\r?\n/).find((item) => item.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const authToken = process.env.AUTH_TOKEN ?? readEnvValue("AUTH_TOKEN");
const authUrl = process.env.AUTH_URL ?? readEnvValue("AUTH_URL");
if (authToken) {
  process.env.AUTH_TOKEN = authToken;
}
if (authUrl) {
  process.env.AUTH_URL = authUrl;
  process.env.EXPO_PUBLIC_AUTH_URL = authUrl;
}

module.exports = {
  ...appJson.expo,
  extra: {
    ...appJson.expo.extra,
    authToken,
    authUrl
  }
};
