"""Focused checks for service-level missing-ID rules."""

from __future__ import annotations

import unittest
from unittest.mock import AsyncMock, MagicMock

from sqlalchemy.ext.asyncio import AsyncSession

from domain.custom_properties.service import CustomPropertyService
from domain.groups.error import GroupNotFoundError
from domain.groups.repository import GroupRepository
from domain.groups.service import GroupService
from domain.tabs.error import TabNotFoundError
from domain.tabs.repository import TabRepository
from domain.tabs.service import TabService


class TabServiceLookupTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_tab_raises_the_shared_domain_error(self) -> None:
        """A missing ID reaches the same error before DTO mapping."""
        repository = MagicMock(spec=TabRepository)
        repository.get = AsyncMock(return_value=None)
        service = TabService(
            AsyncMock(spec=AsyncSession),
            repository,
            MagicMock(spec=CustomPropertyService),
        )

        with self.assertRaisesRegex(TabNotFoundError, "missing"):
            await service.get("missing")

        repository.get.assert_awaited_once_with("missing")


class GroupServiceLookupTests(unittest.IsolatedAsyncioTestCase):
    async def test_missing_group_raises_the_shared_domain_error(self) -> None:
        """A missing Group stops the operation before counting member tabs."""
        repository = MagicMock(spec=GroupRepository)
        repository.get = AsyncMock(return_value=None)
        service = GroupService(AsyncMock(spec=AsyncSession), repository)

        with self.assertRaisesRegex(GroupNotFoundError, "missing"):
            await service.get("missing")

        repository.get.assert_awaited_once_with("missing")
        repository.tab_counts.assert_not_called()
