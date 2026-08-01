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
import type {
  PageViewProperties,
  LocationPermissionProperties,
  GeofenceWarningProperties,
  EnteredChatRoomProperties,
  MessageSentProperties,
  MessageFailedProperties,
  PrivateConversationProperties,
  ProfileUpdatedProperties,
  AvatarChangedProperties,
  SettingsChangedProperties,
  SupportLinkClickedProperties,
  AttachmentMenuOpenedProperties,
  UserProfileProperties,
} from "./eventProps.ts";

// Helper to derive human-readable page name Enum from route path
const getPageNameFromPath = (path: string): PageName => {
  if (path === '/' || path === '/login') return PageName.LOGIN;
  if (path === '/splash') return PageName.SPLASH;
  if (path.startsWith('/rooms/')) return PageName.CHAT_ROOM;
  if (path === '/rooms') return PageName.NEARBY_ROOMS;
  if (path === '/settings') return PageName.SETTINGS;
  if (path === '/profile') return PageName.PROFILE;
  if (path === '/edit-profile') return PageName.EDIT_PROFILE;
  if (path === '/contact') return PageName.CONTACT_US;
  if (path === '/about') return PageName.ABOUT_US;
  return PageName.UNKNOWN;
};

// Safe executor helper for analytics calls
const safeTrack = (trackFn: () => void): void => {
  try {
    trackFn();
  } catch (error) {
    console.error('[Analytics Error]: Failed to track analytics event:', error);
  }
};

// User Identification Methods
export const aliasUser = (userId: string): void => {
  safeTrack(() => {
    mixpanel.alias(userId);
  });
};

export const identifyUser = (userId: string): void => {
  safeTrack(() => {
    mixpanel.identify(userId);
  });
};

export const setUserProfile = (properties: UserProfileProperties): void => {
  safeTrack(() => {
    mixpanel.people.set(properties);
  });
};

// Navigation & Session Trackers
export const trackPageView = (props: PageViewProperties): void => {
  safeTrack(() => {
    const page_name = props.page_name || getPageNameFromPath(props.path);
    mixpanel.track(ANALYTICS_EVENTS.PAGE_VIEWED, {
      ...props,
      page_name,
    });
  });
};

export const trackAppOpened = (): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.APP_OPENED);
  });
};

export const trackSessionStarted = (): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.SESSION_STARTED);
  });
};

export const trackSessionEnded = (): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.SESSION_ENDED);
  });
};

export const trackUserBecameActive = (): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.USER_ACTIVE);
  });
};

export const trackUserBecameInactive = (): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.USER_INACTIVE);
  });
};

// Auth Trackers
export const trackAuthModeSwitched = (targetMode: string, previousMode?: string): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.AUTH_MODE_SWITCHED, {
      targetMode,
      ...(previousMode ? { previousMode } : {}),
    });
  });
};

export const trackAuthAttempt = (isRegister: boolean, email: string): void => {
  safeTrack(() => {
    const auth_mode = isRegister ? AuthMode.REGISTER : AuthMode.LOGIN;
    const email_domain = email.includes('@') ? email.split('@')[1] : undefined;
    mixpanel.track(
      isRegister ? ANALYTICS_EVENTS.SIGNUP_ATTEMPTED : ANALYTICS_EVENTS.LOGIN_ATTEMPTED,
      {
        email,
        auth_mode,
        ...(email_domain ? { email_domain } : {}),
      }
    );
  });
};

export const trackAuthSuccess = (isRegister: boolean): void => {
  safeTrack(() => {
    mixpanel.track(
      isRegister ? ANALYTICS_EVENTS.USER_SIGNED_UP : ANALYTICS_EVENTS.USER_LOGGED_IN,
      {
        auth_mode: isRegister ? AuthMode.REGISTER : AuthMode.LOGIN,
      }
    );
  });
};

export const trackAuthFailure = (isRegister: boolean, error: string): void => {
  safeTrack(() => {
    mixpanel.track(
      isRegister ? ANALYTICS_EVENTS.SIGNUP_FAILED : ANALYTICS_EVENTS.LOGIN_FAILED,
      {
        error,
        auth_mode: isRegister ? AuthMode.REGISTER : AuthMode.LOGIN,
      }
    );
  });
};

