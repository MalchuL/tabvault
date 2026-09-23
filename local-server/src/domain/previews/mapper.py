"""Mappings for previews and captured assets."""

from pathlib import Path

from models import Asset, Preview

from .dto import AssetFileDTO, PreviewDTO


class PreviewMapper:
    """Map preview rows and captured file metadata."""

    @staticmethod
    def to_dto(tab_id: str, preview: Preview | None) -> PreviewDTO:
        """Convert optional preview state to its wire DTO.

        Args:
            tab_id (str): Stable identifier of the saved tab.
            preview (Preview | None): Captured preview row to convert or persist.

        Returns:
            PreviewDTO: Preview status and captured content for the tab.
        """
        if preview is None:
            return PreviewDTO(
                tab_id=tab_id,
                status="pending",
                fallback_asset="/api/v1/assets/fallback-preview",
            )
        return PreviewDTO(
            tab_id=tab_id,
            status=preview.status,
            title=preview.title,
            byline=preview.byline,
            site_name=preview.site_name,
            excerpt=preview.excerpt,
            content_html=preview.content_html,
            length=preview.length,
            source_url=preview.source_url,
            error=preview.error,
            fetched_at=preview.fetched_at,
            fallback_asset="/api/v1/assets/fallback-preview",
        )

    @staticmethod
    def file(path: Path, media_type: str) -> AssetFileDTO:
        """Create a typed asset-file result.

        Args:
            path (Path): Filesystem path to the captured or exported file.
            media_type (str): MIME type returned when serving the file.

        Returns:
            AssetFileDTO: Validated asset path and media type for download.
        """
        return AssetFileDTO(path=path, media_type=media_type)

    @staticmethod
    def asset(
        *,
        kind: str,
        path: Path,
        content_type: str,
        size_bytes: int,
        checksum: str,
        source_url: str,
    ) -> Asset:
        """Create an asset row from captured file metadata.

        Args:
            kind (str): Kind of job or asset being created.
            path (Path): Filesystem path to the captured or exported file.
            content_type (str): MIME type of the captured resource.
            size_bytes (int): Size of the captured file in bytes.
            checksum (str): Content hash used to deduplicate assets.
            source_url (str): Source page URL associated with the asset.

        Returns:
            Asset: Asset row read or staged by this operation.
        """
        return Asset(
            kind=kind,
            path=str(path),
            content_type=content_type,
            size_bytes=size_bytes,
            checksum=checksum,
            source_url=source_url,
        )

    @staticmethod
    def pending(tab_id: str) -> Preview:
        """Create pending preview state for a tab.

        Args:
            tab_id (str): Stable identifier of the saved tab.

        Returns:
            Preview: Preview row read or staged by this operation.
        """
        return Preview(tab_id=tab_id)
