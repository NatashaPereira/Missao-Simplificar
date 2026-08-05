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
from functools import wraps
from pathlib import Path

from flask import Flask, g, jsonify, redirect, request, send_from_directory, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "instance" / "database.db"
DATABASE_URL = os.environ.get("DATABASE_URL", "").strip()
USE_POSTGRES = bool(DATABASE_URL)

if USE_POSTGRES:
    import psycopg2
    import psycopg2.extras

app = Flask(__name__, static_folder="static", template_folder="templates")
# Em produção, defina a variável de ambiente SECRET_KEY com um valor
# aleatório e fixo (senão as sessões expiram a cada deploy).
app.secret_key = os.environ.get("SECRET_KEY", "troque-esta-chave-em-producao")

# Usuário cadastrado previamente (login inicial). A senha já fica
# guardada como hash no banco, nunca em texto puro.
SEED_USER_EMAIL = "e.jappe@royalcargo.com.br"
SEED_USER_PASSWORD = "1234"
SEED_USER_NAME = "E. Jappe"

# Colunas adicionadas depois da criação inicial da tabela `users`
# (ficam aqui para que bancos já existentes sejam migrados via ALTER TABLE).
USER_EXTRA_COLUMNS = [
    ("name", "TEXT DEFAULT ''"),
    ("department", "TEXT DEFAULT ''"),
    ("role", "TEXT DEFAULT ''"),
    ("profile", "TEXT DEFAULT 'auditor'"),
    ("status", "TEXT DEFAULT 'active'"),
    ("photo", "TEXT DEFAULT ''"),
    ("last_access", "TEXT"),
]


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
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT DEFAULT '',
                department TEXT DEFAULT '',
                role TEXT DEFAULT '',
                profile TEXT DEFAULT 'auditor',
                status TEXT DEFAULT 'active',
                photo TEXT DEFAULT '',
                last_access TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cur.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_log (
                id SERIAL PRIMARY KEY,
                action TEXT NOT NULL,
                record_type TEXT NOT NULL,
                record_id TEXT,
                description TEXT NOT NULL,
                snapshot TEXT,
                user_email TEXT,
                user_name TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
        for col, ddl in USER_EXTRA_COLUMNS:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
                conn.commit()
            except Exception:
                conn.rollback()
        cur.execute("SELECT id FROM users WHERE email = %s", (SEED_USER_EMAIL,))
        if cur.fetchone() is None:
            cur.execute(
                "INSERT INTO users (email, password_hash, name, profile, status) VALUES (%s, %s, %s, %s, %s)",
                (SEED_USER_EMAIL, generate_password_hash(SEED_USER_PASSWORD), SEED_USER_NAME, "admin", "active"),
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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT DEFAULT '',
                department TEXT DEFAULT '',
                role TEXT DEFAULT '',
                profile TEXT DEFAULT 'auditor',
                status TEXT DEFAULT 'active',
                photo TEXT DEFAULT '',
                last_access TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                record_type TEXT NOT NULL,
                record_id TEXT,
                description TEXT NOT NULL,
                snapshot TEXT,
                user_email TEXT,
                user_name TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        conn.commit()
        for col, ddl in USER_EXTRA_COLUMNS:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
                conn.commit()
            except Exception:
                pass
        existing = conn.execute(
            "SELECT id FROM users WHERE email = ?", (SEED_USER_EMAIL,)
        ).fetchone()
        if existing is None:
            conn.execute(
                "INSERT INTO users (email, password_hash, name, profile, status) VALUES (?, ?, ?, ?, ?)",
                (SEED_USER_EMAIL, generate_password_hash(SEED_USER_PASSWORD), SEED_USER_NAME, "admin", "active"),
            )
            conn.commit()
        else:
            # garante que o usuário semente sempre tenha perfil administrador
            conn.execute(
                "UPDATE users SET profile = 'admin', status = 'active', "
                "name = CASE WHEN name = '' OR name IS NULL THEN ? ELSE name END WHERE email = ?",
                (SEED_USER_NAME, SEED_USER_EMAIL),
            )
            conn.commit()
        conn.close()


def find_user_by_email(email):
    db = get_db()
    p = _placeholder()
    row = _fetch_one(
        db,
        f"SELECT id, email, password_hash, name, department, role, profile, status, photo, last_access "
        f"FROM users WHERE email = {p}",
        (email,),
    )
    if row is None:
        return None
    return _user_row_to_dict(row)


def _user_row_to_dict(row):
    if USE_POSTGRES:
        keys = ["id", "email", "password_hash", "name", "department", "role", "profile", "status", "photo", "last_access"]
        return {k: row[i] for i, k in enumerate(keys)}
    return {k: row[k] for k in row.keys()}


def user_public_dict(user):
    """Remove o hash de senha antes de mandar para o front-end."""
    d = dict(user)
    d.pop("password_hash", None)
    d["id"] = str(d["id"])
    last_access = d.get("last_access")
    d["last_access"] = str(last_access) if last_access else None
    return d


def login_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            if request.path.startswith("/api/"):
                return jsonify({"isError": True, "message": "Não autenticado."}), 401
            return redirect(url_for("login", next=request.path))
        return view_func(*args, **kwargs)

    return wrapped


def admin_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"isError": True, "message": "Não autenticado."}), 401
        if session.get("user_profile") != "admin":
            return jsonify({"isError": True, "message": "Apenas administradores podem acessar isso."}), 403
        return view_func(*args, **kwargs)

    return wrapped


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


