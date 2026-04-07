#!/usr/bin/env python3
import os
import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import BadRequest


def create_app() -> Flask:
    app = Flask(__name__)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/settings")
    def settings_page():
        return render_template("settings.html")

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.errorhandler(BadRequest)
    def handle_bad_request(err):
        if request.path.startswith("/api/"):
            return jsonify({"error": err.description}), 400
        return err

    @app.get("/api/config")
    def config():
        return jsonify({"defaultPalace": os.getenv("MEMORY_PALACE_PATH", "")})

    @app.get("/api/summary")
    def summary():
        db_path = resolve_db_path(request.args.get("palace") or os.getenv("MEMORY_PALACE_PATH", ""))
        with connect_readonly(db_path) as conn:
            rows = conn.execute(
                """
                SELECT
                  COUNT(*) AS total_drawers,
                  COUNT(DISTINCT CASE WHEN key='wing' THEN string_value END) AS wings,
                  COUNT(DISTINCT CASE WHEN key='room' THEN string_value END) AS rooms
                FROM embedding_metadata
                """
            ).fetchone()
        return jsonify(
            {
                "dbPath": str(db_path),
                "totalDrawers": rows["total_drawers"],
                "wings": rows["wings"],
                "rooms": rows["rooms"],
            }
        )

    @app.get("/api/wings")
    def wings():
        db_path = resolve_db_path(request.args.get("palace") or os.getenv("MEMORY_PALACE_PATH", ""))
        with connect_readonly(db_path) as conn:
            rows = conn.execute(
                """
                SELECT string_value AS wing, COUNT(*) AS drawer_count
                FROM embedding_metadata
                WHERE key='wing'
                GROUP BY string_value
                ORDER BY drawer_count DESC, wing ASC
                """
            ).fetchall()
        return jsonify({"items": [dict(r) for r in rows]})

    @app.get("/api/rooms")
    def rooms():
        db_path = resolve_db_path(request.args.get("palace") or os.getenv("MEMORY_PALACE_PATH", ""))
        wing = (request.args.get("wing") or "").strip()

        sql = """
            WITH meta AS (
              SELECT
                e.id,
                MAX(CASE WHEN m.key='wing' THEN m.string_value END) AS wing,
                MAX(CASE WHEN m.key='room' THEN m.string_value END) AS room
              FROM embeddings e
              JOIN embedding_metadata m ON m.id=e.id
              GROUP BY e.id
            )
            SELECT room, COUNT(*) AS drawer_count
            FROM meta
        """
        params: list[Any] = []
        if wing:
            sql += " WHERE wing = ?"
            params.append(wing)
        sql += " GROUP BY room ORDER BY drawer_count DESC, room ASC"

        with connect_readonly(db_path) as conn:
            rows = conn.execute(sql, params).fetchall()
        return jsonify({"items": [dict(r) for r in rows]})

    @app.get("/api/drawers")
    def drawers():
        db_path = resolve_db_path(request.args.get("palace") or os.getenv("MEMORY_PALACE_PATH", ""))
        wing = (request.args.get("wing") or "").strip()
        room = (request.args.get("room") or "").strip()
        query = (request.args.get("q") or "").strip()
        limit = min(max(parse_int_arg("limit", 50), 1), 200)
        offset = max(parse_int_arg("offset", 0), 0)

        where_clauses: list[str] = []
        params: list[Any] = []

        if wing:
            where_clauses.append("wing = ?")
            params.append(wing)
        if room:
            where_clauses.append("room = ?")
            params.append(room)
        if query:
            where_clauses.append("LOWER(document) LIKE ?")
            params.append(f"%{query.lower()}%")

        where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""

        sql_base = f"""
            WITH meta AS (
              SELECT
                e.id,
                e.embedding_id,
                MAX(CASE WHEN m.key='wing' THEN m.string_value END) AS wing,
                MAX(CASE WHEN m.key='room' THEN m.string_value END) AS room,
                MAX(CASE WHEN m.key='source_file' THEN m.string_value END) AS source_file,
                MAX(CASE WHEN m.key='filed_at' THEN m.string_value END) AS filed_at,
                MAX(CASE WHEN m.key='chunk_index' THEN COALESCE(m.int_value, CAST(m.string_value AS INTEGER)) END) AS chunk_index,
                MAX(CASE WHEN m.key='chroma:document' THEN m.string_value END) AS document
              FROM embeddings e
              JOIN embedding_metadata m ON m.id=e.id
              GROUP BY e.id
            )
            SELECT
              embedding_id,
              wing,
              room,
              source_file,
              filed_at,
              chunk_index,
              SUBSTR(document, 1, 500) AS snippet,
              LENGTH(document) AS document_length
            FROM meta
            {where_sql}
            ORDER BY filed_at DESC, wing ASC, room ASC, source_file ASC, chunk_index ASC
            LIMIT ? OFFSET ?
        """

        sql_count = f"""
            WITH meta AS (
              SELECT
                e.id,
                MAX(CASE WHEN m.key='wing' THEN m.string_value END) AS wing,
                MAX(CASE WHEN m.key='room' THEN m.string_value END) AS room,
                MAX(CASE WHEN m.key='chroma:document' THEN m.string_value END) AS document
              FROM embeddings e
              JOIN embedding_metadata m ON m.id=e.id
              GROUP BY e.id
            )
            SELECT COUNT(*) AS total FROM meta {where_sql}
        """

        with connect_readonly(db_path) as conn:
            total = conn.execute(sql_count, params).fetchone()["total"]
            rows = conn.execute(sql_base, [*params, limit, offset]).fetchall()

        return jsonify(
            {
                "total": total,
                "limit": limit,
                "offset": offset,
                "items": [dict(r) for r in rows],
            }
        )

    @app.get("/api/drawer/<embedding_id>")
    def drawer(embedding_id: str):
        db_path = resolve_db_path(request.args.get("palace") or os.getenv("MEMORY_PALACE_PATH", ""))

        sql = """
            WITH meta AS (
              SELECT
                e.id,
                e.embedding_id,
                MAX(CASE WHEN m.key='wing' THEN m.string_value END) AS wing,
                MAX(CASE WHEN m.key='room' THEN m.string_value END) AS room,
                MAX(CASE WHEN m.key='source_file' THEN m.string_value END) AS source_file,
                MAX(CASE WHEN m.key='filed_at' THEN m.string_value END) AS filed_at,
                MAX(CASE WHEN m.key='chunk_index' THEN COALESCE(m.int_value, CAST(m.string_value AS INTEGER)) END) AS chunk_index,
                MAX(CASE WHEN m.key='chroma:document' THEN m.string_value END) AS document
              FROM embeddings e
              JOIN embedding_metadata m ON m.id=e.id
              GROUP BY e.id
            )
            SELECT * FROM meta WHERE embedding_id = ?
        """

        with connect_readonly(db_path) as conn:
            row = conn.execute(sql, [embedding_id]).fetchone()

        if not row:
            return jsonify({"error": "drawer not found"}), 404

        return jsonify(dict(row))

    return app


def connect_readonly(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def resolve_db_path(palace_path: str) -> Path:
    if not palace_path:
        raise_bad_request("Missing palace path. Set MEMORY_PALACE_PATH or pass ?palace=/path")

    candidate = Path(palace_path).expanduser()

    possible = []
    if candidate.is_file():
        possible.append(candidate)
    else:
        possible.extend(
            [
                candidate / "chroma.sqlite3",
                candidate / "data" / "palace" / "chroma.sqlite3",
                candidate / "palace" / "chroma.sqlite3",
            ]
        )

    for path in possible:
        if path.exists() and path.is_file():
            return path.resolve()

    raise_bad_request(
        "Could not find chroma.sqlite3. Try a palace root or sqlite file path directly."
    )


def raise_bad_request(message: str):
    raise BadRequest(description=message)


def parse_int_arg(name: str, default: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        raise_bad_request(f"Invalid integer for '{name}': {raw}")


if __name__ == "__main__":
    app = create_app()
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8099"))
    app.run(host=host, port=port, debug=False)
