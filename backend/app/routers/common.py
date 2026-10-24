from fastapi import HTTPException, status

from ..schemas import DocumentScope


def require_document_ids(body: DocumentScope) -> list[str]:
    ids = body.ids()
    if not ids:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "document_id or document_ids is required")
    return ids
