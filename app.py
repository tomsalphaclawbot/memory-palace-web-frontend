#!/usr/bin/env python3
import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import BadRequest

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG_PATH = BASE_DIR / "config" / "palace.json"


def create_app() -> Flask:
    app = Flask(__name__)
    asset_version = os.getenv("ASSET_VERSION", "2026-04-07-ui-refresh-5")
    palace_root = load_palace_path_from_config()
    db_path = resolve_db_path(palace_root)

    @app.get("/")
    def index():
        return render_template("index.html", asset_version=asset_version)

    @app.get("/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.errorhandler(BadRequest)
    def handle_bad_request(err):
        if request.path.startswith("/api/"):
            return jsonify({"error": err.description}), 400
        return err

    @app.get("/api/summary")
    def summary():
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
                "totalDrawers": rows["total_drawers"],
                "wings": rows["wings"],
                "rooms": rows["rooms"],
            }
        )

    @app.get("/api/wings")
    def wings():
        limit = min(max(parse_int_arg("limit", 25), 1), 200)
        offset = max(parse_int_arg("offset", 0), 0)

        with connect_readonly(db_path) as conn:
            total = conn.execute(
                """
                SELECT COUNT(DISTINCT string_value) AS total
                FROM embedding_metadata
                WHERE key='wing'
                """
            ).fetchone()["total"]

            rows = conn.execute(
                """
                SELECT string_value AS wing, COUNT(*) AS drawer_count
                FROM embedding_metadata
                WHERE key='wing'
                GROUP BY string_value
                ORDER BY drawer_count DESC, wing ASC
                LIMIT ? OFFSET ?
                """,
                [limit, offset],
            ).fetchall()

        return jsonify(
            {
                "total": total,
                "limit": limit,
                "offset": offset,
                "items": [dict(r) for r in rows],
            }
        )

    @app.get("/api/rooms")
    def rooms():
        wing = (request.args.get("wing") or "").strip()
        limit = min(max(parse_int_arg("limit", 25), 1), 200)
        offset = max(parse_int_arg("offset", 0), 0)

        base_cte = """
            WITH meta AS (
              SELECT
                e.id,
                MAX(CASE WHEN m.key='wing' THEN m.string_value END) AS wing,
                MAX(CASE WHEN m.key='room' THEN m.string_value END) AS room
              FROM embeddings e
              JOIN embedding_metadata m ON m.id=e.id
              GROUP BY e.id
            )
        """

        where_clause = ""
        params: list[Any] = []
        if wing:
            where_clause = "WHERE wing = ?"
            params.append(wing)

        sql_count = (
            base_cte
            + f"""
            SELECT COUNT(*) AS total
            FROM (
              SELECT room
              FROM meta
              {where_clause}
              GROUP BY room
            ) grouped
            """
        )

        sql_rows = (
            base_cte
            + f"""
            SELECT room, COUNT(*) AS drawer_count
            FROM meta
            {where_clause}
            GROUP BY room
            ORDER BY drawer_count DESC, room ASC
            LIMIT ? OFFSET ?
            """
        )

        with connect_readonly(db_path) as conn:
            total = conn.execute(sql_count, params).fetchone()["total"]
            rows = conn.execute(sql_rows, [*params, limit, offset]).fetchall()

        return jsonify(
            {
                "total": total,
                "limit": limit,
                "offset": offset,
                "items": [dict(r) for r in rows],
            }
        )

    @app.get("/api/drawers")
    def drawers():
        wing = (request.args.get("wing") or "").strip()
        room = (request.args.get("room") or "").strip()
        query = (request.args.get("q") or "").strip()
        limit = min(max(parse_int_arg("limit", 24), 1), 200)
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

    @app.get("/api/graph")
    def graph_data():
        max_edges = min(max(parse_int_arg("max_edges", 400), 10), 2000)

        with connect_readonly(db_path) as conn:
            rows = conn.execute(
                """
                WITH meta AS (
                  SELECT
                    e.id,
                    MAX(CASE WHEN m.key='wing' THEN m.string_value END) AS wing,
                    MAX(CASE WHEN m.key='room' THEN m.string_value END) AS room
                  FROM embeddings e
                  JOIN embedding_metadata m ON m.id=e.id
                  GROUP BY e.id
                )
                SELECT wing, room, COUNT(*) AS drawer_count
                FROM meta
                WHERE wing IS NOT NULL AND wing != ''
                  AND room IS NOT NULL AND room != ''
                GROUP BY wing, room
                ORDER BY drawer_count DESC, wing ASC, room ASC
                LIMIT ?
                """,
                [max_edges],
            ).fetchall()

        wing_totals: dict[str, int] = {}
        room_totals: dict[str, int] = {}
        edges: list[dict[str, Any]] = []

        for row in rows:
            wing = row["wing"]
            room = row["room"]
            weight = int(row["drawer_count"])
            wing_totals[wing] = wing_totals.get(wing, 0) + weight
            room_totals[room] = room_totals.get(room, 0) + weight
            edges.append(
                {
                    "source": f"wing::{wing}",
                    "target": f"room::{room}",
                    "weight": weight,
                    "wing": wing,
                    "room": room,
                }
            )

        nodes: list[dict[str, Any]] = []
        for wing, total in sorted(wing_totals.items(), key=lambda kv: (-kv[1], kv[0])):
            nodes.append(
                {
                    "id": f"wing::{wing}",
                    "type": "wing",
                    "label": wing,
                    "count": total,
                }
            )

        for room, total in sorted(room_totals.items(), key=lambda kv: (-kv[1], kv[0])):
            nodes.append(
                {
                    "id": f"room::{room}",
                    "type": "room",
                    "label": room,
                    "count": total,
                }
            )

        return jsonify({"nodes": nodes, "edges": edges})

    @app.get("/api/graph_drawers")
    def graph_drawers():
        room = (request.args.get("room") or "").strip()
        if not room:
            raise_bad_request("room is required")

        limit = min(max(parse_int_arg("limit", 40), 1), 200)

        with connect_readonly(db_path) as conn:
            rows = conn.execute(
                """
                WITH meta AS (
                  SELECT
                    e.id,
                    e.embedding_id,
                    MAX(CASE WHEN m.key='room' THEN m.string_value END) AS room,
                    MAX(CASE WHEN m.key='source_file' THEN m.string_value END) AS source_file,
                    MAX(CASE WHEN m.key='chunk_index' THEN COALESCE(m.int_value, CAST(m.string_value AS INTEGER)) END) AS chunk_index
                  FROM embeddings e
                  JOIN embedding_metadata m ON m.id=e.id
                  GROUP BY e.id
                )
                SELECT embedding_id, room, source_file, chunk_index
                FROM meta
                WHERE room = ?
                ORDER BY chunk_index ASC, embedding_id ASC
                LIMIT ?
                """,
                [room, limit],
            ).fetchall()

        drawers = []
        for row in rows:
            source_file = row["source_file"] or ""
            source_label = Path(source_file).name if source_file else "drawer"
            chunk_index = row["chunk_index"]
            chunk_label = f"#{chunk_index}" if chunk_index is not None else ""
            drawers.append(
                {
                    "embedding_id": row["embedding_id"],
                    "room": row["room"],
                    "source_file": source_file,
                    "chunk_index": chunk_index,
                    "label": f"{source_label}{chunk_label}",
                }
            )

        return jsonify({"room": room, "drawers": drawers, "count": len(drawers)})

    return app


def connect_readonly(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def load_palace_path_from_config() -> str:
    config_path = Path(os.getenv("APP_CONFIG_FILE", str(DEFAULT_CONFIG_PATH))).expanduser()

    if not config_path.exists() or not config_path.is_file():
        raise RuntimeError(f"Config file not found: {config_path}")

    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as err:
        raise RuntimeError(f"Invalid JSON in config file: {config_path}: {err}") from err

    palace_path = str(config.get("palace_path", "")).strip()
    if not palace_path:
        raise RuntimeError(f"Missing 'palace_path' in config file: {config_path}")

    return palace_path


def resolve_db_path(palace_path: str) -> Path:
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

    raise RuntimeError(
        f"Could not find chroma.sqlite3 from configured palace_path: {palace_path}. "
        "Set a valid palace path in config/palace.json or APP_CONFIG_FILE."
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
