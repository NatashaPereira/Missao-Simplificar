"""
Missão Simplificar - Auditorias 5S
Backend Flask com banco de dados real.

Substitui o `window.dataSdk` do Canva Code por uma API REST simples.
Cada "registro" (departamento, critério, auditoria, configuração) é
guardado como uma linha na tabela `records`, com os campos específicos
de cada tipo salvos em uma coluna JSON (`payload`). Isso espelha
exatamente a estrutura flexível que o app já usava no Canva, então o
JavaScript do front-end quase não precisa mudar.

Banco de dados:
- Se a variável de ambiente DATABASE_URL estiver definida (ex: ao
  hospedar com um banco Postgres gratuito no Supabase), o app usa
  Postgres — recomendado para produção/web, pois os dados não se
  perdem quando o serviço de hospedagem reinicia ou publica uma nova
  versão.
- Caso contrário, usa SQLite local (instance/database.db) —
  recomendado só para rodar na sua própria máquina.
"""

import json
import os
import sqlite3
from pathlib import Path

from flask import Flask, g, jsonify, request, send_from_directory

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "instance" / "database.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = bool(DATABASE_URL)

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras

app = Flask(__name__, static_folder="static", template_folder="templates")


# ---------------------------------------------------------------------------
# Banco de dados
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        if USE_POSTGRES:
            g.db = psycopg2.connect(DATABASE_URL)
        else:
            g.db = sqlite3.connect(DB_PATH)
            g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
        cur.close()
        conn.close()
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
        conn.close()


def row_to_record(row):
    """Converte uma linha do banco no formato que o front-end espera:
    todos os campos do payload + __backendId (equivalente ao antigo
    __backendId do dataSdk do Canva)."""
    if USE_POSTGRES:
        record_id, record_type, payload_text = row[0], row[1], row[2]
    else:
        record_id, record_type, payload_text = row["id"], row["type"], row["payload"]
    data = json.loads(payload_text)
    data["__backendId"] = str(record_id)
    data["type"] = record_type
    return data


# ---------------------------------------------------------------------------
# Rotas da API (equivalentes ao antigo window.dataSdk)
# ---------------------------------------------------------------------------

def _placeholder():
    return "%s" if USE_POSTGRES else "?"


def _fetch_one(db, query, params):
    if USE_POSTGRES:
        cur = db.cursor()
        cur.execute(query, params)
        row = cur.fetchone()
        cur.close()
        return row
    return db.execute(query, params).fetchone()


def _fetch_all(db, query, params=()):
    if USE_POSTGRES:
        cur = db.cursor()
        cur.execute(query, params)
        rows = cur.fetchall()
        cur.close()
        return rows
    return db.execute(query, params).fetchall()


def _execute(db, query, params):
    if USE_POSTGRES:
        cur = db.cursor()
        cur.execute(query, params)
        db.commit()
        last_id = cur.fetchone()[0] if cur.description else None
        cur.close()
        return last_id
    cur = db.execute(query, params)
    db.commit()
    return cur.lastrowid


@app.route("/api/records", methods=["GET"])
def list_records():
    db = get_db()
    rows = _fetch_all(db, "SELECT id, type, payload FROM records ORDER BY id ASC")
    return jsonify([row_to_record(r) for r in rows])


@app.route("/api/records", methods=["POST"])
def create_record():
    body = request.get_json(force=True) or {}
    record_type = body.get("type")
    if not record_type:
        return jsonify({"isError": True, "message": "Campo 'type' é obrigatório."}), 400

    payload = dict(body)
    payload.pop("__backendId", None)  # nunca aceitamos um backendId vindo do cliente na criação

    db = get_db()
    p = _placeholder()
    payload_text = json.dumps(payload, ensure_ascii=False)
    if USE_POSTGRES:
        new_id = _execute(
            db,
            f"INSERT INTO records (type, payload) VALUES ({p}, {p}) RETURNING id",
            (record_type, payload_text),
        )
    else:
        new_id = _execute(
            db, f"INSERT INTO records (type, payload) VALUES ({p}, {p})", (record_type, payload_text)
        )
    row = _fetch_one(db, f"SELECT id, type, payload FROM records WHERE id = {p}", (new_id,))
    return jsonify(row_to_record(row))


@app.route("/api/records/<int:record_id>", methods=["PUT"])
def update_record(record_id):
    body = request.get_json(force=True) or {}
    payload = dict(body)
    record_type = payload.pop("type", None)
    payload.pop("__backendId", None)

    db = get_db()
    p = _placeholder()
    existing = _fetch_one(db, f"SELECT id, type, payload FROM records WHERE id = {p}", (record_id,))
    if existing is None:
        return jsonify({"isError": True, "message": "Registro não encontrado."}), 404

    existing_type = existing[1] if USE_POSTGRES else existing["type"]
    final_type = record_type or existing_type
    payload_text = json.dumps(payload, ensure_ascii=False)
    _execute(
        db,
        f"UPDATE records SET type = {p}, payload = {p} WHERE id = {p}",
        (final_type, payload_text, record_id),
    )
    row = _fetch_one(db, f"SELECT id, type, payload FROM records WHERE id = {p}", (record_id,))
    return jsonify(row_to_record(row))


@app.route("/api/records/<int:record_id>", methods=["DELETE"])
def delete_record(record_id):
    db = get_db()
    p = _placeholder()
    _execute(db, f"DELETE FROM records WHERE id = {p}", (record_id,))
    return jsonify({"isOk": True, "deletedId": str(record_id)})


# ---------------------------------------------------------------------------
# Página principal
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return send_from_directory(app.template_folder, "index.html")


init_db()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
