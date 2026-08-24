from __future__ import annotations

from pathlib import Path

import pytest

from config.settings import Settings
from db.session import configure_database, dispose_database
from domain.tabs.dto import TabBatchCreateDTO, TabCreateDTO
from domain.tabs.error import DuplicateTabIdError
from domain.tabs.repository import TabRepository
from domain.tabs.service import TabService
from models import Base, Group


@pytest.mark.asyncio
async def test_batch_create_preserves_occurrences_and_rolls_back_as_one_unit(
    tmp_path: Path,
) -> None:
    """Persist ordered occurrences and leave no partial rows after a batch failure."""
    settings = Settings(
        data_dir=tmp_path,
        database_url=f"sqlite+aiosqlite:///{tmp_path / 'batch.db'}",
    )
    engine, factory = configure_database(settings)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with factory() as db:
        group = Group(id="session", name="Session", category="session", position=0)
        db.add(group)
        await db.commit()

        repository = TabRepository(db)
        service = TabService(db, repository)
        exact_url = "https://example.com/exact?x=1#part"
        tabs, jobs = await service.create_batch(
            TabBatchCreateDTO(
                tabs=[
                    TabCreateDTO(id="batch-one", url=exact_url, title="First", group_id=group.id),
                    TabCreateDTO(id="batch-two", url=exact_url, title="Second", group_id=group.id),
                ]
            )
        )

        assert [tab.id for tab in tabs] == ["batch-one", "batch-two"]
        assert [tab.url for tab in tabs] == [exact_url, exact_url]
        assert [tab.position for tab in tabs] == [0.0, 1.0]
        assert [job.tab_id for job in jobs] == ["batch-one", "batch-two"]

        with pytest.raises(DuplicateTabIdError):
            await service.create_batch(
                TabBatchCreateDTO(
                    tabs=[
                        TabCreateDTO(id="rolled-back", url="https://example.com/first"),
                        TabCreateDTO(id="rolled-back", url="https://example.com/second"),
                    ]
                )
            )
        assert await repository.get("rolled-back") is None

    await dispose_database()
