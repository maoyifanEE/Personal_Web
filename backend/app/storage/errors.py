"""Internal storage error types for homepage media."""


class HomepageMediaStorageError(Exception):
    """Base error for storage failures."""


class UnsafeMediaPathError(HomepageMediaStorageError):
    """Raised when a logical media path is outside the managed namespace."""


class MediaObjectMissingError(HomepageMediaStorageError):
    """Raised when an authoritative media object is missing."""


class MediaObjectCollisionError(HomepageMediaStorageError):
    """Raised when a generated destination already exists."""


class StorageUnavailableError(HomepageMediaStorageError):
    """Raised when the authoritative storage service is temporarily unavailable."""


class StorageIntegrityError(HomepageMediaStorageError):
    """Raised when an object fails size or checksum validation."""
