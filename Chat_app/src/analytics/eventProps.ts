import {
  AuthMode,
  LocationPermissionStatus,
  MessageContentType,
  MessageScope,
  AttachmentContext,
  PageName,
} from './eventNames.ts';

export interface PageViewProperties {
  path: string;
  search?: string;
  page_name?: PageName | string;
}

export interface AuthAttemptProperties {
  email: string;
  auth_mode: AuthMode;
  email_domain?: string;
}

export interface AuthFailureProperties {
  error: string;
  auth_mode: AuthMode;
}

export interface AuthModeProperties {
  targetMode: string;
  previousMode?: string;
}

export interface PasswordVisibilityProperties {
  show: boolean;
  auth_mode?: AuthMode;
}

export interface LocationPermissionProperties {
  status: LocationPermissionStatus;
  reason?: string | number;
  source?: string;
}

export interface RoomCreatedProperties {
  roomId: string;
  lat?: number;
  lng?: number;
}

export interface GeofenceCreatedProperties {
  lat: number;
  lng: number;
  radius_km?: number;
}

export interface GeofenceWarningProperties {
  distance_m: number;
  roomId?: string;
}

export interface EnteredChatRoomProperties {
  roomId: string;
  roomName: string;
}

export interface MessageSentProperties {
  type: MessageContentType | string;
  roomId?: string;
  message_length?: number;
}

export interface MessageFailedProperties {
  reason: string;
  type?: MessageScope | string;
  roomId?: string;
}

export interface PrivateConversationProperties {
  otherUserId: string;
  roomId?: string;
}

export interface ProfileUpdatedProperties {
  fields_changed: string[];
  field_count?: number;
}

export interface AvatarChangedProperties {
  file_type?: string;
}

export interface SettingsChangedProperties {
  setting: string;
  value: any;
}

export interface SupportLinkClickedProperties {
  type: string;
  destination?: string;
}

export interface AttachmentMenuOpenedProperties {
  context?: AttachmentContext | string;
}

export interface UserProfileProperties {
  $email?: string;
  $name?: string;
  [key: string]: any;
}
