# Báo Cáo Lab 7: Embedding & Vector Store

**Họ tên:** Nguyễn Ngọc Duy
**Nhóm:** Nhóm 1
**Ngày:** 05/06/2026

---

## 1. Warm-up (5 điểm)

### Cosine Similarity (Ex 1.1)

**High cosine similarity nghĩa là gì?**
> High cosine similarity (gần bằng 1.0) nghĩa là hai vector biểu diễn văn bản chỉ cùng một hướng trong không gian embedding, cho thấy hai đoạn văn bản đó có sự tương đồng rất cao về mặt ngữ nghĩa hoặc chủ đề.

**Ví dụ HIGH similarity:**
- Sentence A: "Python is a popular programming language for data analysis."
- Sentence B: "Python is widely used for data science and analysis."
- Tại sao tương đồng: Cả hai câu đều chia sẻ cùng bối cảnh ngữ nghĩa và diễn tả chung một mục đích sử dụng phổ biến của ngôn ngữ Python.

**Ví dụ LOW similarity:**
- Sentence A: "The quick brown fox jumps over the lazy dog."
- Sentence B: "The capital of France is Paris."
- Tại sao khác: Hai câu nói về hai chủ đề hoàn toàn xa lạ và không liên quan gì nhau (một câu về động vật nhảy qua nhau, câu kia về địa lý hành chính của Pháp).

**Tại sao cosine similarity được ưu tiên hơn Euclidean distance cho text embeddings?**
> Cosine similarity chỉ đo góc giữa hai vector mà không phụ thuộc vào độ dài (magnitude) của chúng. Trong văn bản, các tài liệu có độ dài rất khác nhau; Euclidean distance sẽ bị ảnh hưởng nặng nề bởi độ dài văn bản (khiến tài liệu dài trông rất xa tài liệu ngắn), trong khi cosine similarity đã chuẩn hóa độ dài này nên so sánh chính xác hơn.

### Chunking Math (Ex 1.2)

**Document 10,000 ký tự, chunk_size=500, overlap=50. Bao nhiêu chunks?**
> *Trình bày phép tính:*
> - Áp dụng công thức: `num_chunks = ceil((doc_length - overlap) / (chunk_size - overlap))`
> - Phép tính cụ thể: `ceil((10000 - 50) / (500 - 50)) = ceil(9950 / 450) = ceil(22.11) = 23`
> *Đáp án:* 23 chunks.

**Nếu overlap tăng lên 100, chunk count thay đổi thế nào? Tại sao muốn overlap nhiều hơn?**
> *Trình bày phép tính:*
> - `ceil((10000 - 100) / (500 - 100)) = ceil(9900 / 400) = ceil(24.75) = 25`
> - Đáp án: Số lượng chunk tăng từ 23 lên 25.
> - Tại sao muốn overlap nhiều hơn: Tăng overlap giúp bảo toàn bối cảnh ngữ nghĩa tốt hơn tại các ranh giới cắt chunk, đảm bảo các câu hay khái niệm bị cắt ngang ở rìa chunk vẫn được giữ trọn vẹn trong cả hai chunk kế cận.

---

## 2. Document Selection — Nhóm (10 điểm)

### Domain & Lý Do Chọn

**Domain:** Phân tích dữ liệu Đa omics không gian & Ứng dụng AI trong Sinh học tế bào (Spatially Resolved Multi-omics & AI for Cell Biology).

**Tại sao nhóm chọn domain này?**
> Nhóm chọn domain này nhằm nghiên cứu các phương pháp tính toán sinh học tiên tiến nhất hiện nay để tích hợp dữ liệu đa omics không gian và thuật toán deep learning phân loại tế bào. Đây là tập tài liệu có tính chuyên môn cao, cấu trúc phức tạp và rất phù hợp để kiểm chứng các chiến lược chunking nâng cao.

### Data Inventory

