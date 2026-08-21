from __future__ import annotations

import asyncio
import hashlib
import logging
from pathlib import Path
from urllib.parse import urljoin, urlparse

import nh3
from lxml import html as lxml_html
from readability import Document
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from clients.web_capture.protocol import WebCaptureProtocol
from config.settings import Settings
from lib.time import utc_now
from models import Asset, Preview, Tab

logger = logging.getLogger(__name__)


class PreviewService:
    def __init__(self, db: AsyncSession, settings: Settings, capture: WebCaptureProtocol) -> None:
        self.db = db
        self.settings = settings
        self.capture = capture

    async def _asset(self, kind: str, content: bytes, content_type: str, source_url: str) -> Asset:
        checksum = hashlib.sha256(content).hexdigest()
        existing = await self.db.scalar(select(Asset).where(Asset.checksum == checksum))
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
        asset = Asset(
            kind=kind,
            path=str(relative),
            content_type=content_type,
            size_bytes=len(content),
            checksum=checksum,
            source_url=source_url,
        )
        self.db.add(asset)
        await self.db.flush()
        return asset

    @staticmethod
    def _extract(
        content: bytes, base_url: str
    ) -> tuple[dict[str, str | int | None], list[str], str | None]:
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
            {
                "title": title,
                "byline": None,
                "siteName": urlparse(base_url).hostname,
                "excerpt": text[:500] or None,
                "contentHtml": cleaned,
                "length": len(text),
            },
            image_urls,
            icon_url,
        )

    async def capture_tab(self, tab_id: str) -> dict[str, object]:
        tab = await self.db.get(Tab, tab_id)
        if tab is None:
            return {"skipped": "tab_not_found"}
        preview = await self.db.get(Preview, tab_id)
        if preview is None:
            preview = Preview(tab_id=tab_id)
            self.db.add(preview)
        preview.status = "running"
        await self.db.commit()
        try:
            page = await self.capture.fetch_html(tab.url)
            article, image_urls, icon_url = await asyncio.to_thread(
                self._extract, page.content, page.url
            )
            html = str(article["contentHtml"] or "")
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
                    tab.favicon_asset_id = (
                        await self._asset("icon", icon.content, icon.content_type, icon.url)
                    ).id
                except Exception as error:
                    logger.info("Favicon was skipped: %s", error)
            preview.status = "ready"
            preview.title = str(article["title"] or tab.title)
            preview.byline = None
            preview.site_name = str(article["siteName"] or "") or None
            preview.excerpt = str(article["excerpt"] or "") or None
            preview.content_html = html
            preview.length = int(article["length"] or 0)
            preview.source_url = page.url
            preview.error = None
            preview.fetched_at = utc_now()
            if tab.title == tab.url or tab.title == tab.normalized_url:
                tab.title = preview.title
            await self.db.commit()
            return {"tabId": tab_id, "status": "ready"}
        except Exception as error:
            preview.status = "unavailable"
            preview.error = str(error)
            preview.fetched_at = utc_now()
            await self.db.commit()
            return {"tabId": tab_id, "status": "unavailable", "error": str(error)}
