"""Matter Q&A: hybrid retrieval (pgvector + Postgres full-text) then an LLM answer with citations."""
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Document, DocumentChunk
from app.schemas import AskOut, Citation
from app.services import ai_registry

TOP_K = 6
RRF_K = 60

SYSTEM = (
    "You are a legal research assistant helping a lawyer study a matter. Answer ONLY from the numbered "
    "sources provided. Cite sources inline like [1], [2]. If the sources do not contain the answer, say so "
    "plainly instead of guessing. You provide analysis of the documents, not legal advice, and you must never "
    "predict the outcome of a case."
)


def retrieve(db: Session, matter_id: uuid.UUID, query: str, qvec: list[float]) -> list[DocumentChunk]:
    base = select(DocumentChunk).where(DocumentChunk.matter_id == matter_id, DocumentChunk.embedding.is_not(None))
    semantic = db.scalars(base.order_by(DocumentChunk.embedding.cosine_distance(qvec)).limit(20)).all()
    tsq = func.plainto_tsquery("english", query)
    keyword = db.scalars(
        base.where(func.to_tsvector("english", DocumentChunk.content).op("@@")(tsq))
        .order_by(func.ts_rank(func.to_tsvector("english", DocumentChunk.content), tsq).desc())
        .limit(20)
    ).all()
    scores: dict[uuid.UUID, float] = {}
    for ranking in (semantic, keyword):  # reciprocal rank fusion
        for rank, c in enumerate(ranking):
            scores[c.id] = scores.get(c.id, 0) + 1 / (RRF_K + rank)
    by_id = {c.id: c for c in [*semantic, *keyword]}
    return [by_id[i] for i in sorted(scores, key=scores.get, reverse=True)[:TOP_K]]


async def ask_matter(db: Session, matter_id: uuid.UUID, question: str) -> AskOut:
    embedder = ai_registry.get_embedder(db)
    qvec = (await embedder.embed([question]))[0]
    chunks = retrieve(db, matter_id, question, qvec)
    if not chunks:
        return AskOut(answer="No indexed documents were found for this matter. Upload and process a document first.",
                      citations=[])
    docs = {d.id: d for d in db.scalars(select(Document).where(Document.id.in_({c.document_id for c in chunks})))}
    context = "\n\n".join(
        f"[{i}] ({docs[c.document_id].filename}, page {c.page_number or 'n/a'})\n{c.content}"
        for i, c in enumerate(chunks, 1)
    )
    llm = ai_registry.get_llm(db, "qa")
    answer = await llm.complete([
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"Sources:\n{context}\n\nQuestion: {question}"},
    ])
    citations = [
        Citation(document_id=c.document_id, filename=docs[c.document_id].filename, page_number=c.page_number,
                 chunk_index=c.chunk_index, excerpt=c.content[:300])
        for c in chunks
    ]
    return AskOut(answer=answer, citations=citations)