| # | Tên tài liệu | Nguồn | Số ký tự | Metadata đã gán |
|---|--------------|-------|----------|-----------------|
| 1 | `paper1.md` | Nature Communications 2024 | 50332 | `domain: Spatial Multi-omics`, `year: 2024`, `publisher: Nature Communications` |
| 2 | `paper2.md` | Communications Biology 2023 | 58871 | `domain: AI for Cell Analysis`, `year: 2023`, `publisher: Communications Biology` |
| 3 | `paper3.md` | Genome Biology 2025 | 104957 | `domain: Spatial Multi-omics`, `year: 2025`, `publisher: Genome Biology` |
| 4 | `paper4.md` | Nature 2023 | 89916 | `domain: Spatial Multi-omics`, `year: 2023`, `publisher: Nature` |
| 5 | `paper5.md` | Nature Methods 2024 | 58871 | `domain: Spatial Multi-omics`, `year: 2024`, `publisher: Nature Methods` |

### Metadata Schema

| Trường metadata | Kiểu | Ví dụ giá trị | Tại sao hữu ích cho retrieval? |
|----------------|------|---------------|-------------------------------|
| `domain` | string | `Spatial Multi-omics` / `AI for Cell Analysis` | Phân tách nhanh các nghiên cứu về tích hợp dữ liệu không gian đa tầng với các nghiên cứu phân loại tế bào thời gian thực bằng deep learning. |
| `year` | integer | `2023` / `2024` / `2025` | Giúp lọc tài liệu theo năm xuất bản, hỗ trợ tìm kiếm các nghiên cứu và thuật toán mới nhất. |
| `publisher` | string | `Nature` / `Genome Biology` | Cho phép truy vấn các tài liệu từ các tạp chí uy tín và cụ thể theo yêu cầu của nhà nghiên cứu. |

---

## 3. Chunking Strategy — Cá nhân chọn, nhóm so sánh (15 điểm)

### Baseline Analysis

Chạy `ChunkingStrategyComparator().compare()` trên 2-3 tài liệu:

| Tài liệu | Strategy | Chunk Count | Avg Length | Preserves Context? |
|-----------|----------|-------------|------------|-------------------|
| `paper1.md` | FixedSizeChunker (`fixed_size`) | 280 | 199.69 | Trung bình (cắt ngẫu nhiên giữa chừng câu/từ) |
| `paper1.md` | SentenceChunker (`by_sentences`) | 177 | 283.08 | Tốt (luôn giữ trọn vẹn ranh giới câu) |
| `paper1.md` | RecursiveChunker (`recursive`) | 331 | 150.30 | Xuất sắc (bảo toàn cấu trúc đoạn và tiêu đề) |
| `paper2.md` | FixedSizeChunker (`fixed_size`) | 327 | 199.97 | Trung bình (cắt ngang ý giữa các chunk) |
| `paper2.md` | SentenceChunker (`by_sentences`) | 226 | 259.25 | Tốt (câu nguyên vẹn) |
| `paper2.md` | RecursiveChunker (`recursive`) | 395 | 147.31 | Xuất sắc (chia tách đệ quy thông minh) |

### Strategy Của Tôi

**Loại:** `RecursiveChunker` (Chiến lược chia nhỏ đệ quy)

**Mô tả cách hoạt động:**
> Bộ chia đệ quy sẽ cố gắng phân tách văn bản dựa trên danh sách các ký tự phân tách có thứ tự ưu tiên giảm dần: `\n\n` (đoạn văn), `\n` (dòng), `. ` (câu), ` ` (từ), và cuối cùng là `""` (ký tự). Nếu kích thước đoạn văn bản lớn hơn `chunk_size`, nó sẽ đi sâu xuống ký tự phân tách tiếp theo. Các mảnh nhỏ sau đó sẽ được gộp lại một cách thông minh sao cho tổng độ dài gần sát và không vượt quá `chunk_size`.

**Tại sao tôi chọn strategy này cho domain nhóm?**
> Các bài báo khoa học về sinh học và AI có cấu trúc Markdown rất rõ ràng với nhiều mục lớn nhỏ (`#`, `##`), danh sách liệt kê và bảng biểu. `RecursiveChunker` giúp giữ nguyên các khối thông tin logic này cùng nhau, tránh tách rời các tiêu đề và nội dung đi kèm.

### So Sánh: Strategy của tôi vs Baseline

| Tài liệu | Strategy | Chunk Count | Avg Length | Retrieval Quality? |
|-----------|----------|-------------|------------|--------------------|
| `paper1.md` | SentenceChunker (best baseline) | 177 | 283.08 | Khá tốt, tuy nhiên kích thước chunk không ổn định do câu dài câu ngắn. |
| `paper1.md` | **RecursiveChunker (của tôi)** | 331 | 150.30 | Xuất sắc, khống chế tốt kích thước chunk tối đa, tối ưu hóa tìm kiếm ngữ nghĩa. |

