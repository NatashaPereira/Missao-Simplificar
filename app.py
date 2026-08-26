"""
Missão Simplificar - Auditorias 5S (multiempresa)

Arquitetura:
- Uma única aplicação Flask/Render.
- Um único banco PostgreSQL (Supabase) ou SQLite local.
- Dados segregados por company_id.
- Superadministradores podem alternar entre todas as empresas.
- Auditores enxergam somente a própria empresa.
- Cada empresa possui um link público próprio para Ranking/Selos/Manual.
- Fotos de evidência são removidas automaticamente após 6 meses.
"""

import json
import os
import sqlite3
from datetime import date, datetime
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

app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = os.environ.get("SECRET_KEY", "troque-esta-chave-em-producao")

COMPANY_SEEDS = [
    ("royal-cargo", "Royal Cargo do Brasil"),
    ("amtrans", "AMTrans"),
    ("rentalog", "Rentalog"),
    ("next", "Next"),
    ("dc-logistics", "DC Logistics Brasil"),
]
SUPER_ADMINS = {
    "e.jappe@royalcargo.com.br": "E. Jappe",
    "n.pereira@royalcargo.com.br": "N. Pereira",
    "r.mafra@royalcargo.com.br": "R. Mafra",
}
SEED_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "1234")
MAX_AUDITORS_PER_COMPANY = 5
PHOTO_RETENTION_MONTHS = 6

USER_EXTRA_COLUMNS = [
    ("name", "TEXT DEFAULT ''"),
    ("department", "TEXT DEFAULT ''"),
    ("role", "TEXT DEFAULT ''"),
    ("profile", "TEXT DEFAULT 'auditor'"),
    ("status", "TEXT DEFAULT 'active'"),
    ("photo", "TEXT DEFAULT ''"),
    ("last_access", "TEXT"),
    ("company_id", "INTEGER"),
]


def get_db():
    if "db" not in g:
        if USE_POSTGRES:
            g.db = psycopg2.connect(DATABASE_URL)
        else:
            DB_PATH.parent.mkdir(parents=True, exist_ok=True)
            g.db = sqlite3.connect(DB_PATH)
            g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def _placeholder():
    return "%s" if USE_POSTGRES else "?"


def _fetch_one(db, query, params=()):
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


def _execute(db, query, params=()):
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


def _row_value(row, idx, key):
    return row[idx] if USE_POSTGRES else row[key]


