"""Mappings for previews and captured assets."""

from pathlib import Path

from models import Asset, AssetFile, AssetKind, AssetSource, Preview

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
            return PreviewDTO.model_validate(
                {
                    "tab_id": tab_id,
                    "capture": {
                        "status": "pending",
                        "fallback_asset": "/api/v1/assets/fallback-preview",
                    },
                }
            )
        return PreviewDTO.model_validate(
            {
                "tab_id": tab_id,
                "capture": {
                    "status": preview.capture.status,
                    "source_url": preview.capture.source_url,
                    "error": preview.capture.error,
                    "fetched_at": preview.capture.fetched_at,
                    "fallback_asset": "/api/v1/assets/fallback-preview",
                },
                "article": {
                    "title": preview.article.title,
                    "byline": preview.article.byline,
                    "site_name": preview.article.site_name,
                    "excerpt": preview.article.excerpt,
                    "content_html": preview.article.content_html,
                    "length": preview.article.length,
                },
            }
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
        kind: AssetKind,
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
            file=AssetFile(
                kind=kind,
                path=str(path),
                content_type=content_type,
                size_bytes=size_bytes,
                checksum=checksum,
            ),
            source=AssetSource(source_url=source_url),
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