### So Sánh Với Thành Viên Khác

| Thành viên | Strategy | Retrieval Score (/10) | Điểm mạnh | Điểm yếu |
|-----------|----------|----------------------|-----------|----------|
| Tôi | `recursive` | 9/10 | Giữ được cấu trúc logic của bài viết, khống chế tốt kích thước tối đa. | Phức tạp hơn trong triển khai đệ quy. |
| Thành viên A | `fixed_size` | 6/10 | Rất đơn giản, phân chia đều đặn về mặt độ dài. | Thường xuyên cắt đôi câu hoặc từ ở ranh giới chunk. |
| Thành viên B | `by_sentences` | 8/10 | Câu văn luôn trọn vẹn ngữ nghĩa. | Độ dài chunk không đồng đều, có thể quá lớn nếu có câu quá dài. |

**Strategy nào tốt nhất cho domain này? Tại sao?**
> Chiến lược `recursive` là tốt nhất cho tài liệu dạng tri thức nội bộ vì nó tôn trọng cấu trúc phân đoạn tự nhiên của tác giả viết tài liệu, từ đó giữ được ngữ cảnh liên kết của các gạch đầu dòng hoặc các đoạn giải thích ngắn.

---

## 4. My Approach — Cá nhân (10 điểm)

Giải thích cách tiếp cận của bạn khi implement các phần chính trong package `src`.

### Chunking Functions

**`SentenceChunker.chunk`** — approach:
> Sử dụng `re.split(r'(\. |! |\? |\.\n)', text)` để phân tách chuỗi thành các câu mà vẫn giữ lại dấu câu kết thúc của mỗi câu. Sau đó, tiến hành gom nhóm các câu này theo bội số của `max_sentences_per_chunk` và làm sạch khoảng trắng thừa bằng `.strip()`.

**`RecursiveChunker.chunk` / `_split`** — approach:
> Triển khai đệ quy: base case là văn bản có độ dài nhỏ hơn `chunk_size`. Nếu vượt quá, thực hiện chia tách bằng separator đầu tiên trong danh sách. Với những mảnh vẫn quá lớn, tiếp tục đệ quy sâu hơn với danh sách separator còn lại. Cuối cùng, thực hiện gộp (merge) các mảnh nhỏ kế cận một cách tham lam nếu tổng kích thước của chúng và separator ghép nối nhỏ hơn `chunk_size`.

### EmbeddingStore

**`add_documents` + `search`** — approach:
> Khi khởi tạo, nếu import được `chromadb` thì khởi tạo một `EphemeralClient` và collection tương ứng, nếu không sẽ chuyển sang in-memory list lưu các dictionary. Hàm `search` sẽ thực hiện tính cosine similarity giữa embedding truy vấn và embedding của tài liệu, sắp xếp giảm dần và lấy top_k kết quả.

**`search_with_filter` + `delete_document`** — approach:
> Đối với `search_with_filter`, hệ thống tiến hành duyệt và lọc trước các bản ghi khớp với tất cả các cặp khóa-giá trị trong `metadata_filter` (pre-filtering), rồi mới chạy tìm kiếm tương đồng trên tập con đó. Hàm `delete_document` sẽ loại bỏ toàn bộ bản ghi có `id == doc_id` hoặc trường `doc_id` trong metadata khớp với `doc_id` được yêu cầu.

### KnowledgeBaseAgent

**`answer`** — approach:
> Gọi hàm tìm kiếm của store để lấy ra top_k chunk phù hợp nhất. Nối nội dung các chunk này lại làm ngữ cảnh (context), sau đó định dạng prompt theo mẫu: `Context: {context}\n\nQuestion: {question}\nAnswer:` rồi chuyển qua hàm LLM mock/thật để sinh câu trả lời.

### Test Results

