const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' });
const resolveRequest = config.resolver.resolveRequest;
const pushNotificationShim = path.resolve(__dirname, 'src/shims/PushNotificationIOS.js');

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const fromReactNativeIndex = context.originModulePath?.endsWith(
    `${path.sep}react-native${path.sep}index.js`,
  );
  if (
    fromReactNativeIndex &&
    moduleName === './Libraries/PushNotificationIOS/PushNotificationIOS'
  ) {
    return { type: 'sourceFile', filePath: pushNotificationShim };
  }

  if (resolveRequest) {
    return resolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