def log_activity(action, record_type, record_id, description, snapshot=None):
    """Registra uma ação no log de alterações (ex: exclusão de uma
    verificação), com quem fez e quando."""
    db = get_db()
    p = _placeholder()
    snapshot_text = json.dumps(snapshot, ensure_ascii=False) if snapshot is not None else None
    _execute(
        db,
        f"INSERT INTO activity_log (action, record_type, record_id, description, snapshot, user_email, user_name) "
        f"VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p})",
        (action, record_type, str(record_id), description, snapshot_text,
         session.get("user_email"), session.get("user_name")),
    )


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
@login_required
def list_records():
    db = get_db()
    rows = _fetch_all(db, "SELECT id, type, payload FROM records ORDER BY id ASC")
    return jsonify([row_to_record(r) for r in rows])


@app.route("/api/records", methods=["POST"])
@login_required
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
@login_required
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
@login_required
def delete_record(record_id):
    db = get_db()
    p = _placeholder()
    _execute(db, f"DELETE FROM records WHERE id = {p}", (record_id,))
    return jsonify({"isOk": True, "deletedId": str(record_id)})


@app.route("/api/audits/<int:record_id>", methods=["DELETE"])
@admin_required
def delete_audit(record_id):
    """Exclui uma verificação já realizada. Só administradores podem fazer
    isso, e a ação fica registrada no log de alterações (com um retrato dos
    principais dados da verificação, para consulta posterior)."""
    db = get_db()
    p = _placeholder()
    existing = _fetch_one(db, f"SELECT id, type, payload FROM records WHERE id = {p}", (record_id,))
    if existing is None:
        return jsonify({"isError": True, "message": "Verificação não encontrada."}), 404

    record = row_to_record(existing)
    if record.get("type") != "audit":
        return jsonify({"isError": True, "message": "Este registro não é uma verificação."}), 400

    snapshot = {
        "audit_number": record.get("audit_number"),
        "department": record.get("department"),
        "audit_type": record.get("audit_type"),
        "audit_date": record.get("audit_date"),
        "auditor": record.get("auditor"),
        "overall_average": record.get("overall_average"),
        "classification": record.get("classification"),
    }
    description = (
        f"Verificação #{record.get('audit_number', '—')} "
        f"({record.get('department', '—')} · {record.get('audit_date', '—')}) excluída"
    )
    log_activity("delete", "audit", record_id, description, snapshot)

    _execute(db, f"DELETE FROM records WHERE id = {p}", (record_id,))
    return jsonify({"isOk": True, "deletedId": str(record_id)})


@app.route("/api/activity-log", methods=["GET"])
@admin_required
def get_activity_log():
    db = get_db()
    rows = _fetch_all(
        db,
        "SELECT id, action, record_type, record_id, description, snapshot, user_email, user_name, created_at "
        "FROM activity_log ORDER BY id DESC LIMIT 300",
    )
    result = []
    for row in rows:
        if USE_POSTGRES:
            keys = ["id", "action", "record_type", "record_id", "description", "snapshot", "user_email", "user_name", "created_at"]
            d = {k: row[i] for i, k in enumerate(keys)}
        else:
            d = {k: row[k] for k in row.keys()}
        d["id"] = str(d["id"])
        d["created_at"] = str(d["created_at"]) if d.get("created_at") else None
        try:
            d["snapshot"] = json.loads(d["snapshot"]) if d.get("snapshot") else None
        except Exception:
            d["snapshot"] = None
        result.append(d)
    return jsonify(result)


