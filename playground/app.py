import sys
from pathlib import Path
import json
import os
import re
import math
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import parse_qs, urlparse

# Add root directory to sys.path to allow importing src
root_dir = Path(__file__).parent.parent.absolute()
sys.path.append(str(root_dir))

from src.models import Document
from src.chunking import FixedSizeChunker, SentenceChunker, RecursiveChunker
from src.embeddings import _mock_embed, LocalEmbedder, OpenAIEmbedder
from src.store import EmbeddingStore
from src.agent import KnowledgeBaseAgent

# Global state
global_store = None
global_embedder = _mock_embed
global_provider = "mock"
global_chunks_info = []  # Store chunked documents for display in UI

def init_store(provider="mock", openai_key=None):
    global global_store, global_embedder, global_provider
    global_provider = provider
    
    if provider == "local":
        try:
            global_embedder = LocalEmbedder()
        except Exception as e:
            print(f"Could not load LocalEmbedder: {e}. Falling back to mock.")
            global_embedder = _mock_embed
            global_provider = "mock"
    elif provider == "openai":
        if openai_key:
            os.environ["OPENAI_API_KEY"] = openai_key
        try:
            global_embedder = OpenAIEmbedder()
        except Exception as e:
            print(f"Could not load OpenAIEmbedder: {e}. Falling back to mock.")
            global_embedder = _mock_embed
            global_provider = "mock"
    else:
        global_embedder = _mock_embed
        global_provider = "mock"
        
    global_store = EmbeddingStore(collection_name="playground_store", embedding_fn=global_embedder)

# Initial default store initialization
init_store("mock")

