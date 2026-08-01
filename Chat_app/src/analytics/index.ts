import mixpanel from "./init.ts";
import {
  ANALYTICS_EVENTS,
  AuthMode,
  LocationPermissionStatus,
  MessageContentType,
  MessageScope,
  AttachmentContext,
  PageName,
} from "./eventNames.ts";
import * as trackers from "./trackers.ts";

export { mixpanel };
export {
  ANALYTICS_EVENTS,
  AuthMode,
  LocationPermissionStatus,
  MessageContentType,
  MessageScope,
  AttachmentContext,
  PageName,
};
export * from "./eventProps.ts";
export * from "./trackers.ts";

const analytics = {
  mixpanel,
  EVENTS: ANALYTICS_EVENTS,
  AuthMode,
  LocationPermissionStatus,
  MessageContentType,
  MessageScope,
  AttachmentContext,
  PageName,
  ...trackers,
};

export default analytics;
