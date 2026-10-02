"""Apply all library resource kinds through one transactional synchronization path."""

from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import Settings
from domain.transfer.service import TransferService

from .dto import SyncRequestDTO, SyncResponseDTO, TombstoneDTO
from .repository import SyncRepository


class SyncConflictError(ValueError):
    """Require explicit adoption after authoritative library replacement."""


class SyncService:
    """Own one sync transaction; failures leave every submitted change unapplied.

    Attributes:
        db (AsyncSession): Request-scoped transaction.
        settings (Settings): Backup and transfer configuration.
        repository (SyncRepository): Shared resource loading and mutation persistence.
    """

    def __init__(self, db: AsyncSession, settings: Settings) -> None:
        """Bind synchronization to one transaction.

        Args:
            db (AsyncSession): Session owned until commit or rollback.
            settings (Settings): Validated server settings.
        """
        self.db = db
        self.settings = settings
        self.repository = SyncRepository(db)

    async def snapshot(self, acknowledged: list[str]) -> SyncResponseDTO:
        """Read a complete snapshot within the current transaction.

        Args:
            acknowledged (list[str]): Submitted tokens handled by this transaction.

        Returns:
            SyncResponseDTO: Library, generation, definition timestamps, and tombstones.
        """
        metadata = await self.repository.metadata()
        definitions = await self.repository.definitions()
        tombstones = await self.repository.tombstones()
        document = await TransferService(
            self.db, self.settings, self.repository.transfer
        ).document()
        return SyncResponseDTO(
            generation=metadata.generation,
            document=document,
            acknowledged=acknowledged,
            property_times={row.name: row.updated_at for row in definitions},
            tombstones=[
                TombstoneDTO(kind=row.entity_type, id=row.entity_id, updated_at=row.deleted_at)
                for row in tombstones
            ],
        )

    async def apply(self, request: SyncRequestDTO) -> SyncResponseDTO:
        """Validate and atomically apply pending records, retaining server state on ties.

        Args:
            request (SyncRequestDTO): Compatible generation and unique pending changes.

        Returns:
            SyncResponseDTO: Committed snapshot and handled change tokens.

        Raises:
            SyncConflictError: The server library has been replaced.
            ValueError: A resource or reference is invalid; the complete batch rolls back.
        """
        try:
            metadata = await self.repository.metadata()
            if request.generation is not None and request.generation != metadata.generation:
                raise SyncConflictError(
                    "The server library was replaced. Export your local copy before explicitly loading the new library."
                )
            # Prerequisite upserts precede tabs; deletions run last to enforce cascades.
            priority = {"property": 0, "tag": 1, "group": 2, "tab": 3}
            changes = sorted(request.changes, key=lambda c: (c.data is None, priority[c.kind]))
            for change in changes:
                try:
                    await self.repository.apply_change(change)
                except ValueError as error:
                    raise ValueError(f"{change.kind}/{change.id}: {error}") from error
            await self.repository.flush()
            result = await self.snapshot([change.token for change in request.changes])
            await self.db.commit()
            return result
        except Exception:
            await self.db.rollback()
            raise