class PlaygroundRequestHandler(BaseHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200, "OK")
        self.end_headers()

    def do_GET(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        if path == "/" or path == "/index.html":
            self.serve_file(root_dir / "playground" / "index.html", "text/html")
        elif path == "/style.css":
            self.serve_file(root_dir / "playground" / "style.css", "text/css")
        elif path == "/app.js":
            self.serve_file(root_dir / "playground" / "app.js", "application/javascript")
        elif path == "/api/status":
            self.send_json_response({
                "provider": global_provider,
                "chunks_count": global_store.get_collection_size() if global_store else 0,
                "loaded_documents": list(set(c["doc_id"] for c in global_chunks_info))
            })
        elif path == "/api/documents":
            self.send_json_response(global_chunks_info)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File not found")

    def do_POST(self):
        parsed_path = urlparse(self.path)
        path = parsed_path.path

        # Read POST body
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(post_data) if post_data else {}
        except Exception as e:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(f"Invalid JSON: {e}".encode())
            return

        if path == "/api/chunk":
            self.handle_chunk(data)
        elif path == "/api/ingest":
            self.handle_ingest(data)
        elif path == "/api/search":
            self.handle_search(data)
        elif path == "/api/ask":
            self.handle_ask(data)
        elif path == "/api/delete":
            self.handle_delete(data)
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Endpoint not found")

    def serve_file(self, file_path, content_type):
        if not file_path.exists():
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"File not found")
            return
        
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.end_headers()
        self.wfile.write(file_path.read_bytes())

    def send_json_response(self, data, status_code=200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def handle_chunk(self, data):
        text = data.get("text", "")
        strategy = data.get("strategy", "recursive")
        chunk_size = int(data.get("chunk_size", 500))
        overlap = int(data.get("overlap", 50))
        max_sentences = int(data.get("max_sentences", 3))

        if strategy == "fixed_size":
            chunker = FixedSizeChunker(chunk_size=chunk_size, overlap=overlap)
        elif strategy == "by_sentences":
            chunker = SentenceChunker(max_sentences_per_chunk=max_sentences)
        else:
            chunker = RecursiveChunker(chunk_size=chunk_size)

        chunks = chunker.chunk(text)
        count = len(chunks)
        avg_length = sum(len(c) for c in chunks) / count if count > 0 else 0.0

        self.send_json_response({
            "chunks": chunks,
            "count": count,
            "avg_length": avg_length
        })

    def handle_ingest(self, data):
        global global_store, global_chunks_info
        
        strategy = data.get("strategy", "recursive")
        chunk_size = int(data.get("chunk_size", 500))
        overlap = int(data.get("overlap", 50))
        max_sentences = int(data.get("max_sentences", 3))
        provider = data.get("provider", "mock")
        openai_key = data.get("openai_key")

        # 1. Initialize store with selected provider
        init_store(provider, openai_key)
        global_chunks_info = []

        # 2. Setup chunker
        if strategy == "fixed_size":
            chunker = FixedSizeChunker(chunk_size=chunk_size, overlap=overlap)
        elif strategy == "by_sentences":
            chunker = SentenceChunker(max_sentences_per_chunk=max_sentences)
        else:
            chunker = RecursiveChunker(chunk_size=chunk_size)

        # 3. Read metadata
        metadata_list = []
        metadata_file = root_dir / "data" / "metadata.json"
        if metadata_file.exists():
            try:
                metadata_list = json.loads(metadata_file.read_text(encoding="utf-8"))
            except Exception as e:
                print(f"Could not read metadata.json: {e}")

        # 4. Load papers, chunk them and store
        papers = ["paper1.md", "paper2.md", "paper3.md", "paper4.md", "paper5.md"]
        total_chunks = 0
        documents_to_add = []

        for idx, paper_name in enumerate(papers):
            paper_path = root_dir / "data" / paper_name
            if not paper_path.exists():
                print(f"Skipping missing paper: {paper_name}")
                continue
            
            content = paper_path.read_text(encoding="utf-8")
            paper_metadata = {"source": paper_name, "doc_id": paper_name}
            
            # Update with actual metadata if available
            if idx < len(metadata_list):
                paper_metadata.update(metadata_list[idx])

            # Chunk document
            chunks = chunker.chunk(content)
            
            for chunk_idx, chunk_text in enumerate(chunks):
                chunk_id = f"{paper_name}_chunk_{chunk_idx}"
                chunk_metadata = paper_metadata.copy()
                chunk_metadata["chunk_index"] = chunk_idx
                chunk_metadata["doc_id"] = paper_name  # Ensure doc_id is available for deletion
                
                doc = Document(id=chunk_id, content=chunk_text, metadata=chunk_metadata)
                documents_to_add.append(doc)
                
                # Keep track for visual UI list
                global_chunks_info.append({
                    "id": chunk_id,
                    "doc_id": paper_name,
                    "title": paper_metadata.get("title", paper_name),
                    "content": chunk_text,
                    "metadata": chunk_metadata,
                    "length": len(chunk_text)
                })
                total_chunks += 1

        if documents_to_add:
            global_store.add_documents(documents_to_add)

        self.send_json_response({
            "success": True,
            "chunks_count": total_chunks,
            "provider": global_provider
        })

    def handle_search(self, data):
        query = data.get("query", "")
        top_k = int(data.get("top_k", 3))
        metadata_filter = data.get("filter")

        if not global_store:
            self.send_json_response({"error": "Store not initialized"}, 500)
            return

        if metadata_filter:
            # Parse filter if it's a string, or use directly if dict
            if isinstance(metadata_filter, str):
                try:
                    metadata_filter = json.loads(metadata_filter)
                except Exception:
                    metadata_filter = None
            
        if metadata_filter:
            results = global_store.search_with_filter(query, top_k=top_k, metadata_filter=metadata_filter)
        else:
            results = global_store.search(query, top_k=top_k)

        self.send_json_response(results)

    def handle_ask(self, data):
        question = data.get("question", "")
        top_k = int(data.get("top_k", 3))

        if not global_store:
            self.send_json_response({"error": "Store not initialized"}, 500)
            return

        def mock_llm_playground(prompt):
            # Try to build a summary answer
            return f"[Playground RAG Agent] Answer generated based on {top_k} retrieved chunks.\n\nPrompt Context Length: {len(prompt)} chars.\n\nQuery Context highlights key biological or AI methods described in the retrieved scientific documents."

        agent = KnowledgeBaseAgent(store=global_store, llm_fn=mock_llm_playground)
        
        # We manually perform search to capture chunks for the UI display
        results = global_store.search(question, top_k=top_k)
        context = "\n".join(r["content"] for r in results)
        prompt = f"Context:\n{context}\n\nQuestion: {question}\nAnswer:"
        
        answer = agent.answer(question, top_k=top_k)
        
        self.send_json_response({
            "answer": answer,
            "prompt": prompt,
            "retrieved_chunks": results
        })

    def handle_delete(self, data):
        doc_id = data.get("doc_id", "")
        global global_chunks_info
        
        if not global_store:
            self.send_json_response({"error": "Store not initialized"}, 500)
            return

        success = global_store.delete_document(doc_id)
        if success:
            # Also remove from global_chunks_info
            global_chunks_info = [c for c in global_chunks_info if c["doc_id"] != doc_id]

        self.send_json_response({
            "success": success,
            "chunks_count": global_store.get_collection_size()
        })

def run(port=8000):
    server_address = ('', port)
    httpd = HTTPServer(server_address, PlaygroundRequestHandler)
    print(f"RAG Playground Server running on http://localhost:{port}...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.server_close()

if __name__ == "__main__":
    port = 8000
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run(port)