# ---------------------------------------------------------------------------
# Autenticação
# ---------------------------------------------------------------------------

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        if session.get("user_id"):
            return redirect(url_for("index"))
        return send_from_directory(app.template_folder, "login.html")

    body = request.get_json(silent=True) or request.form
    email = (body.get("email") or "").strip().lower()
    password = body.get("password") or ""

    user = find_user_by_email(email)
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"isError": True, "message": "E-mail ou senha inválidos."}), 401
    if (user.get("status") or "active") == "inactive":
        return jsonify({"isError": True, "message": "Este usuário está inativo. Fale com um administrador."}), 403

    session.clear()
    session["user_id"] = user["id"]
    session["user_email"] = user["email"]
    session["user_name"] = user.get("name") or user["email"]
    session["user_profile"] = user.get("profile") or "auditor"

    db = get_db()
    p = _placeholder()
    now = "CURRENT_TIMESTAMP"
    _execute(db, f"UPDATE users SET last_access = {now} WHERE id = {p}", (user["id"],))

    return jsonify({"isOk": True, "redirect": url_for("index")})


@app.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.route("/api/me", methods=["GET"])
@login_required
def me():
    user = find_user_by_email(session.get("user_email"))
    return jsonify({
        "email": session.get("user_email"),
        "name": session.get("user_name"),
        "profile": session.get("user_profile"),
        "isAdmin": session.get("user_profile") == "admin",
        "department": (user or {}).get("department") or "",
        "photo": (user or {}).get("photo") or "",
    })


# ---------------------------------------------------------------------------
# Gestão de usuários (apenas administradores)
# ---------------------------------------------------------------------------

USER_LIST_COLUMNS = "id, email, name, department, role, profile, status, photo, last_access"


@app.route("/api/users/names", methods=["GET"])
@login_required
def list_user_names():
    """Lista simplificada (id, nome, departamento) para preencher seletores,
    como o campo 'Responsável pela Verificação'. Disponível para qualquer
    usuário logado — diferente de /api/users, que é só para administradores."""
    db = get_db()
    rows = _fetch_all(
        db,
        "SELECT id, name, department FROM users WHERE status = 'active' ORDER BY name ASC",
    )
    result = []
    for row in rows:
        if USE_POSTGRES:
            d = {"id": row[0], "name": row[1], "department": row[2]}
        else:
            d = {"id": row["id"], "name": row["name"], "department": row["department"]}
        if d["name"]:
            result.append({"id": str(d["id"]), "name": d["name"], "department": d.get("department") or ""})
    return jsonify(result)


@app.route("/api/users", methods=["GET"])
@admin_required
def list_users():
    db = get_db()
    rows = _fetch_all(db, f"SELECT {USER_LIST_COLUMNS} FROM users ORDER BY name ASC, email ASC")
    users = []
    for row in rows:
        if USE_POSTGRES:
            keys = USER_LIST_COLUMNS.split(", ")
            d = {k: row[i] for i, k in enumerate(keys)}
        else:
            d = {k: row[k] for k in row.keys()}
        users.append(user_public_dict(d))
    return jsonify(users)


@app.route("/api/users", methods=["POST"])
@admin_required
def create_user():
    body = request.get_json(force=True) or {}
    email = (body.get("email") or "").strip().lower()
    name = (body.get("name") or "").strip()
    password = body.get("password") or ""
    department = (body.get("department") or "").strip()
    role = (body.get("role") or "").strip()
    profile = body.get("profile") or "auditor"
    status = body.get("status") or "active"
    photo = body.get("photo") or ""

    if not email or not name or not password:
        return jsonify({"isError": True, "message": "Nome, e-mail e senha temporária são obrigatórios."}), 400
    if profile not in ("admin", "auditor"):
        return jsonify({"isError": True, "message": "Perfil inválido."}), 400
    if find_user_by_email(email) is not None:
        return jsonify({"isError": True, "message": "Já existe um usuário com esse e-mail."}), 400

    db = get_db()
    p = _placeholder()
    _execute(
        db,
        f"INSERT INTO users (email, password_hash, name, department, role, profile, status, photo) "
        f"VALUES ({p}, {p}, {p}, {p}, {p}, {p}, {p}, {p})",
        (email, generate_password_hash(password), name, department, role, profile, status, photo),
    )
    user = find_user_by_email(email)
    return jsonify(user_public_dict(user))


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    body = request.get_json(force=True) or {}
    db = get_db()
    p = _placeholder()
    existing = _fetch_one(db, f"SELECT id FROM users WHERE id = {p}", (user_id,))
    if existing is None:
        return jsonify({"isError": True, "message": "Usuário não encontrado."}), 404

    name = (body.get("name") or "").strip()
    department = (body.get("department") or "").strip()
    role = (body.get("role") or "").strip()
    profile = body.get("profile") or "auditor"
    status = body.get("status") or "active"
    photo = body.get("photo", None)

    if profile not in ("admin", "auditor"):
        return jsonify({"isError": True, "message": "Perfil inválido."}), 400

    if photo is None:
        _execute(
            db,
            f"UPDATE users SET name = {p}, department = {p}, role = {p}, profile = {p}, status = {p} WHERE id = {p}",
            (name, department, role, profile, status, user_id),
        )
    else:
        _execute(
            db,
            f"UPDATE users SET name = {p}, department = {p}, role = {p}, profile = {p}, status = {p}, photo = {p} WHERE id = {p}",
            (name, department, role, profile, status, photo, user_id),
        )
    row = _fetch_one(db, f"SELECT {USER_LIST_COLUMNS} FROM users WHERE id = {p}", (user_id,))
    if USE_POSTGRES:
        keys = USER_LIST_COLUMNS.split(", ")
        d = {k: row[i] for i, k in enumerate(keys)}
    else:
        d = {k: row[k] for k in row.keys()}

    # Se o próprio admin logado mudou o próprio perfil, atualiza a sessão também.
    if session.get("user_id") == user_id:
        session["user_profile"] = profile
        session["user_name"] = name or session.get("user_name")

    return jsonify(user_public_dict(d))