def init_db():
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS records (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                company_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
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
                company_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS activity_log (
                id SERIAL PRIMARY KEY,
                action TEXT NOT NULL,
                record_type TEXT NOT NULL,
                record_id TEXT,
                description TEXT NOT NULL,
                snapshot TEXT,
                user_email TEXT,
                user_name TEXT,
                company_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        for table, col, ddl in [
            ("records", "company_id", "INTEGER"),
            ("activity_log", "company_id", "INTEGER"),
        ]:
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
                conn.commit()
            except Exception:
                conn.rollback()
        for col, ddl in USER_EXTRA_COLUMNS:
            try:
                cur.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
                conn.commit()
            except Exception:
                conn.rollback()
        for slug, name in COMPANY_SEEDS:
            cur.execute("SELECT id FROM companies WHERE slug = %s", (slug,))
            if cur.fetchone() is None:
                cur.execute("INSERT INTO companies (slug, name, status) VALUES (%s,%s,'active')", (slug, name))
            else:
                cur.execute("UPDATE companies SET name=%s WHERE slug=%s", (name, slug))
            conn.commit()
        cur.execute("SELECT id FROM companies WHERE slug = %s", ("royal-cargo",))
        royal_id = cur.fetchone()[0]
        cur.execute("UPDATE records SET company_id = %s WHERE company_id IS NULL", (royal_id,))
        cur.execute("UPDATE activity_log SET company_id = %s WHERE company_id IS NULL", (royal_id,))
        conn.commit()
        for email, name in SUPER_ADMINS.items():
            cur.execute("SELECT id FROM users WHERE email = %s", (email,))
            row = cur.fetchone()
            if row is None:
                cur.execute(
                    "INSERT INTO users (email,password_hash,name,profile,status,company_id) VALUES (%s,%s,%s,'super_admin','active',NULL)",
                    (email, generate_password_hash(SEED_PASSWORD), name),
                )
            else:
                cur.execute(
                    "UPDATE users SET profile='super_admin', status='active', company_id=NULL, "
                    "name=CASE WHEN name='' OR name IS NULL THEN %s ELSE name END WHERE email=%s",
                    (name, email),
                )
            conn.commit()
        # Bancos antigos tinham e.jappe como admin. Qualquer usuário comum sem empresa é migrado para Royal Cargo.
        cur.execute("UPDATE users SET company_id=%s WHERE company_id IS NULL AND profile <> 'super_admin'", (royal_id,))
        conn.commit()
        # Replica apenas critérios/configurações-base da Royal para empresas novas.
        # Departamentos e auditorias permanecem exclusivos de cada empresa.
        cur.execute("SELECT id FROM companies WHERE id <> %s", (royal_id,))
        for (company_id,) in cur.fetchall():
            cur.execute("SELECT COUNT(*) FROM records WHERE company_id=%s AND type IN ('criterion','config')", (company_id,))
            if cur.fetchone()[0] == 0:
                cur.execute("SELECT type,payload FROM records WHERE company_id=%s AND type IN ('criterion','config') ORDER BY id", (royal_id,))
                templates = cur.fetchall()
                for rtype, payload in templates:
                    cur.execute("INSERT INTO records (type,payload,company_id) VALUES (%s,%s,%s)", (rtype,payload,company_id))
                conn.commit()
        cur.close()
        conn.close()
    else:
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("""
            CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                payload TEXT NOT NULL,
                company_id INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
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
                company_id INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                action TEXT NOT NULL,
                record_type TEXT NOT NULL,
                record_id TEXT,
                description TEXT NOT NULL,
                snapshot TEXT,
                user_email TEXT,
                user_name TEXT,
                company_id INTEGER,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
        for table, col, ddl in [("records", "company_id", "INTEGER"), ("activity_log", "company_id", "INTEGER")]:
            try:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
                conn.commit()
            except Exception:
                pass
        for col, ddl in USER_EXTRA_COLUMNS:
            try:
                conn.execute(f"ALTER TABLE users ADD COLUMN {col} {ddl}")
                conn.commit()
            except Exception:
                pass
        for slug, name in COMPANY_SEEDS:
            if conn.execute("SELECT id FROM companies WHERE slug=?", (slug,)).fetchone() is None:
                conn.execute("INSERT INTO companies (slug,name,status) VALUES (?,?,'active')", (slug, name))
            else:
                conn.execute("UPDATE companies SET name=? WHERE slug=?", (name, slug))
        conn.commit()
        royal_id = conn.execute("SELECT id FROM companies WHERE slug=?", ("royal-cargo",)).fetchone()["id"]
        conn.execute("UPDATE records SET company_id=? WHERE company_id IS NULL", (royal_id,))
        conn.execute("UPDATE activity_log SET company_id=? WHERE company_id IS NULL", (royal_id,))
        for email, name in SUPER_ADMINS.items():
            row = conn.execute("SELECT id FROM users WHERE email=?", (email,)).fetchone()
            if row is None:
                conn.execute(
                    "INSERT INTO users (email,password_hash,name,profile,status,company_id) VALUES (?,?,?,'super_admin','active',NULL)",
                    (email, generate_password_hash(SEED_PASSWORD), name),
                )
            else:
                conn.execute(
                    "UPDATE users SET profile='super_admin',status='active',company_id=NULL,"
                    "name=CASE WHEN name='' OR name IS NULL THEN ? ELSE name END WHERE email=?",
                    (name, email),
                )
        conn.execute("UPDATE users SET company_id=? WHERE company_id IS NULL AND profile <> 'super_admin'", (royal_id,))
        conn.commit()
        for row in conn.execute("SELECT id FROM companies WHERE id <> ?", (royal_id,)).fetchall():
            company_id=row["id"]
            count=conn.execute("SELECT COUNT(*) FROM records WHERE company_id=? AND type IN ('criterion','config')", (company_id,)).fetchone()[0]
            if count == 0:
                templates=conn.execute("SELECT type,payload FROM records WHERE company_id=? AND type IN ('criterion','config') ORDER BY id", (royal_id,)).fetchall()
                for template in templates:
                    conn.execute("INSERT INTO records (type,payload,company_id) VALUES (?,?,?)", (template["type"],template["payload"],company_id))
                conn.commit()
        conn.close()


def list_companies():
    db = get_db()
    rows = _fetch_all(db, "SELECT id, slug, name, status FROM companies WHERE status='active' ORDER BY name")
    return [
        {"id": int(_row_value(r, 0, "id")), "slug": _row_value(r, 1, "slug"), "name": _row_value(r, 2, "name"), "status": _row_value(r, 3, "status")}
        for r in rows
    ]


def get_company_by_id(company_id):
    if not company_id:
        return None
    db = get_db()
    p = _placeholder()
    row = _fetch_one(db, f"SELECT id, slug, name, status FROM companies WHERE id={p}", (company_id,))
    if row is None:
        return None
    return {"id": int(_row_value(row,0,"id")), "slug": _row_value(row,1,"slug"), "name": _row_value(row,2,"name"), "status": _row_value(row,3,"status")}


def get_company_by_slug(slug):
    db = get_db()
    p = _placeholder()
    row = _fetch_one(db, f"SELECT id, slug, name, status FROM companies WHERE slug={p} AND status='active'", (slug,))
    if row is None:
        return None
    return {"id": int(_row_value(row,0,"id")), "slug": _row_value(row,1,"slug"), "name": _row_value(row,2,"name"), "status": _row_value(row,3,"status")}


def find_user_by_email(email):
    db = get_db()
    p = _placeholder()
    row = _fetch_one(
        db,
        f"SELECT id,email,password_hash,name,department,role,profile,status,photo,last_access,company_id FROM users WHERE email={p}",
        (email,),
    )
    if row is None:
        return None
    keys = ["id","email","password_hash","name","department","role","profile","status","photo","last_access","company_id"]
    return {k: (_row_value(row,i,k)) for i,k in enumerate(keys)}


def user_public_dict(user):
    d = dict(user)
    d.pop("password_hash", None)
    d["id"] = str(d["id"])
    d["company_id"] = int(d["company_id"]) if d.get("company_id") is not None else None
    d["last_access"] = str(d["last_access"]) if d.get("last_access") else None
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
        if session.get("user_profile") not in ("admin", "super_admin"):
            return jsonify({"isError": True, "message": "Apenas administradores podem acessar isso."}), 403
        return view_func(*args, **kwargs)
    return wrapped


def super_admin_required(view_func):
    @wraps(view_func)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"isError": True, "message": "Não autenticado."}), 401
        if session.get("user_profile") != "super_admin":
            return jsonify({"isError": True, "message": "Apenas superadministradores podem acessar isso."}), 403
        return view_func(*args, **kwargs)
    return wrapped


def active_company_id():
    if session.get("user_profile") == "super_admin":
        cid = session.get("active_company_id")
        if cid:
            return int(cid)
        companies = list_companies()
        if companies:
            session["active_company_id"] = companies[0]["id"]
            return companies[0]["id"]
        return None
    cid = session.get("company_id")
    return int(cid) if cid else None


def row_to_record(row):
    record_id = _row_value(row,0,"id")
    record_type = _row_value(row,1,"type")
    payload_text = _row_value(row,2,"payload")
    data = json.loads(payload_text)
    data["__backendId"] = str(record_id)
    data["type"] = record_type
    return data


def log_activity(action, record_type, record_id, description, snapshot=None, company_id=None):
    db = get_db()
    p = _placeholder()
    _execute(
        db,
        f"INSERT INTO activity_log (action,record_type,record_id,description,snapshot,user_email,user_name,company_id) VALUES ({p},{p},{p},{p},{p},{p},{p},{p})",
        (action, record_type, str(record_id), description,
         json.dumps(snapshot,ensure_ascii=False) if snapshot is not None else None,
         session.get("user_email"), session.get("user_name"), company_id or active_company_id()),
    )


def _subtract_months(d, months):
    year = d.year
    month = d.month - months
    while month <= 0:
        month += 12
        year -= 1
    # dia 1 é suficiente: retenção é mensal e a limpeza é oportunística.
    return date(year, month, 1)


def cleanup_old_photos(company_id=None):
    """Remove somente as fotos de auditorias com mais de 6 meses, mantendo histórico/notas."""
    db = get_db()
    p = _placeholder()
    params = []
    query = "SELECT id,type,payload FROM records WHERE type='audit'"
    if company_id:
        query += f" AND company_id={p}"
        params.append(company_id)
    rows = _fetch_all(db, query, tuple(params))
    cutoff = _subtract_months(date.today(), PHOTO_RETENTION_MONTHS)
    changed = 0
    for row in rows:
        rid = _row_value(row,0,"id")
        payload_text = _row_value(row,2,"payload")
        try:
            payload = json.loads(payload_text)
            raw_date = (payload.get("audit_date") or "")[:10]
            audit_day = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except Exception:
            continue
        if audit_day >= cutoff:
            continue
        try:
            responses = json.loads(payload.get("responses_json") or "{}")
        except Exception:
            responses = {}
        had_photos = False
        for response in responses.values():
            if isinstance(response, dict) and response.get("photos"):
                response["photos"] = []
                had_photos = True
        if not had_photos:
            continue
        payload["responses_json"] = json.dumps(responses, ensure_ascii=False)
        payload["photo_count"] = 0
        payload["photos_expired"] = True
        payload["photos_expired_at"] = date.today().isoformat()
        _execute(db, f"UPDATE records SET payload={p} WHERE id={p}", (json.dumps(payload,ensure_ascii=False), rid))
        changed += 1
    return changed


@app.route("/api/records", methods=["GET"])
@login_required
def list_records():
    cid = active_company_id()
    if not cid:
        return jsonify([])
    cleanup_old_photos(cid)
    db = get_db()
    p = _placeholder()
    rows = _fetch_all(db, f"SELECT id,type,payload FROM records WHERE company_id={p} ORDER BY id ASC", (cid,))
    return jsonify([row_to_record(r) for r in rows])


@app.route("/api/records", methods=["POST"])
@login_required
def create_record():
    body = request.get_json(force=True) or {}
    record_type = body.get("type")
    if not record_type:
        return jsonify({"isError": True, "message": "Campo 'type' é obrigatório."}), 400
    cid = active_company_id()
    if not cid:
        return jsonify({"isError": True, "message": "Empresa não selecionada."}), 400
    payload = dict(body)
    payload.pop("__backendId", None)
    db = get_db(); p = _placeholder(); payload_text = json.dumps(payload, ensure_ascii=False)
    if USE_POSTGRES:
        new_id = _execute(db, f"INSERT INTO records (type,payload,company_id) VALUES ({p},{p},{p}) RETURNING id", (record_type,payload_text,cid))
    else:
        new_id = _execute(db, f"INSERT INTO records (type,payload,company_id) VALUES ({p},{p},{p})", (record_type,payload_text,cid))
    row = _fetch_one(db, f"SELECT id,type,payload FROM records WHERE id={p} AND company_id={p}", (new_id,cid))
    return jsonify(row_to_record(row))


@app.route("/api/records/<int:record_id>", methods=["PUT"])
@login_required
def update_record(record_id):
    cid = active_company_id(); db = get_db(); p = _placeholder()
    existing = _fetch_one(db, f"SELECT id,type,payload FROM records WHERE id={p} AND company_id={p}", (record_id,cid))
    if existing is None:
        return jsonify({"isError": True, "message": "Registro não encontrado nesta empresa."}), 404
    body = request.get_json(force=True) or {}; payload = dict(body)
    record_type = payload.pop("type", None); payload.pop("__backendId", None)
    final_type = record_type or _row_value(existing,1,"type")
    _execute(db, f"UPDATE records SET type={p},payload={p} WHERE id={p} AND company_id={p}", (final_type,json.dumps(payload,ensure_ascii=False),record_id,cid))
    row = _fetch_one(db, f"SELECT id,type,payload FROM records WHERE id={p} AND company_id={p}", (record_id,cid))
    return jsonify(row_to_record(row))


@app.route("/api/records/<int:record_id>", methods=["DELETE"])
@login_required
def delete_record(record_id):
    cid = active_company_id(); db = get_db(); p = _placeholder()
    _execute(db, f"DELETE FROM records WHERE id={p} AND company_id={p}", (record_id,cid))
    return jsonify({"isOk": True, "deletedId": str(record_id)})


@app.route("/api/audits/<int:record_id>", methods=["DELETE"])
@admin_required
def delete_audit(record_id):
    cid = active_company_id(); db = get_db(); p = _placeholder()
    existing = _fetch_one(db, f"SELECT id,type,payload FROM records WHERE id={p} AND company_id={p}", (record_id,cid))
    if existing is None:
        return jsonify({"isError": True, "message": "Verificação não encontrada."}), 404
    record = row_to_record(existing)
    if record.get("type") != "audit":
        return jsonify({"isError": True, "message": "Este registro não é uma verificação."}), 400
    snapshot = {k: record.get(k) for k in ("audit_number","department","audit_type","audit_date","auditor","overall_average","classification")}
    description = f"Verificação #{record.get('audit_number','—')} ({record.get('department','—')} · {record.get('audit_date','—')}) excluída"
    log_activity("delete","audit",record_id,description,snapshot,cid)
    _execute(db, f"DELETE FROM records WHERE id={p} AND company_id={p}", (record_id,cid))
    return jsonify({"isOk": True, "deletedId": str(record_id)})


@app.route("/api/activity-log", methods=["GET"])
@admin_required
def get_activity_log():
    cid = active_company_id(); db = get_db(); p = _placeholder()
    rows = _fetch_all(db,
        f"SELECT id,action,record_type,record_id,description,snapshot,user_email,user_name,created_at FROM activity_log WHERE company_id={p} ORDER BY id DESC LIMIT 300",
        (cid,))
    keys=["id","action","record_type","record_id","description","snapshot","user_email","user_name","created_at"]
    result=[]
    for row in rows:
        d={k:_row_value(row,i,k) for i,k in enumerate(keys)}; d["id"]=str(d["id"]); d["created_at"]=str(d["created_at"]) if d.get("created_at") else None
        try:d["snapshot"]=json.loads(d["snapshot"]) if d.get("snapshot") else None
        except Exception:d["snapshot"]=None
        result.append(d)
    return jsonify(result)


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        if session.get("user_id"):
            return redirect(url_for("index"))
        return send_from_directory(app.template_folder, "login.html")
    body = request.get_json(silent=True) or request.form
    email = (body.get("email") or "").strip().lower(); password = body.get("password") or ""
    user = find_user_by_email(email)
    if user is None or not check_password_hash(user["password_hash"], password):
        return jsonify({"isError": True, "message": "E-mail ou senha inválidos."}), 401
    if (user.get("status") or "active") == "inactive":
        return jsonify({"isError": True, "message": "Este usuário está inativo. Fale com um administrador."}), 403
    session.clear(); session["user_id"]=user["id"]; session["user_email"]=user["email"]; session["user_name"]=user.get("name") or user["email"]
    session["user_profile"]=user.get("profile") or "auditor"; session["company_id"]=user.get("company_id")
    if user.get("profile") == "super_admin":
        companies = list_companies()
        session["active_company_id"] = companies[0]["id"] if companies else None
    db=get_db(); p=_placeholder(); _execute(db, f"UPDATE users SET last_access=CURRENT_TIMESTAMP WHERE id={p}", (user["id"],))
    return jsonify({"isOk": True, "redirect": url_for("index")})


@app.route("/logout", methods=["GET", "POST"])
def logout():
    session.clear(); return redirect(url_for("login"))


@app.route("/api/me", methods=["GET"])
@login_required
def me():
    user = find_user_by_email(session.get("user_email")); cid=active_company_id(); company=get_company_by_id(cid)
    return jsonify({
        "email":session.get("user_email"), "name":session.get("user_name"), "profile":session.get("user_profile"),
        "isAdmin":session.get("user_profile") in ("admin","super_admin"), "isSuperAdmin":session.get("user_profile")=="super_admin",
        "department":(user or {}).get("department") or "", "photo":(user or {}).get("photo") or "",
        "companyId":cid, "company":company, "companies":list_companies() if session.get("user_profile")=="super_admin" else ([company] if company else []),
        "publicUrl": f"/publico/{company['slug']}" if company else None,
        "photoRetentionMonths": PHOTO_RETENTION_MONTHS, "maxAuditorsPerCompany": MAX_AUDITORS_PER_COMPANY,
    })


@app.route("/api/company/switch", methods=["POST"])
@super_admin_required
def switch_company():
    body=request.get_json(force=True) or {}; cid=body.get("company_id")
    try: cid=int(cid)
    except Exception: return jsonify({"isError":True,"message":"Empresa inválida."}),400
    company=get_company_by_id(cid)
    if not company or company.get("status")!='active': return jsonify({"isError":True,"message":"Empresa não encontrada."}),404
    session["active_company_id"]=cid
    return jsonify({"isOk":True,"company":company,"publicUrl":f"/publico/{company['slug']}"})


USER_LIST_COLUMNS = "u.id,u.email,u.name,u.department,u.role,u.profile,u.status,u.photo,u.last_access,u.company_id,c.name AS company_name,c.slug AS company_slug"


@app.route("/api/users/names", methods=["GET"])
@login_required
def list_user_names():
    cid=active_company_id(); db=get_db(); p=_placeholder()
    rows=_fetch_all(db, f"SELECT id,name,department FROM users WHERE status='active' AND company_id={p} ORDER BY name", (cid,))
    result=[]
    for row in rows:
        name=_row_value(row,1,"name")
        if name: result.append({"id":str(_row_value(row,0,"id")),"name":name,"department":_row_value(row,2,"department") or ""})
    return jsonify(result)


@app.route("/api/users", methods=["GET"])
@admin_required
def list_users():
    db=get_db(); p=_placeholder()
    if session.get("user_profile")=="super_admin":
        rows=_fetch_all(db, f"SELECT {USER_LIST_COLUMNS} FROM users u LEFT JOIN companies c ON c.id=u.company_id ORDER BY c.name,u.name,u.email")
    else:
        rows=_fetch_all(db, f"SELECT {USER_LIST_COLUMNS} FROM users u LEFT JOIN companies c ON c.id=u.company_id WHERE u.company_id={p} ORDER BY u.name,u.email", (active_company_id(),))
    keys=["id","email","name","department","role","profile","status","photo","last_access","company_id","company_name","company_slug"]
    users=[]
    for row in rows:
        d={k:_row_value(row,i,k) for i,k in enumerate(keys)}
        users.append(user_public_dict(d))
    return jsonify(users)


def _auditor_count(company_id, exclude_user_id=None):
    db=get_db(); p=_placeholder(); params=[company_id]; q=f"SELECT id FROM users WHERE company_id={p} AND profile='auditor' AND status='active'"
    if exclude_user_id is not None:
        q += f" AND id<>{p}"; params.append(exclude_user_id)
    return len(_fetch_all(db,q,tuple(params)))


@app.route("/api/users", methods=["POST"])
@admin_required
def create_user():
    body=request.get_json(force=True) or {}; email=(body.get("email") or "").strip().lower(); name=(body.get("name") or "").strip(); password=body.get("password") or ""
    department=(body.get("department") or "").strip(); role=(body.get("role") or "").strip(); profile=body.get("profile") or "auditor"; status=body.get("status") or "active"; photo=body.get("photo") or ""
    if not email or not name or not password: return jsonify({"isError":True,"message":"Nome, e-mail e senha temporária são obrigatórios."}),400
    if profile not in ("admin","auditor"): return jsonify({"isError":True,"message":"Perfil inválido."}),400
    if find_user_by_email(email) is not None: return jsonify({"isError":True,"message":"Já existe um usuário com esse e-mail."}),400
    if session.get("user_profile")=="super_admin":
        try: company_id=int(body.get("company_id") or active_company_id())
        except Exception: return jsonify({"isError":True,"message":"Selecione uma empresa."}),400
    else: company_id=active_company_id()
    if not get_company_by_id(company_id): return jsonify({"isError":True,"message":"Empresa inválida."}),400
    if profile=='auditor' and status=='active' and _auditor_count(company_id)>=MAX_AUDITORS_PER_COMPANY:
        return jsonify({"isError":True,"message":f"Esta empresa já possui o limite de {MAX_AUDITORS_PER_COMPANY} auditores ativos."}),400
    db=get_db(); p=_placeholder(); _execute(db, f"INSERT INTO users (email,password_hash,name,department,role,profile,status,photo,company_id) VALUES ({p},{p},{p},{p},{p},{p},{p},{p},{p})", (email,generate_password_hash(password),name,department,role,profile,status,photo,company_id))
    user=find_user_by_email(email); d=user_public_dict(user); company=get_company_by_id(company_id); d.update({"company_name":company["name"],"company_slug":company["slug"]})
    return jsonify(d)


@app.route("/api/users/<int:user_id>", methods=["PUT"])
@admin_required
def update_user(user_id):
    db=get_db(); p=_placeholder(); row=_fetch_one(db, f"SELECT email,profile,company_id FROM users WHERE id={p}", (user_id,))
    if row is None: return jsonify({"isError":True,"message":"Usuário não encontrado."}),404
    existing_email=_row_value(row,0,"email"); existing_profile=_row_value(row,1,"profile"); existing_cid=_row_value(row,2,"company_id")
    if existing_profile=='super_admin' or existing_email in SUPER_ADMINS:
        return jsonify({"isError":True,"message":"Os superadministradores fixos não podem ser alterados por esta tela."}),400
    if session.get("user_profile")!='super_admin' and int(existing_cid or 0)!=int(active_company_id() or 0): return jsonify({"isError":True,"message":"Usuário pertence a outra empresa."}),403
    body=request.get_json(force=True) or {}; name=(body.get("name") or "").strip(); department=(body.get("department") or "").strip(); role=(body.get("role") or "").strip(); profile=body.get("profile") or "auditor"; status=body.get("status") or "active"; photo=body.get("photo",None)
    if profile not in ("admin","auditor"): return jsonify({"isError":True,"message":"Perfil inválido."}),400
    company_id=existing_cid
    if session.get("user_profile")=="super_admin" and body.get("company_id"):
        try: company_id=int(body.get("company_id"))
        except Exception: return jsonify({"isError":True,"message":"Empresa inválida."}),400
    if not get_company_by_id(company_id): return jsonify({"isError":True,"message":"Empresa inválida."}),400
    if profile=='auditor' and status=='active' and _auditor_count(company_id,exclude_user_id=user_id)>=MAX_AUDITORS_PER_COMPANY:
        return jsonify({"isError":True,"message":f"Esta empresa já possui o limite de {MAX_AUDITORS_PER_COMPANY} auditores ativos."}),400
    if photo is None:
        _execute(db, f"UPDATE users SET name={p},department={p},role={p},profile={p},status={p},company_id={p} WHERE id={p}", (name,department,role,profile,status,company_id,user_id))
    else:
        _execute(db, f"UPDATE users SET name={p},department={p},role={p},profile={p},status={p},photo={p},company_id={p} WHERE id={p}", (name,department,role,profile,status,photo,company_id,user_id))
    user=find_user_by_email(existing_email); d=user_public_dict(user); company=get_company_by_id(company_id); d.update({"company_name":company["name"],"company_slug":company["slug"]})
    return jsonify(d)


@app.route("/api/users/<int:user_id>/reset-password", methods=["POST"])
@admin_required
def reset_user_password(user_id):
    body=request.get_json(force=True) or {}; password=body.get("password") or ""
    if len(password)<4: return jsonify({"isError":True,"message":"A senha temporária deve ter ao menos 4 caracteres."}),400
    db=get_db(); p=_placeholder(); row=_fetch_one(db,f"SELECT email,company_id,profile FROM users WHERE id={p}",(user_id,))
    if row is None:return jsonify({"isError":True,"message":"Usuário não encontrado."}),404
    if _row_value(row,2,"profile")=='super_admin': return jsonify({"isError":True,"message":"Senha de superadministrador deve ser alterada fora desta tela."}),400
    if session.get("user_profile")!='super_admin' and int(_row_value(row,1,"company_id") or 0)!=int(active_company_id() or 0): return jsonify({"isError":True,"message":"Usuário pertence a outra empresa."}),403
    _execute(db,f"UPDATE users SET password_hash={p} WHERE id={p}",(generate_password_hash(password),user_id)); return jsonify({"isOk":True})


@app.route("/api/users/<int:user_id>", methods=["DELETE"])
@admin_required
def delete_user(user_id):
    db=get_db(); p=_placeholder(); row=_fetch_one(db,f"SELECT email,profile,company_id FROM users WHERE id={p}",(user_id,))
    if row is None:return jsonify({"isError":True,"message":"Usuário não encontrado."}),404
    email=_row_value(row,0,"email"); profile=_row_value(row,1,"profile"); cid=_row_value(row,2,"company_id")
    if session.get("user_id")==user_id:return jsonify({"isError":True,"message":"Você não pode excluir o próprio usuário."}),400
    if profile=='super_admin' or email in SUPER_ADMINS:return jsonify({"isError":True,"message":"Superadministradores fixos não podem ser excluídos."}),400
    if session.get("user_profile")!='super_admin' and int(cid or 0)!=int(active_company_id() or 0):return jsonify({"isError":True,"message":"Usuário pertence a outra empresa."}),403
    _execute(db,f"DELETE FROM users WHERE id={p}",(user_id,)); return jsonify({"isOk":True,"deletedId":str(user_id)})


PUBLIC_CONFIG_KEYS={"otimo","bom","regular","manual_html"}


def _sanitize_public_audit(record):
    clean=dict(record); responses={}
    try:
        raw=json.loads(clean.get("responses_json") or "{}")
        for key,r in raw.items(): responses[key]={"entity_id":r.get("entity_id"),"response":r.get("response")}
    except Exception: pass
    clean["responses_json"]=json.dumps(responses,ensure_ascii=False); clean.pop("auditor",None); clean.pop("companion",None); return clean


def _public_records_for_company(company):
    cleanup_old_photos(company["id"]); db=get_db(); p=_placeholder(); rows=_fetch_all(db,f"SELECT id,type,payload FROM records WHERE company_id={p} ORDER BY id",(company["id"],)); result=[]
    for row in rows:
        record=row_to_record(row); rtype=record.get("type")
        if rtype in ("department","criterion"): result.append(record)
        elif rtype=="audit": result.append(_sanitize_public_audit(record))
        elif rtype=="config" and record.get("config_key") in PUBLIC_CONFIG_KEYS: result.append(record)
    return result


@app.route("/api/public/<slug>/records", methods=["GET"])
def public_records_company(slug):
    company=get_company_by_slug(slug)
    if not company:return jsonify({"isError":True,"message":"Empresa não encontrada."}),404
    return jsonify(_public_records_for_company(company))


@app.route("/api/public/<slug>/info", methods=["GET"])
def public_company_info(slug):
    company=get_company_by_slug(slug)
    if not company:return jsonify({"isError":True,"message":"Empresa não encontrada."}),404
    return jsonify({"name":company["name"],"slug":company["slug"],"photoRetentionMonths":PHOTO_RETENTION_MONTHS})


@app.route("/api/public/records", methods=["GET"])
def public_records_legacy():
    company=get_company_by_slug("royal-cargo"); return jsonify(_public_records_for_company(company))


@app.route("/publico")
def public_page_legacy():
    return redirect(url_for("public_page", slug="royal-cargo"))


@app.route("/publico/<slug>")
def public_page(slug):
    if not get_company_by_slug(slug): return "Empresa não encontrada",404
    return send_from_directory(app.template_folder,"public.html")


@app.route("/")
@login_required
def index():
    return send_from_directory(app.template_folder,"index.html")


init_db()

if __name__ == "__main__":
    app.run(debug=True,host="0.0.0.0",port=5000)
