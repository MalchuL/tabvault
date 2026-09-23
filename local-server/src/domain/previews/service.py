"""Secure web preview capture and local asset storage."""

from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path
from urllib.parse import urljoin, urlparse

import nh3
from lxml import html as lxml_html
from readability import Document
from sqlalchemy.ext.asyncio import AsyncSession

from clients.web_capture.protocol import WebCaptureProtocol
from config.settings import Settings
from lib.time import utc_now
from models import Asset

from .dto import AssetKind, ExtractedArticleDTO, PreviewCaptureResultDTO
from .mapper import PreviewMapper
from .repository import PreviewRepository

logger = logging.getLogger(__name__)


class PreviewService:
    """Capture sanitized tab previews while owning transactions.

    The operation participates in the local preview pipeline, where remote content is bounded,
    sanitized, and converted into database metadata without exposing unsanitized markup to API
    consumers.

    Attributes:
        db (AsyncSession): Request-scoped session used until the service commits or rolls back.
        settings (Settings): Validated process settings shared for this instance lifetime.
        capture (WebCaptureProtocol): Outbound capture client used to retrieve preview resources.
        repository (PreviewRepository): Persistence adapter retained for this service instance.
        mapper (PreviewMapper): Stateless converter between ORM rows and API DTOs.
    """

    def __init__(
        self,
        db: AsyncSession,
        settings: Settings,
        capture: WebCaptureProtocol,
        repository: PreviewRepository,
    ) -> None:
        """Initialize preview capture dependencies.

        The operation participates in the local preview pipeline, where remote content is bounded,
        sanitized, and converted into database metadata without exposing unsanitized markup to API
        consumers.

        Args:
            db (AsyncSession): Request-scoped asynchronous database session used by this operation.
            settings (Settings): Validated process settings that control this component.
            capture (WebCaptureProtocol): Capture client used to fetch preview resources.
            repository (PreviewRepository): Persistence adapter used to load and mutate domain
                records.
        """
        self.db = db
        self.settings = settings
        self.capture = capture
        self.repository = repository
        self.mapper = PreviewMapper()

    async def _asset(
        self,
        kind: AssetKind,
        content: bytes,
        content_type: str,
        source_url: str,
    ) -> Asset:
        """Write and persist one deduplicated captured asset.

        The operation participates in the local preview pipeline, where remote content is bounded,
        sanitized, and converted into database metadata without exposing unsanitized markup to API
        consumers.

        Args:
            kind (AssetKind): Asset kind used to choose its storage location.
            content (bytes): Untrusted serialized content to parse or validate.
            content_type (str): Validated media type of the captured resource.
            source_url (str): Final URL from which the resource was captured.

        Returns:
            Asset: Existing or newly persisted asset for the captured bytes.
        """
        checksum = hashlib.sha256(content).hexdigest()
        existing = await self.repository.find_asset_checksum(checksum)
        if existing:
            return existing
        suffixes = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/gif": ".gif",
            "image/webp": ".webp",
            "image/svg+xml": ".svg",
            "image/x-icon": ".ico",
        }
        relative = Path(f"{kind}s") / f"{checksum}{suffixes.get(content_type, '.bin')}"
        path = self.settings.asset_dir / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_bytes(content)
        temporary.replace(path)
        asset = self.mapper.asset(
            kind=kind,
            path=relative,
            content_type=content_type,
            size_bytes=len(content),
            checksum=checksum,
            source_url=source_url,
        )
        return await self.repository.save_asset(asset)

    @staticmethod
    def _extract(
        content: bytes, base_url: str
    ) -> tuple[ExtractedArticleDTO, list[str], str | None]:
        """Extract and sanitize readable article content from HTML.

        The operation participates in the local preview pipeline, where remote content is bounded,
        sanitized, and converted into database metadata without exposing unsanitized markup to API
        consumers.

        Args:
            content (bytes): Untrusted serialized content to parse or validate.
            base_url (str): Base URL used to resolve captured resource links.

        Returns:
            tuple[ExtractedArticleDTO, list[str], str | None]: Sanitized article, discovered image
                URLs, and optional favicon URL.
        """
        source = content.decode("utf-8", errors="replace")
        doc = Document(source)
        summary = doc.summary(html_partial=True, keep_all_images=True)
        source_tree = lxml_html.fromstring(source)
        icon_values = source_tree.xpath(
            "//link[contains(translate(@rel,'ICON','icon'),'icon')]/@href"
        )
        icon_url = (
            urljoin(base_url, icon_values[0]) if icon_values else urljoin(base_url, "/favicon.ico")
        )
        cleaned = nh3.clean(
            summary,
            tags={
                "a",
                "article",
                "blockquote",
                "br",
                "code",
                "div",
                "em",
                "figcaption",
                "figure",
                "h1",
                "h2",
                "h3",
                "h4",
                "hr",
                "img",
                "li",
                "ol",
                "p",
                "pre",
                "span",
                "strong",
                "ul",
            },
            attributes={"a": {"href", "title"}, "img": {"src", "alt", "title"}},
            url_relative=("rewrite_with_base", base_url),
        )
        article_tree = lxml_html.fromstring(cleaned)
        images = article_tree.xpath("//img")
        for image in images[1:]:
            image.drop_tree()
        cleaned = lxml_html.tostring(article_tree, encoding="unicode")
        image_urls = [images[0].get("src")] if images and images[0].get("src") else []
        text = " ".join(lxml_html.fromstring(cleaned).itertext()).strip() if cleaned else ""
        title = doc.short_title() or doc.title()
        return (
            ExtractedArticleDTO(
                title=title,
                byline=None,
                site_name=urlparse(base_url).hostname,
                excerpt=text[:500] or None,
                content_html=cleaned,
                length=len(text),
            ),
            image_urls,
            icon_url,
        )

    async def capture_tab(self, tab_id: str) -> PreviewCaptureResultDTO:
        """Capture, sanitize, and persist preview content for one tab.

        The operation participates in the local preview pipeline, where remote content is bounded,
        sanitized, and converted into database metadata without exposing unsanitized markup to API
        consumers.

        Args:
            tab_id (str): Stable identifier of the tab targeted by the operation.

        Returns:
            PreviewCaptureResultDTO: Capture status and persisted preview identifiers for the tab.
        """
        tab = await self.repository.get_tab(tab_id)
        if tab is None:
            return PreviewCaptureResultDTO(skipped="tab_not_found")
        preview = await self.repository.get_preview(tab_id)
        if preview is None:
            preview = await self.repository.save_preview(self.mapper.pending(tab_id))
        await self.repository.apply_changes(preview, {"status": "running"})
        await self.db.commit()
        try:
            page = await self.capture.fetch_html(tab.url)
            article, image_urls, icon_url = await asyncio.to_thread(
                self._extract, page.content, page.url
            )
            html = article.content_html
            total = len(page.content)
            for image_url in dict.fromkeys(image_urls):
                if total >= self.settings.preview_max_total_bytes:
                    break
                try:
                    image = await self.capture.fetch_image(image_url)
                    total += len(image.content)
                    if total > self.settings.preview_max_total_bytes:
                        break
                    asset = await self._asset("image", image.content, image.content_type, image.url)
                    html = html.replace(image_url, f"tabvault-asset://{asset.id}")
                except Exception as error:
                    logger.info("Preview image was skipped: %s", error)
            if icon_url:
                try:
                    icon = await self.capture.fetch_image(icon_url)
                    icon_asset = await self._asset(
                        "icon", icon.content, icon.content_type, icon.url
                    )
                    await self.repository.apply_changes(tab, {"favicon_asset_id": icon_asset.id})
                except Exception as error:
                    logger.info("Favicon was skipped: %s", error)
            title = article.title or tab.title
            await self.repository.apply_changes(
                preview,
                {
                    "status": "ready",
                    "title": title,
                    "byline": article.byline,
                    "site_name": article.site_name,
                    "excerpt": article.excerpt,
                    "content_html": html,
                    "length": article.length,
                    "source_url": page.url,
                    "error": None,
                    "fetched_at": utc_now(),
                },
            )
            if tab.title == tab.url:
                await self.repository.apply_changes(tab, {"title": title})
            await self.db.commit()
            return PreviewCaptureResultDTO(tab_id=tab_id, status="ready")
        except Exception as error:
            await self.repository.apply_changes(
                preview,
                {
                    "status": "unavailable",
                    "error": str(error),
                    "fetched_at": utc_now(),
                },
            )
            await self.db.commit()
            return PreviewCaptureResultDTO(tab_id=tab_id, status="unavailable", error=str(error))