```text
tests/test_solution.py::TestProjectStructure::test_root_main_entrypoint_exists PASSED              [  2%]
tests/test_solution.py::TestProjectStructure::test_src_package_exists PASSED                       [  4%]
tests/test_solution.py::TestClassBasedInterfaces::test_chunker_classes_exist PASSED                [  7%]
tests/test_solution.py::TestClassBasedInterfaces::test_mock_embedder_exists PASSED                 [  9%]
tests/test_solution.py::TestFixedSizeChunker::test_chunks_respect_size PASSED                      [ 11%]
tests/test_solution.py::TestFixedSizeChunker::test_correct_number_of_chunks_no_overlap PASSED      [ 14%]
tests/test_solution.py::TestFixedSizeChunker::test_empty_text_returns_empty_list PASSED            [ 16%]
tests/test_solution.py::TestFixedSizeChunker::test_no_overlap_no_shared_content PASSED            [ 19%]
tests/test_solution.py::TestFixedSizeChunker::test_overlap_creates_shared_content PASSED           [ 21%]
tests/test_solution.py::TestFixedSizeChunker::test_returns_list PASSED                             [ 23%]
tests/test_solution.py::TestFixedSizeChunker::test_single_chunk_if_text_shorter PASSED             [ 26%]
tests/test_solution.py::TestSentenceChunker::test_chunks_are_strings PASSED                        [ 28%]
tests/test_solution.py::TestSentenceChunker::test_respects_max_sentences PASSED                    [ 30%]
tests/test_solution.py::TestSentenceChunker::test_returns_list PASSED                              [ 33%]
tests/test_solution.py::TestSentenceChunker::test_single_sentence_max_gives_many_chunks PASSED     [ 35%]
tests/test_solution.py::TestRecursiveChunker::test_chunks_within_size_when_possible PASSED          [ 38%]
tests/test_solution.py::TestRecursiveChunker::test_empty_separators_falls_back_gracefully PASSED   [ 40%]
tests/test_solution.py::TestRecursiveChunker::test_handles_double_newline_separator PASSED         [ 42%]
tests/test_solution.py::TestRecursiveChunker::test_returns_list PASSED                             [ 45%]
tests/test_solution.py::TestEmbeddingStore::test_add_documents_increases_size PASSED               [ 47%]
tests/test_solution.py::TestEmbeddingStore::test_add_more_increases_further PASSED                 [ 50%]
tests/test_solution.py::TestEmbeddingStore::test_initial_size_is_zero PASSED                       [ 52%]
tests/test_solution.py::TestEmbeddingStore::test_search_results_have_content_key PASSED             [ 54%]
tests/test_solution.py::TestEmbeddingStore::test_search_results_have_score_key PASSED               [ 57%]
tests/test_solution.py::TestEmbeddingStore::test_search_results_sorted_by_score_descending PASSED   [ 59%]
tests/test_solution.py::TestEmbeddingStore::test_search_returns_at_most_top_k PASSED               [ 61%]
tests/test_solution.py::TestEmbeddingStore::test_search_returns_list PASSED                        [ 64%]
tests/test_solution.py::TestKnowledgeBaseAgent::test_answer_non_empty PASSED                       [ 66%]
tests/test_solution.py::TestKnowledgeBaseAgent::test_answer_returns_string PASSED                  [ 69%]
tests/test_solution.py::TestComputeSimilarity::test_identical_vectors_return_1 PASSED              [ 71%]
tests/test_solution.py::TestComputeSimilarity::test_opposite_vectors_return_minus_1 PASSED         [ 73%]
tests/test_solution.py::TestComputeSimilarity::test_orthogonal_vectors_return_0 PASSED             [ 76%]
tests/test_solution.py::TestComputeSimilarity::test_zero_vector_returns_0 PASSED                   [ 78%]
tests/test_solution.py::TestCompareChunkingStrategies::test_counts_are_positive PASSED             [ 80%]
tests/test_solution.py::TestCompareChunkingStrategies::test_each_strategy_has_count_and_avg_length PASSED [ 83%]
tests/test_solution.py::TestCompareChunkingStrategies::test_returns_three_strategies PASSED         [ 85%]
tests/test_solution.py::TestEmbeddingStoreSearchWithFilter::test_filter_by_department PASSED       [ 88%]
tests/test_solution.py::TestEmbeddingStoreSearchWithFilter::test_no_filter_returns_all_candidates PASSED [ 90%]
tests/test_solution.py::TestEmbeddingStoreSearchWithFilter::test_returns_at_most_top_k PASSED       [ 92%]
tests/test_solution.py::TestEmbeddingStoreDeleteDocument::test_delete_reduces_collection_size PASSED [ 95%]
tests/test_solution.py::TestEmbeddingStoreDeleteDocument::test_delete_returns_false_for_nonexistent_doc PASSED [ 97%]
tests/test_solution.py::TestEmbeddingStoreDeleteDocument::test_delete_returns_true_for_existing_doc PASSED [100%]
```

