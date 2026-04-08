import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import CurrentUser
from app.database import get_db
from app.models import Note, User, Visibility

router = APIRouter(prefix="/notes", tags=["notes"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class NoteSummary(BaseModel):
    id: str
    title: str
    tags: list[str]
    content_preview: str
    visibility: str
    is_pinned: bool
    updated_at: str


class NoteDetail(BaseModel):
    id: str
    title: str
    content: str
    tags: list[str]
    visibility: str
    is_pinned: bool
    source_url: str | None
    created_at: str
    updated_at: str


class CreateNoteRequest(BaseModel):
    title: str = Field(..., max_length=512)
    content: str = Field(...)
    tags: list[str] = []
    visibility: Literal["public", "private"] = "private"

    @field_validator("title")
    @classmethod
    def title_stripped_non_empty(cls, v: str) -> str:
        s = v.strip()
        if not s:
            raise ValueError("title cannot be empty")
        return s

    @field_validator("content")
    @classmethod
    def content_not_whitespace_only(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("content cannot be empty")
        return v


class UpdateNoteRequest(BaseModel):
    title: str | None = Field(None, max_length=512)
    content: str | None = Field(None)
    tags: list[str] | None = None
    visibility: Literal["public", "private"] | None = None
    is_pinned: bool | None = None

    @field_validator("title")
    @classmethod
    def title_stripped_if_present(cls, v: str | None) -> str | None:
        if v is None:
            return None
        s = v.strip()
        if not s:
            raise ValueError("title cannot be empty")
        return s

    @field_validator("content")
    @classmethod
    def content_not_whitespace_only_if_present(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v.strip():
            raise ValueError("content cannot be empty")
        return v


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _parse_note_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=404, detail="Note not found")


def _content_preview(content: str, max_len: int = 150) -> str:
    t = (content or "").replace("\n", " ").strip()
    if len(t) <= max_len:
        return t
    return t[: max_len - 1] + "…"


def _to_detail(note: Note) -> NoteDetail:
    return NoteDetail(
        id=str(note.id),
        title=note.title,
        content=note.content,
        tags=note.tags or [],
        visibility=note.visibility,
        is_pinned=note.is_pinned,
        source_url=note.source_url,
        created_at=note.created_at.isoformat(),
        updated_at=note.updated_at.isoformat(),
    )


def _to_summary(note: Note) -> NoteSummary:
    return NoteSummary(
        id=str(note.id),
        title=note.title,
        tags=note.tags or [],
        content_preview=_content_preview(note.content),
        visibility=note.visibility,
        is_pinned=note.is_pinned,
        updated_at=note.updated_at.isoformat(),
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=NoteDetail, status_code=201)
async def create_note(
    body: CreateNoteRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> NoteDetail:
    owner_uuid = uuid.UUID(current_user.sub)
    note = Note(
        owner_id=owner_uuid,
        title=body.title,
        content=body.content,
        tags=body.tags,
        visibility=Visibility(body.visibility),
    )
    db.add(note)

    user = await db.get(User, owner_uuid)
    if user is not None:
        user.lifetime_notes_created = (user.lifetime_notes_created or 0) + 1

    await db.commit()
    await db.refresh(note)
    return _to_detail(note)


@router.get("", response_model=list[NoteSummary])
async def list_notes(
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    q: str = "",
    tags: list[str] = Query(default=[]),
    pinned_first: bool = Query(default=True),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> list[NoteSummary]:
    owner_uuid = uuid.UUID(current_user.sub)
    stmt = select(Note).where(Note.owner_id == owner_uuid)

    q = q.strip()
    if q:
        combined = func.concat(func.coalesce(Note.title, ""), " ", func.coalesce(Note.content, ""))
        ts_q = func.plainto_tsquery("english", q)
        stmt = stmt.where(func.to_tsvector("english", combined).op("@@")(ts_q))

    if tags:
        stmt = stmt.where(Note.tags.overlap(tags))

    if pinned_first:
        stmt = stmt.order_by(Note.is_pinned.desc(), Note.updated_at.desc())
    else:
        stmt = stmt.order_by(Note.updated_at.desc())

    stmt = stmt.limit(limit).offset(offset)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [_to_summary(n) for n in rows]


@router.get("/{note_id}", response_model=NoteDetail)
async def get_note(
    note_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> NoteDetail:
    nid = _parse_note_id(note_id)
    owner_uuid = uuid.UUID(current_user.sub)
    note = await db.get(Note, nid)
    if note is None or note.owner_id != owner_uuid:
        raise HTTPException(status_code=404, detail="Note not found")
    return _to_detail(note)


@router.patch("/{note_id}", response_model=NoteDetail)
async def update_note(
    note_id: str,
    body: UpdateNoteRequest,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> NoteDetail:
    nid = _parse_note_id(note_id)
    owner_uuid = uuid.UUID(current_user.sub)
    note = await db.get(Note, nid)
    if note is None or note.owner_id != owner_uuid:
        raise HTTPException(status_code=404, detail="Note not found")

    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.content = body.content
    if body.tags is not None:
        note.tags = body.tags
    if body.visibility is not None:
        note.visibility = Visibility(body.visibility)
    if body.is_pinned is not None:
        note.is_pinned = body.is_pinned

    await db.commit()
    await db.refresh(note)
    return _to_detail(note)


@router.delete("/{note_id}", status_code=204)
async def delete_note(
    note_id: str,
    current_user: CurrentUser,
    db: AsyncSession = Depends(get_db),
) -> None:
    nid = _parse_note_id(note_id)
    owner_uuid = uuid.UUID(current_user.sub)
    note = await db.get(Note, nid)
    if note is None or note.owner_id != owner_uuid:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    await db.commit()
