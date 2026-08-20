from models import Tab

from .dto import TabDTO


class TabMapper:
    @staticmethod
    def to_dto(tab: Tab) -> TabDTO:
        return TabDTO(
            id=tab.id,
            url=tab.url,
            title=tab.title,
            favicon=f"/api/v1/assets/{tab.favicon_asset_id}" if tab.favicon_asset_id else None,
            note=tab.note,
            tags=[tag.name for tag in tab.tags],
            group_id=tab.group_id,
            position=tab.position,
            archived=tab.archived,
            archived_at=tab.archived_at,
            created_at=tab.created_at,
            updated_at=tab.updated_at,
        )