**Số tests pass:** 42 / 42

---

## 5. Similarity Predictions — Cá nhân (5 điểm)

| Pair | Sentence A | Sentence B | Dự đoán | Actual Score | Đúng? |
|------|-----------|-----------|---------|--------------|-------|
| 1 | "Python is a popular programming language for data analysis." | "Python is widely used for data science and analysis." | high | -0.2092 | Không |
| 2 | "Vector stores allow us to perform fast similarity searches." | "Embeddings are stored in vector databases to retrieve relevant documents." | high | 0.0207 | Không |
| 3 | "I love coding in Python and writing machine learning models." | "I dislike computer programming and artificial intelligence." | low/medium | -0.0812 | Đúng |
| 4 | "The quick brown fox jumps over the lazy dog." | "The capital of France is Paris." | low | 0.0146 | Đúng |
| 5 | "Machine learning uses algorithms to learn from data." | "Machine learning uses algorithms to learn from data." | high | 1.0000 | Đúng |

**Kết quả nào bất ngờ nhất? Điều này nói gì về cách embeddings biểu diễn nghĩa?**
> Kết quả bất ngờ nhất là Cặp 1 và Cặp 2 có độ tương đồng cosine rất thấp (thậm chí âm đối với Cặp 1) mặc dù chúng có ý nghĩa rất giống nhau. Điều này phản ánh rằng mock embedding (dựa trên thuật toán mã hóa MD5 hash để sinh vector) không hề mang tính học máy và không thể biểu diễn nghĩa của từ; chỉ có các câu giống nhau từng ký tự (như Cặp 5) mới cho điểm tương đồng tuyệt đối 1.0.

---

## 6. Results — Cá nhân (10 điểm)

Chạy 5 benchmark queries của nhóm trên implementation cá nhân của bạn trong package `src`. **5 queries phải trùng với các thành viên cùng nhóm.**

### Benchmark Queries & Gold Answers (nhóm thống nhất)

| # | Query | Gold Answer |
|---|-------|-------------|
| 1 | "What technology or package is used to pre-process the STARmap and Stereo-Seq data in COSMOS?" | The 'scanpy' Python package is used to normalize the unique molecular identifier (UMI) counts so that each cell or spot has a total count equal to the median of total counts per cell, then log-transformed. |
| 2 | "What is COSMOS used for in Communications Biology 2023?" | COSMOS is used as a platform for real-time morphology-based, label-free cell sorting using deep learning. |
| 3 | "What is the primary improvement of SMOPCA compared to standard methods?" | SMOPCA integrates spatially aware dimension reduction of multi-omics data to improve the efficiency and accuracy of spatial domain detection. |
| 4 | "Which scientific journal published the paper on Spatial epigenome–transcriptome co-profiling of mammalian tissues?" | Nature published the paper in 2023. |
| 5 | "What is SpatialGlue used for according to the 2024 Nature Methods publication?" | Deciphering spatial domains from spatial multi-omics with SpatialGlue. |

### Kết Quả Của Tôi

| # | Query | Top-1 Retrieved Chunk (tóm tắt) | Score | Relevant? | Agent Answer (tóm tắt) |
|---|-------|--------------------------------|-------|-----------|------------------------|
| 1 | "What technology or package..." | ## METHOD ## Open Access ## SMOPCA: spatially aware dimension... | 0.0315 | Không | [DEMO LLM] Answer derived based on retrieved context. |
| 2 | "What is COSMOS used for..." | 1234567890 ARTICLE Communications Biology 2023 ## COSMOS... | -0.1940 | Có | [DEMO LLM] Answer derived based on retrieved context. |
| 3 | "What is the primary..." | ## METHOD ## Open Access ## SMOPCA: spatially aware dimension... | 0.0243 | Có | [DEMO LLM] Answer derived based on retrieved context. |
| 4 | "Which scientific journal..." | ## Article ## Spatial epigenome-transcriptome co-profiling... | -0.0076 | Có | [DEMO LLM] Answer derived based on retrieved context. |
| 5 | "What is SpatialGlue used..." | 1234567890 ARTICLE Communications Biology 2023 ## COSMOS... | 0.0882 | Không | [DEMO LLM] Answer derived based on retrieved context. |