export const trackPasswordVisibilityToggled = (show: boolean, authMode?: AuthMode): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.PASSWORD_VISIBILITY_TOGGLED, {
      show,
      ...(authMode ? { auth_mode: authMode } : {}),
    });
  });
};

// Profile & Settings Trackers
export const trackAvatarChanged = (file_type?: string): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.AVATAR_CHANGED, {
      ...(file_type ? { file_type } : {}),
    });
  });
};

export const trackProfileUpdated = (fieldsChanged: string[]): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.PROFILE_UPDATED, {
      fields_changed: fieldsChanged,
      field_count: fieldsChanged.length,
    });
  });
};

export const trackSettingsChanged = (setting: string, value: any): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.SETTINGS_CHANGED, { setting, value });
  });
};

// Location & Geofence Trackers
export const trackLocationPermission = (
  status: LocationPermissionStatus,
  reason?: string | number,
  source: string = 'app_flow'
): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.LOCATION_PERMISSION_RESULT, {
      status,
      source,
      ...(reason ? { reason } : {}),
    });
  });
};

export const trackRoomCreated = (roomId: string, lat?: number, lng?: number): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.ROOM_CREATED, {
      roomId,
      ...(lat !== undefined && lng !== undefined ? { lat, lng } : {}),
    });
  });
};

export const trackGeofenceCreated = (lat: number, lng: number, radius_km: number = 1): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.GEOFENCE_CREATED, { lat, lng, radius_km });
  });
};

export const trackGeofenceWarningReceived = (distance_m: number, roomId?: string): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.GEOFENCE_WARNING_RECEIVED, {
      distance_m: Math.round(distance_m),
      ...(roomId ? { roomId } : {}),
    });
  });
};

export const trackGeofenceExitedAutomatically = (roomId?: string): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.GEOFENCE_EXITED_AUTOMATICALLY, {
      ...(roomId ? { roomId } : {}),
    });
  });
};

// Chat & Messaging Trackers
export const trackEnteredChatRoom = (roomId: string, roomName: string): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.ENTERED_CHAT_ROOM, { roomId, roomName });
  });
};

export const trackFirstMessageSend = (): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.FIRST_MESSAGE_SEND);
  });
};

export const trackPublicMessageSent = (
  type: MessageContentType | string,
  roomId?: string,
  message_length?: number
): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.PUBLIC_MESSAGE_SENT, {
      type,
      ...(roomId ? { roomId } : {}),
      ...(message_length !== undefined ? { message_length } : {}),
    });
  });
};

export const trackPrivateMessageSent = (
  type: MessageContentType | string,
  roomId?: string,
  message_length?: number
): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.PRIVATE_MESSAGE_SENT, {
      type,
      ...(roomId ? { roomId } : {}),
      ...(message_length !== undefined ? { message_length } : {}),
    });
  });
};

export const trackMessageDeliveryFailed = (
  reason: string,
  type?: MessageScope | string,
  roomId?: string
): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.MESSAGE_DELIVERY_FAILED, {
      reason,
      ...(type ? { type } : {}),
      ...(roomId ? { roomId } : {}),
    });
  });
};

export const trackPrivateConversationStarted = (otherUserId: string, roomId?: string): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.PRIVATE_CONVERSATION_STARTED, {
      otherUserId,
      ...(roomId ? { roomId } : {}),
    });
  });
};

export const trackPersonalChatsListViewed = (): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.PERSONAL_CHATS_LIST_VIEWED);
  });
};

// Interaction Trackers
export const trackAttachmentMenuOpened = (context: AttachmentContext | string = AttachmentContext.CHAT_ROOM): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.ATTACHMENT_MENU_OPENED, { context });
  });
};

export const trackSupportLinkClicked = (type: string, destination?: string): void => {
  safeTrack(() => {
    mixpanel.track(ANALYTICS_EVENTS.SUPPORT_LINK_CLICKED, {
      type,
      ...(destination ? { destination } : {}),
    });
  });
};
