import test from 'node:test'
import assert from 'node:assert/strict'

import analytics, {
  ANALYTICS_EVENTS,
  AuthMode,
  LocationPermissionStatus,
  MessageContentType,
  MessageScope,
  AttachmentContext,
  PageName,
} from './index.ts'

test('Analytics Enums are correctly defined according to coding standards', () => {
  assert.equal(AuthMode.LOGIN, 'login')
  assert.equal(AuthMode.REGISTER, 'register')

  assert.equal(LocationPermissionStatus.GRANTED, 'granted')
  assert.equal(LocationPermissionStatus.DENIED, 'denied')

  assert.equal(MessageContentType.TEXT, 'text')
  assert.equal(MessageContentType.PHOTO, 'photo')

  assert.equal(MessageScope.PUBLIC, 'public')
  assert.equal(MessageScope.PRIVATE, 'private')

  assert.equal(AttachmentContext.CHAT_ROOM, 'chat_room')
  assert.equal(AttachmentContext.DM_PANEL, 'dm_panel')

  assert.equal(PageName.LOGIN, 'Login')
  assert.equal(PageName.CHAT_ROOM, 'Chat Room')
})

test('ANALYTICS_EVENTS constants dictionary contains valid event strings', () => {
  assert.equal(ANALYTICS_EVENTS.PAGE_VIEWED, 'Page Viewed')
  assert.equal(ANALYTICS_EVENTS.LOGIN_ATTEMPTED, 'Login Attempted')
  assert.equal(ANALYTICS_EVENTS.USER_SIGNED_UP, 'User Signed Up')
  assert.equal(ANALYTICS_EVENTS.PUBLIC_MESSAGE_SENT, 'Public Message Sent')
  assert.equal(ANALYTICS_EVENTS.LOCATION_PERMISSION_RESULT, 'Location Permission Result')
})

test('Analytics tracking functions execute safely without throwing exceptions', () => {
  assert.doesNotThrow(() => {
    analytics.trackPageView({ path: '/rooms', page_name: PageName.NEARBY_ROOMS })
    analytics.trackAppOpened()
    analytics.trackSessionStarted()
    analytics.trackUserBecameActive()
    analytics.trackUserBecameInactive()
    analytics.trackSessionEnded()

    analytics.trackAuthModeSwitched('register', 'login')
    analytics.trackAuthAttempt(true, 'test@example.com')
    analytics.trackAuthSuccess(true)
    analytics.trackAuthFailure(false, 'Invalid credentials')
    analytics.trackPasswordVisibilityToggled(true, AuthMode.LOGIN)

    analytics.trackLocationPermission(LocationPermissionStatus.GRANTED)
    analytics.trackRoomCreated('room-123', 12.88, 77.60)
    analytics.trackGeofenceCreated(12.88, 77.60, 1)
    analytics.trackGeofenceWarningReceived(45, 'room-123')
    analytics.trackGeofenceExitedAutomatically('room-123')

    analytics.trackEnteredChatRoom('room-123', 'Tech Talk')
    analytics.trackFirstMessageSend()
    analytics.trackPublicMessageSent(MessageContentType.TEXT, 'room-123', 15)
    analytics.trackPrivateMessageSent(MessageContentType.PHOTO, 'room-123')
    analytics.trackMessageDeliveryFailed('stale_location', MessageScope.PUBLIC, 'room-123')
    analytics.trackPrivateConversationStarted('user-456', 'room-123')
    analytics.trackPersonalChatsListViewed()

    analytics.trackAvatarChanged('image/jpeg')
    analytics.trackProfileUpdated(['displayName', 'avatar'])
    analytics.trackSettingsChanged('theme', 'dark')

    analytics.trackAttachmentMenuOpened(AttachmentContext.CHAT_ROOM)
    analytics.trackSupportLinkClicked('github', 'https://github.com/Ashish3363')

    analytics.identifyUser('user-123')
    analytics.aliasUser('user-123')
    analytics.setUserProfile({ $email: 'test@example.com', $name: 'Test User' })
  })
})
