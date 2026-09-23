"""Shared database predicates for Saved Tab page visibility."""

from datetime import datetime
from typing import Literal, TypeAlias

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from models import Tab

TabVisibility: TypeAlias = Literal["visible", "hidden", "archived"]


def visible_tabs(now: datetime) -> ColumnElement[bool]:
    """Match active tabs whose hide deadline has elapsed or was never set.

    Args:
        now (datetime): Current absolute UTC instant used for consistent visibility decisions.

    Returns:
        ColumnElement[bool]: SQL predicate for active tabs that are currently visible.
    """
    return and_(
        Tab.archived.is_(False),
        or_(Tab.hidden_until.is_(None), Tab.hidden_until <= now),
    )


def hidden_tabs(now: datetime) -> ColumnElement[bool]:
    """Match only active tabs with a future hide deadline.

    Args:
        now (datetime): Current absolute UTC instant used for consistent visibility decisions.

    Returns:
        ColumnElement[bool]: SQL predicate for active tabs hidden until a future instant.
    """
    return and_(Tab.archived.is_(False), Tab.hidden_until > now)


def tabs_for_visibility(visibility: TabVisibility, now: datetime) -> ColumnElement[bool]:
    """Match one mutually exclusive UI page.

    Args:
        visibility (TabVisibility): Mutually exclusive visible, hidden, or archived tab scope.
        now (datetime): Current absolute UTC instant used for consistent visibility decisions.

    Returns:
        ColumnElement[bool]: SQL predicate for exactly the requested visibility scope.
    """
    if visibility == "hidden":
        return hidden_tabs(now)
    if visibility == "archived":
        return Tab.archived.is_(True)
    return visible_tabs(now)


def exportable_tabs(now: datetime) -> ColumnElement[bool]:
    """Omit active hidden tabs while retaining archived backup data.

    Args:
        now (datetime): Current absolute UTC instant used for consistent visibility decisions.

    Returns:
        ColumnElement[bool]: SQL predicate retaining archived and visible active tabs.
    """
    return or_(Tab.archived.is_(True), visible_tabs(now))