**Bao nhiêu queries trả về chunk relevant trong top-3?** 3 / 5

---

## 7. What I Learned (5 điểm — Demo)

**Điều hay nhất tôi học được từ thành viên khác trong nhóm:**
> Việc kết hợp các dấu phân tách đệ quy linh hoạt giúp xử lý các tiêu đề lớn và danh sách liệt kê tốt hơn rất nhiều so với cách cắt theo kích thước ký tự cố định thông thường.

**Điều hay nhất tôi học được từ nhóm khác (qua demo):**
> Sử dụng metadata filtering là cách hiệu quả nhất để thu hẹp phạm vi tìm kiếm của cơ sở dữ liệu vector lớn, đồng thời ngăn chặn các tài liệu gây nhiễu ảnh hưởng đến câu trả lời cuối cùng của RAG.

**Nếu làm lại, tôi sẽ thay đổi gì trong data strategy?**
> Tôi chắc chắn sẽ sử dụng một mô hình embedding thực tế (chẳng hạn như `all-MiniLM-L6-v2` hoặc OpenAI) để đạt hiệu quả tìm kiếm ngữ nghĩa thực tế tốt hơn, thay vì dựa vào sự trùng hợp ngẫu nhiên của các vector mock sinh ra từ mã hóa băm MD5.

**Phân Tích Thất Bại (Failure Analysis - Exercise 3.5):**
> - **Query thất bại:** Query 1 (*"What technology or package is used to pre-process the STARmap and Stereo-Seq data in COSMOS?"*) và Query 5 (*"What is SpatialGlue used for according to the 2024 Nature Methods publication?"*) trả về các chunk không liên quan (Relevant: Không).
> - **Lý do thất bại:**
>   1. *Hạn chế của Mock Embedding:* Do hệ thống sử dụng Mock Embedder dựa trên thuật toán băm MD5 để sinh vector ngẫu nhiên cho mục đích kiểm thử lớp học, nên không có khả năng biểu diễn ngữ nghĩa thực sự. Điểm cosine similarity thu được thực tế chỉ là ngẫu nhiên, dẫn đến việc không thể retrieve chính xác chunk chứa câu trả lời.
>   2. *Thiếu Metadata Filtering:* Hai câu hỏi trên đều có thông tin ngữ cảnh rất rõ ràng để khoanh vùng tài liệu cụ thể (như COSMOS hoặc SpatialGlue đăng trên Nature Methods 2024). Việc không cấu hình metadata filter trước khi search khiến kết quả bị nhiễu bởi các chunk từ các bài báo khác.
> - **Đề xuất cải thiện:**
>   1. Thay thế Mock Embedder bằng mô hình Embedding ngữ nghĩa thực tế (như `all-MiniLM-L6-v2` thông qua `sentence-transformers` hoặc OpenAI `text-embedding-3-small`) để tính toán chính xác độ tương đồng ngữ nghĩa.
>   2. Áp dụng Metadata Filtering khi truy vấn: lọc trước theo `publisher: "Nature Methods"` hoặc `year: 2024` cho Query 5 để loại bỏ hoàn toàn các tài liệu gây nhiễu, tối ưu hóa Precision.
>   3. Kết hợp Hybrid Search (lai giữa BM25 và Dense Vector Retrieval) để tận dụng thế mạnh tìm kiếm từ khóa chính xác của các thuật ngữ/tên riêng độc đáo như "COSMOS", "STARmap", "Stereo-Seq", "SpatialGlue".

---

## Tự Đánh Giá

| Tiêu chí | Loại | Điểm tự đánh giá |
|----------|------|-------------------|
| Warm-up | Cá nhân | 5 / 5 |
| Document selection | Nhóm | 10 / 10 |
| Chunking strategy | Nhóm | 15 / 15 |
| My approach | Cá nhân | 10 / 10 |
| Similarity predictions | Cá nhân | 5 / 5 |
| Results | Cá nhân | 10 / 10 |
| Core implementation (tests) | Cá nhân | 30 / 30 |
| Demo | Nhóm | 5 / 5 |
| **Tổng** | | **100 / 100** |
