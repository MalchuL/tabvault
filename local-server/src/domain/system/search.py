"""Local semantic vector index implementation."""

from __future__ import annotations

import asyncio
import shutil
from typing import Any

from config.settings import Settings

from .dto import VectorStatusDTO


class LocalVectorIndex:
    """Manage a lazy sentence-transformer and local zvec collection."""

    def __init__(self, settings: Settings) -> None:
        """Initialize lazy vector-index state."""
        self.settings = settings
        self.path = settings.data_dir / "zvec"
        self._model: Any = None
        self._collection: Any = None
        self.last_error: str | None = None
        self.indexed_count = 0

    def _load_model(self) -> Any:
        """Load the configured embedding model on first use."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self.settings.model_dir.mkdir(parents=True, exist_ok=True)
            self._model = SentenceTransformer(
                self.settings.embedding_model, cache_folder=str(self.settings.model_dir)
            )
        return self._model

    def _open_or_create(self, dimension: int, recreate: bool = False) -> Any:
        """Open or create the local vector collection."""
        import zvec

        if recreate and self.path.exists():
            shutil.rmtree(self.path)
        if self._collection is not None and not recreate:
            return self._collection
        if self.path.exists():
            self._collection = zvec.open(path=str(self.path))
        else:
            schema = zvec.CollectionSchema(
                name="tabvault",
                vectors=[
                    zvec.VectorSchema(
                        name="embedding",
                        data_type=zvec.DataType.VECTOR_FP32,
                        dimension=dimension,
                        index_param=zvec.HnswIndexParam(metric_type=zvec.MetricType.COSINE),
                    )
                ],
            )
            self._collection = zvec.create_and_open(path=str(self.path), schema=schema)
        return self._collection

    def _rebuild_sync(self, documents: list[tuple[str, str]]) -> int:
        """Synchronously replace the vector collection."""
        import zvec

        model = self._load_model()
        if not documents:
            if self.path.exists():
                shutil.rmtree(self.path)
            self._collection = None
            return 0
        vectors = model.encode(
            [text for _, text in documents],
            batch_size=self.settings.embedding_batch_size,
            normalize_embeddings=True,
        ).tolist()
        collection = self._open_or_create(len(vectors[0]), recreate=True)
        collection.insert(
            [
                zvec.Doc(id=tab_id, vectors={"embedding": vector})
                for (tab_id, _), vector in zip(documents, vectors, strict=True)
            ]
        )
        collection.optimize()
        return len(documents)

    async def rebuild(self, documents: list[tuple[str, str]]) -> int:
        """Rebuild the vector collection outside the event loop."""
        try:
            self.indexed_count = await asyncio.to_thread(self._rebuild_sync, documents)
            self.last_error = None
            return self.indexed_count
        except Exception as error:
            self.last_error = str(error)
            raise

    def _search_sync(self, query: str, limit: int) -> list[tuple[str, float]]:
        """Synchronously search for semantically similar documents."""
        model = self._load_model()
        vector = model.encode([query], normalize_embeddings=True)[0].tolist()
        collection = self._open_or_create(len(vector))
        rows = collection.query(
            queries=__import__("zvec").Query(field_name="embedding", vector=vector), topk=limit
        )
        return [
            (
                str(row.id if hasattr(row, "id") else row["id"]),
                max(
                    0.0,
                    min(
                        1.0,
                        1.0 - float(row.score if hasattr(row, "score") else row["score"]),
                    ),
                ),
            )
            for row in rows
        ]

    async def search(self, query: str, limit: int) -> list[tuple[str, float]]:
        """Search the vector collection outside the event loop."""
        try:
            result = await asyncio.to_thread(self._search_sync, query, limit)
            self.last_error = None
            return result
        except Exception as error:
            self.last_error = str(error)
            raise

    def status(self) -> VectorStatusDTO:
        """Return current vector-index readiness."""
        return VectorStatusDTO(
            status="ready" if self.indexed_count and not self.last_error else "not_ready",
            indexed_count=self.indexed_count,
            provider="sentence-transformers",
            model=self.settings.embedding_model,
            last_error=self.last_error,
        )
