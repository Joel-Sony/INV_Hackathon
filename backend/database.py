"""
Database module — SQLite setup with table creation and helper functions.
Uses Python's built-in sqlite3 (zero external dependencies).
"""

import sqlite3
import os
import json

DB_PATH = os.path.join(os.path.dirname(__file__), "mediscan.db")


def get_db():
    """Get a database connection with row factory."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    """Create all tables if they don't exist."""
    conn = get_db()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            phone TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS prescriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            filename TEXT,
            raw_ocr TEXT,
            cleaned_text TEXT,
            medicines_json TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            prescription_id INTEGER,
            medicine_name TEXT NOT NULL,
            dosage TEXT,
            frequency TEXT,
            reminder_times TEXT,
            phone_number TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (prescription_id) REFERENCES prescriptions(id)
        );

        CREATE TABLE IF NOT EXISTS sms_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reminder_id INTEGER,
            phone TEXT,
            message TEXT,
            status TEXT,
            sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    conn.commit()
    conn.close()


# ============================================================
#  USER OPERATIONS
# ============================================================

def get_user_by_email(email: str):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    conn.close()
    return dict(user) if user else None


def get_user_by_id(user_id: int):
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None


def create_user(name, email, password, phone):
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO users (name, email, password, phone) VALUES (?, ?, ?, ?)",
        (name, email, password, phone)
    )
    conn.commit()
    user_id = cursor.lastrowid
    conn.close()
    return user_id


# ============================================================
#  PRESCRIPTION OPERATIONS
# ============================================================

def save_prescription(user_id, filename, raw_ocr, cleaned_text, medicines):
    conn = get_db()
    cursor = conn.execute(
        "INSERT INTO prescriptions (user_id, filename, raw_ocr, cleaned_text, medicines_json) VALUES (?, ?, ?, ?, ?)",
        (user_id, filename, raw_ocr, cleaned_text, json.dumps(medicines))
    )
    conn.commit()
    prescription_id = cursor.lastrowid
    conn.close()
    return prescription_id


def get_prescriptions_for_user(user_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM prescriptions WHERE user_id = ? ORDER BY uploaded_at DESC", (user_id,)
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        d["medicines"] = json.loads(d.get("medicines_json") or "[]")
        result.append(d)
    return result


def get_prescription_by_id(prescription_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM prescriptions WHERE id = ?", (prescription_id,)).fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["medicines"] = json.loads(d.get("medicines_json") or "[]")
        return d
    return None


# ============================================================
#  REMINDER OPERATIONS
# ============================================================

def create_reminder(user_id, medicine_name, dosage, frequency, reminder_times, phone_number, prescription_id=None):
    conn = get_db()
    cursor = conn.execute(
        """INSERT INTO reminders (user_id, prescription_id, medicine_name, dosage, frequency, reminder_times, phone_number)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (user_id, prescription_id, medicine_name, dosage, frequency, json.dumps(reminder_times), phone_number)
    )
    conn.commit()
    reminder_id = cursor.lastrowid
    conn.close()
    return reminder_id


def get_reminders_for_user(user_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT * FROM reminders WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        d["reminder_times"] = json.loads(d.get("reminder_times") or "[]")
        result.append(d)
    return result


def get_reminder_by_id(reminder_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM reminders WHERE id = ?", (reminder_id,)).fetchone()
    conn.close()
    if row:
        d = dict(row)
        d["reminder_times"] = json.loads(d.get("reminder_times") or "[]")
        return d
    return None


def toggle_reminder(reminder_id):
    conn = get_db()
    row = conn.execute("SELECT is_active FROM reminders WHERE id = ?", (reminder_id,)).fetchone()
    if row:
        new_state = 0 if row["is_active"] else 1
        conn.execute("UPDATE reminders SET is_active = ? WHERE id = ?", (new_state, reminder_id))
        conn.commit()
    conn.close()
    return new_state if row else None


def delete_reminder(reminder_id):
    conn = get_db()
    conn.execute("DELETE FROM reminders WHERE id = ?", (reminder_id,))
    conn.commit()
    conn.close()


def get_all_active_reminders():
    conn = get_db()
    rows = conn.execute(
        "SELECT r.*, u.phone as user_phone FROM reminders r JOIN users u ON r.user_id = u.id WHERE r.is_active = 1"
    ).fetchall()
    conn.close()
    result = []
    for row in rows:
        d = dict(row)
        d["reminder_times"] = json.loads(d.get("reminder_times") or "[]")
        result.append(d)
    return result


# ============================================================
#  SMS LOG OPERATIONS
# ============================================================

def log_sms(reminder_id, phone, message, status):
    conn = get_db()
    conn.execute(
        "INSERT INTO sms_logs (reminder_id, phone, message, status) VALUES (?, ?, ?, ?)",
        (reminder_id, phone, message, status)
    )
    conn.commit()
    conn.close()


def get_sms_logs(user_id=None, limit=20):
    conn = get_db()
    if user_id:
        rows = conn.execute(
            """SELECT sl.*, r.medicine_name FROM sms_logs sl
               LEFT JOIN reminders r ON sl.reminder_id = r.id
               WHERE r.user_id = ?
               ORDER BY sl.sent_at DESC LIMIT ?""",
            (user_id, limit)
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT sl.*, r.medicine_name FROM sms_logs sl
               LEFT JOIN reminders r ON sl.reminder_id = r.id
               ORDER BY sl.sent_at DESC LIMIT ?""",
            (limit,)
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
