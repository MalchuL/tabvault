"""Apply approved column values through grouped ORM composites."""

from sqlalchemy import inspect

from models import Base


def apply_model_changes(model: Base, changes: dict[str, object]) -> None:
    """Stage field changes while keeping composite views and columns synchronized.

    The calling service validates the change set and owns the transaction. Updating
    composites rather than their backing attributes keeps already-loaded views current.

    Args:
        model (Base): Persistent record receiving approved changes.
        changes (dict[str, object]): Physical field names and replacement values.
    """
    groups = {
        column.name: composite.key
        for composite in inspect(type(model)).composites
        for column in composite.columns
    }
    for key, value in changes.items():
        target = getattr(model, groups[key]) if key in groups else model
        setattr(target, key, value)
