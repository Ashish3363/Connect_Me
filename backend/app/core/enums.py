import enum


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class UserStatus(str, enum.Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"
    BANNED = "banned"
    DELETED = "deleted"


class ModerationAction(str, enum.Enum):
    SUSPENDED = "suspended"
    BANNED = "banned"
    UNBANNED = "unbanned"
    DELETED = "deleted"
    RESTORED = "restored"
