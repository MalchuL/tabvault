"""Shared database predicates for Saved Tab page visibility."""

from datetime import datetime
from typing import Literal, TypeAlias

from sqlalchemy import and_, or_
from sqlalchemy.sql.elements import ColumnElement

from models import Tab

TabVisibility: TypeAlias = Literal["visible", "hidden", "archived"]


def visible_tabs(now: datetime) -> ColumnElement[bool]:
    """Match active tabs whose hide deadline has elapsed or was never set."""
    return and_(
        Tab.archived.is_(False),
        or_(Tab.hidden_until.is_(None), Tab.hidden_until <= now),
    )


def hidden_tabs(now: datetime) -> ColumnElement[bool]:
    """Match only active tabs with a future hide deadline."""
    return and_(Tab.archived.is_(False), Tab.hidden_until > now)


def tabs_for_visibility(visibility: TabVisibility, now: datetime) -> ColumnElement[bool]:
    """Match one mutually exclusive UI page."""
    if visibility == "hidden":
        return hidden_tabs(now)
    if visibility == "archived":
        return Tab.archived.is_(True)
    return visible_tabs(now)


def exportable_tabs(now: datetime) -> ColumnElement[bool]:
    """Omit active hidden tabs while retaining archived backup data."""
    return or_(Tab.archived.is_(True), visible_tabs(now))
