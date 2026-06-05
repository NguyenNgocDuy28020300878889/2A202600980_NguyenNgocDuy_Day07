from __future__ import annotations

from typing import Any, Callable

from .chunking import _dot, compute_similarity
from .embeddings import _mock_embed
from .models import Document


class EmbeddingStore:
    """
    A vector store for text chunks.

    Tries to use ChromaDB if available; falls back to an in-memory store.
    The embedding_fn parameter allows injection of mock embeddings for tests.
    """

    def __init__(
        self,
        collection_name: str = "documents",
        embedding_fn: Callable[[str], list[float]] | None = None,
    ) -> None:
        self._embedding_fn = embedding_fn or _mock_embed
        self._collection_name = collection_name
        self._use_chroma = False
        self._store: list[dict[str, Any]] = []
        self._collection = None
        self._next_index = 0

        try:
            import chromadb

            self._chroma_client = chromadb.EphemeralClient()
            self._collection = self._chroma_client.get_or_create_collection(
                name=self._collection_name
            )
            self._use_chroma = True
        except Exception:
            self._use_chroma = False
            self._collection = None

    def _make_record(self, doc: Document) -> dict[str, Any]:
        embedding = self._embedding_fn(doc.content)
        return {
            "id": doc.id,
            "content": doc.content,
            "metadata": doc.metadata or {},
            "embedding": embedding,
        }

    def _search_records(self, query: str, records: list[dict[str, Any]], top_k: int) -> list[dict[str, Any]]:
        if not records:
            return []
        query_embedding = self._embedding_fn(query)
        results = []
        for r in records:
            score = compute_similarity(query_embedding, r["embedding"])
            results.append({
                "id": r["id"],
                "content": r["content"],
                "metadata": r["metadata"],
                "score": score,
            })
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:top_k]

    def add_documents(self, docs: list[Document]) -> None:
        """
        Embed each document's content and store it.

        For ChromaDB: use collection.add(ids=[...], documents=[...], embeddings=[...])
        For in-memory: append dicts to self._store
        """
        if self._use_chroma:
            ids = [doc.id for doc in docs]
            documents = [doc.content for doc in docs]
            embeddings = [self._embedding_fn(doc.content) for doc in docs]
            metadatas = [doc.metadata or {} for doc in docs]
            self._collection.add(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)
        else:
            for doc in docs:
                record = self._make_record(doc)
                self._store.append(record)

    def search(self, query: str, top_k: int = 5) -> list[dict[str, Any]]:
        """
        Find the top_k most similar documents to query.

        For in-memory: compute dot product of query embedding vs all stored embeddings.
        """
        if self._use_chroma:
            query_embedding = self._embedding_fn(query)
            res = self._collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k
            )
            results = []
            if res and res.get("ids") and res["ids"][0]:
                for i in range(len(res["ids"][0])):
                    doc_content = res["documents"][0][i]
                    results.append({
                        "id": res["ids"][0][i],
                        "content": doc_content,
                        "metadata": res["metadatas"][0][i] if res.get("metadatas") else {},
                        "score": compute_similarity(query_embedding, self._embedding_fn(doc_content)),
                    })
            return results
        else:
            return self._search_records(query, self._store, top_k)

    def get_collection_size(self) -> int:
        """Return the total number of stored chunks."""
        if self._use_chroma:
            return self._collection.count()
        else:
            return len(self._store)

    def search_with_filter(self, query: str, top_k: int = 3, metadata_filter: dict = None) -> list[dict]:
        """
        Search with optional metadata pre-filtering.

        First filter stored chunks by metadata_filter, then run similarity search.
        """
        if self._use_chroma:
            query_embedding = self._embedding_fn(query)
            res = self._collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k,
                where=metadata_filter
            )
            results = []
            if res and res.get("ids") and res["ids"][0]:
                for i in range(len(res["ids"][0])):
                    doc_content = res["documents"][0][i]
                    results.append({
                        "id": res["ids"][0][i],
                        "content": doc_content,
                        "metadata": res["metadatas"][0][i] if res.get("metadatas") else {},
                        "score": compute_similarity(query_embedding, self._embedding_fn(doc_content)),
                    })
            return results
        else:
            filtered_records = []
            for r in self._store:
                match = True
                if metadata_filter:
                    for k, v in metadata_filter.items():
                        if r["metadata"].get(k) != v:
                            match = False
                            break
                if match:
                    filtered_records.append(r)
            return self._search_records(query, filtered_records, top_k)

    def delete_document(self, doc_id: str) -> bool:
        """
        Remove all chunks belonging to a document.

        Returns True if any chunks were removed, False otherwise.
        """
        if self._use_chroma:
            size_before = self.get_collection_size()
            self._collection.delete(ids=[doc_id])
            self._collection.delete(where={"doc_id": doc_id})
            size_after = self.get_collection_size()
            return size_after < size_before
        else:
            initial_len = len(self._store)
            self._store = [
                r for r in self._store
                if r["id"] != doc_id and r["metadata"].get("doc_id") != doc_id
            ]
            return len(self._store) < initial_len
