import mixpanel from "mixpanel-browser";

export const PersistenceType = {
  LOCAL_STORAGE: "localStorage",
  COOKIE: "cookie",
} as const;
export type PersistenceType = typeof PersistenceType[keyof typeof PersistenceType];

export const initializeMixpanel = (): typeof mixpanel => {
  try {
    const token = import.meta.env.VITE_MIXPANEL_PROJECT_TOKEN || "";
    mixpanel.init(token, {
      debug: true,
      track_pageview: true,
      persistence: PersistenceType.LOCAL_STORAGE,
    });
  } catch (error) {
    console.error("Failed to initialize Mixpanel analytics SDK:", error);
  }
  return mixpanel;
};

const instance = initializeMixpanel();
export default instance;
