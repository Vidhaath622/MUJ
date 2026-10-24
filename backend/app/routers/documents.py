from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status

from ..db import User
from ..deps import get_current_user, get_engine
from ..engine_bridge import Engine
from ..settings import MAX_UPLOAD_BYTES

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload")
def upload_document(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    engine: Engine = Depends(get_engine),
) -> dict:
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file has no filename")
    data = file.file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE, f"File is larger than {MAX_UPLOAD_BYTES // (1024 * 1024)} MB"
        )
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty")
    return engine.ingest(user.id, file.filename, data)


@router.get("")
def list_documents(user: User = Depends(get_current_user), engine: Engine = Depends(get_engine)) -> list[dict]:
    return engine.list_documents(user.id)


@router.get("/{document_id}")
def get_document(document_id: str, user: User = Depends(get_current_user), engine: Engine = Depends(get_engine)) -> dict:
    return engine.get_document(user.id, document_id)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, user: User = Depends(get_current_user), engine: Engine = Depends(get_engine)):
    engine.delete_document(user.id, document_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
