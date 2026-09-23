"""Mappings for previews and captured assets."""

from pathlib import Path

from models import Asset, Preview

from .dto import AssetFileDTO, PreviewDTO


class PreviewMapper:
    """Map preview rows and captured file metadata."""

    @staticmethod
    def to_dto(tab_id: str, preview: Preview | None) -> PreviewDTO:
        """Convert optional preview state to its wire DTO."""
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
        """Create a typed asset-file result."""
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
        """Create an asset row from captured file metadata."""
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
        """Create pending preview state for a tab."""
        return Preview(tab_id=tab_id)
