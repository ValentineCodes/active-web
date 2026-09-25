// Push notifications go through expo-notifications. React Native still constructs
// PushNotificationIOS while loading, and that throws when the iOS native module is absent.
const PushNotificationIOS = {
  addEventListener() {},
  removeEventListener() {},
  requestPermissions() {
    return Promise.resolve({ alert: false, badge: false, sound: false });
  },
  abandonPermissions() {},
  checkPermissions(callback) {
    callback?.({ alert: false, badge: false, sound: false });
  },
  getInitialNotification() {
    return Promise.resolve(null);
  },
  setApplicationIconBadgeNumber() {},
  getApplicationIconBadgeNumber(callback) {
    callback?.(0);
  },
  presentLocalNotification() {},
  scheduleLocalNotification() {},
  cancelAllLocalNotifications() {},
  cancelLocalNotifications() {},
  getScheduledLocalNotifications(callback) {
    callback?.([]);
  },
  removeAllDeliveredNotifications() {},
  removeDeliveredNotifications() {},
  getDeliveredNotifications(callback) {
    callback?.([]);
  },
  FetchResult: {
    NewData: 'UIBackgroundFetchResultNewData',
    NoData: 'UIBackgroundFetchResultNoData',
    ResultFailed: 'UIBackgroundFetchResultFailed',
  },
};

module.exports = PushNotificationIOS;
module.exports.default = PushNotificationIOS;
