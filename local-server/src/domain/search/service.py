"""Search scoring and property-predicate orchestration."""

import json
import time

from domain.custom_properties.dto import matches_type
from domain.custom_properties.error import InvalidCustomPropertiesError
from domain.custom_properties.service import CustomPropertyService
from domain.tabs.mapper import TabMapper
from lib.time import utc_now

from .dto import (
    PropertyFilterDTO,
    SearchItemDTO,
    SearchMatchedOn,
    SearchMetaDTO,
    SearchResultDTO,
)
from .repository import SearchRepository


class SearchService:
    """Search active tabs using keyword and optional vector scores.

    Attributes:
        repository (SearchRepository): Persistence adapter retained for this service instance.
        custom_properties (CustomPropertyService): Service that validates the current library property schema.
        mapper (TabMapper): Stateless converter between ORM rows and API DTOs.
    """

    def __init__(
        self,
        repository: SearchRepository,
        custom_properties: CustomPropertyService,
    ) -> None:
        """Initialize search dependencies.

        Args:
            repository (SearchRepository): Persistence adapter used by this service.
            custom_properties (CustomPropertyService): Service that validates library custom
                properties.
        """
        self.repository = repository
        self.custom_properties = custom_properties
        self.mapper = TabMapper()

    async def search(
        self,
        query: str,
        limit: int,
        group_id: str | None,
        tags: list[str],
        property_filters: list[PropertyFilterDTO] | None = None,
    ) -> SearchResultDTO:
        """Filter and score matching active tabs.

        Args:
            query (str): Search text or structured search request.
            limit (int): Maximum number of results to return.
            group_id (str | None): Collection ID or null for Unassigned.
            tags (list[str]): Tag filters or associations for the operation.
            property_filters (list[PropertyFilterDTO] | None): Custom-property predicates
                applied to matching tabs.

        Returns:
            SearchResultDTO: Ranked or structured search results.

        Raises:
            InvalidCustomPropertiesError: A custom-property filter is invalid.
        """
        started = time.perf_counter()
        rows = await self.repository.candidates(group_id, tags, utc_now())
        definitions = await self.custom_properties.definitions()
        filters = property_filters or []
        for item in filters:
            definition = definitions.get(item.name)
            if definition is None or not matches_type(item.value, definition["type"]):
                raise InvalidCustomPropertiesError(
                    f"Invalid filter for property {item.name!r}", received=item.value
                )
            if item.operator not in {"eq", "ne"} and definition["type"] not in {"int", "float"}:
                raise InvalidCustomPropertiesError(
                    f"Operator {item.operator!r} requires an int or float property"
                )
        if filters:
            operators = {
                "eq": lambda left, right: left == right,
                "ne": lambda left, right: left != right,
                "gt": lambda left, right: left > right,
                "gte": lambda left, right: left >= right,
                "lt": lambda left, right: left < right,
                "lte": lambda left, right: left <= right,
            }
            rows = [
                row
                for row in rows
                if all(
                    operators[item.operator](
                        self.custom_properties.resolve_values(
                            row.annotations.custom_properties, definitions
                        )[item.name],
                        item.value,
                    )
                    for item in filters
                )
            ]
        by_id = {row.id: row for row in rows}
        terms = [term.lower() for term in query.split() if term]
        keyword: dict[str, tuple[float, SearchMatchedOn]] = {}
        for row in rows:
            fields: dict[SearchMatchedOn, str] = {
                "title": row.content.title.lower(),
                "url": row.content.url.lower(),
                "customProperties": json.dumps(
                    self.custom_properties.resolve_values(
                        row.annotations.custom_properties, definitions
                    ),
                    ensure_ascii=False,
                    sort_keys=True,
                ).lower(),
            }
            matches = [(name, sum(term in text for term in terms)) for name, text in fields.items()]
            name, count = max(matches, key=lambda item: item[1])
            tag_count = sum(
                term in " ".join(tag.name for tag in row.tags).lower() for term in terms
            )
            if tag_count > count:
                name, count = "tags", tag_count
            if count:
                keyword[row.id] = (count / max(len(terms), 1), name)
        results: list[SearchItemDTO] = []
        for tab_id, (score, matched_on) in keyword.items():
            results.append(
                SearchItemDTO(
                    tab=self.mapper.to_dto(
                        by_id[tab_id],
                        self.custom_properties.resolve_values(
                            by_id[tab_id].annotations.custom_properties, definitions
                        ),
                    ),
                    score=round(score, 4),
                    matched_on=matched_on,
                )
            )
        results.sort(key=lambda item: (-item.score, item.tab.id))
        return SearchResultDTO(
            results=results[:limit],
            meta=SearchMetaDTO(
                search_ms=round((time.perf_counter() - started) * 1000),
            ),
            warnings=[],
        )
