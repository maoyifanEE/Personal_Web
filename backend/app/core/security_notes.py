"""Security notes for the current backend phase.

This module intentionally contains documentation-only constants.
It does not implement authentication or authorization yet.
"""

CURRENT_SECURITY_BOUNDARY = (
    "Development endpoints are local testing tools only. Real admin "
    "authentication and authorization must be implemented before production use."
)
