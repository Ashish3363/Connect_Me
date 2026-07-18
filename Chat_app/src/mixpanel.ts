import mixpanel from "mixpanel-browser";

mixpanel.init(import.meta.env.VITE_MIXPANEL_PROJECT_TOKEN || "", {
  debug: true,
  track_pageview: true,
  persistence: "localStorage",
});

export default mixpanel;