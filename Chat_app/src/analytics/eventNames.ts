export const ANALYTICS_EVENTS = {
  // Navigation & Session
  PAGE_VIEWED: 'Page Viewed',
  APP_OPENED: 'App Opened',
  SESSION_STARTED: 'Session Started',
  SESSION_ENDED: 'Session Ended',
  USER_ACTIVE: 'User Became Active',
  USER_INACTIVE: 'User Became Inactive',

  // Auth & Account
  AUTH_MODE_SWITCHED: 'Auth Mode Switched',
  SIGNUP_ATTEMPTED: 'Signup Attempted',
  LOGIN_ATTEMPTED: 'Login Attempted',
  USER_SIGNED_UP: 'User Signed Up',
  USER_LOGGED_IN: 'User Logged In',
  SIGNUP_FAILED: 'Signup Failed',
  LOGIN_FAILED: 'Login Failed',
  PASSWORD_VISIBILITY_TOGGLED: 'Password Visibility Toggled',

  // Profile & Settings
  AVATAR_CHANGED: 'Avatar Changed',
  PROFILE_UPDATED: 'Profile Updated',
  SETTINGS_CHANGED: 'Settings Changed',

  // Location & Geofencing
  LOCATION_PERMISSION_RESULT: 'Location Permission Result',
  ROOM_CREATED: 'Room Created',
  GEOFENCE_CREATED: 'Geofence created',
  GEOFENCE_WARNING_RECEIVED: 'Geofence Warning Received',
  GEOFENCE_EXITED_AUTOMATICALLY: 'Geofence Exited Automatically',

  // Chat & Messaging
  ENTERED_CHAT_ROOM: 'Entered Chat Room',
  FIRST_MESSAGE_SEND: 'First message send',
  PUBLIC_MESSAGE_SENT: 'Public Message Sent',
  PRIVATE_MESSAGE_SENT: 'Private Message Sent',
  MESSAGE_DELIVERY_FAILED: 'Message Delivery Failed',
  PRIVATE_CONVERSATION_STARTED: 'Private Conversation Started',
  PERSONAL_CHATS_LIST_VIEWED: 'Personal Chats List Viewed',

  // Interactions & Support
  ATTACHMENT_MENU_OPENED: 'Attachment Menu Opened',
  SUPPORT_LINK_CLICKED: 'Support Link Clicked',
} as const;

export type AnalyticsEventName = typeof ANALYTICS_EVENTS[keyof typeof ANALYTICS_EVENTS];

// Enums as const objects per coding_standard.md
export const AuthMode = {
  LOGIN: 'login',
  REGISTER: 'register',
} as const;
export type AuthMode = typeof AuthMode[keyof typeof AuthMode];

export const LocationPermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
} as const;
export type LocationPermissionStatus = typeof LocationPermissionStatus[keyof typeof LocationPermissionStatus];

export const MessageContentType = {
  TEXT: 'text',
  PHOTO: 'photo',
} as const;
export type MessageContentType = typeof MessageContentType[keyof typeof MessageContentType];

export const MessageScope = {
  PUBLIC: 'public',
  PRIVATE: 'private',
} as const;
export type MessageScope = typeof MessageScope[keyof typeof MessageScope];

export const AttachmentContext = {
  CHAT_ROOM: 'chat_room',
  DM_PANEL: 'dm_panel',
} as const;
export type AttachmentContext = typeof AttachmentContext[keyof typeof AttachmentContext];

export const PageName = {
  LOGIN: 'Login',
  SPLASH: 'Splash',
  CHAT_ROOM: 'Chat Room',
  NEARBY_ROOMS: 'Nearby Rooms',
  SETTINGS: 'Settings',
  PROFILE: 'Profile',
  EDIT_PROFILE: 'Edit Profile',
  CONTACT_US: 'Contact Us',
  ABOUT_US: 'About Us',
  UNKNOWN: 'Unknown',
} as const;
export type PageName = typeof PageName[keyof typeof PageName];