@app.route("/api/users/<int:user_id>/reset-password", methods=["POST"])
@admin_required
def reset_user_password(user_id):
    body = request.get_json(force=True) or {}
    password = body.get("password") or ""
    if len(password) < 4:
        return jsonify({"isError": True, "message": "A senha temporária deve ter ao menos 4 caracteres."}), 400
    db = get_db()
    p = _placeholder()
    existing = _fetch_one(db, f"SELECT id FROM users WHERE id = {p}", (user_id,))
    if existing is None:
        return jsonify({"isError": True, "message": "Usuário não encontrado."}), 404
    _execute(db, f"UPDATE users SET password_hash = {p} WHERE id = {p}", (generate_password_hash(password), user_id))
    return jsonify({"isOk": True})


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    db = get_db()
    p = _placeholder()
    existing = _fetch_one(db, f"SELECT id, profile FROM users WHERE id = {p}", (user_id,))
    if existing is None:
        return jsonify({"isError": True, "message": "Usuário não encontrado."}), 404
    if session.get("user_id") == user_id:
        return jsonify({"isError": True, "message": "Você não pode excluir o próprio usuário."}), 400

    existing_profile = existing[1] if USE_POSTGRES else existing["profile"]
    if existing_profile == "admin":
        admins = _fetch_all(db, f"SELECT id FROM users WHERE profile = {p} AND status = {p}", ("admin", "active"))
        if len(admins) <= 1:
            return jsonify({"isError": True, "message": "Não é possível excluir o último administrador ativo."}), 400

    _execute(db, f"DELETE FROM users WHERE id = {p}", (user_id,))
    return jsonify({"isOk": True, "deletedId": str(user_id)})


# ---------------------------------------------------------------------------
# Página pública (sem login) — Ranking, Coleção de Selos e Manual do Jogo
# ---------------------------------------------------------------------------

# Chaves de configuração seguras para expor publicamente. Qualquer outra
# config (ex: nomes internos futuros) fica de fora por padrão.
PUBLIC_CONFIG_KEYS = {"otimo", "bom", "regular", "manual_html"}


def _sanitize_public_audit(record):
    """Remove observações e fotos de evidência antes de expor uma auditoria
    no endpoint público — mantém só o necessário para calcular ranking e
    selos (respostas por critério, sem texto livre nem imagens)."""
    clean = dict(record)
    responses = {}
    try:
        raw = json.loads(clean.get("responses_json") or "{}")
        for key, r in raw.items():
            responses[key] = {"entity_id": r.get("entity_id"), "response": r.get("response")}
    except Exception:
        pass
    clean["responses_json"] = json.dumps(responses, ensure_ascii=False)
    clean.pop("auditor", None)
    clean.pop("companion", None)
    return clean


@app.route("/api/public/records", methods=["GET"])
def public_records():
    db = get_db()
    rows = _fetch_all(db, "SELECT id, type, payload FROM records ORDER BY id ASC")
    result = []
    for row in rows:
        record = row_to_record(row)
        rtype = record.get("type")
        if rtype == "department":
            result.append(record)
        elif rtype == "criterion":
            result.append(record)
        elif rtype == "audit":
            result.append(_sanitize_public_audit(record))
        elif rtype == "config" and record.get("config_key") in PUBLIC_CONFIG_KEYS:
            result.append(record)
    return jsonify(result)


@app.route("/publico")
def public_page():
    return send_from_directory(app.template_folder, "public.html")


# ---------------------------------------------------------------------------
# Página principal
# ---------------------------------------------------------------------------

@app.route("/")
@login_required
def index():
    return send_from_directory(app.template_folder, "index.html")


init_db()

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
