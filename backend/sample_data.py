"""
Sample data — Seed script for demo users, prescriptions, and reminders.
Called on app startup if the database is empty.
"""

import json

SAMPLE_USERS = [
    {
        "name": "Arjun Nair",
        "email": "athulkishor2004@gmail.com",
        "password": "demo123",
        "phone": "6235327657"
    },
    {
        "name": "Priya Menon",
        "email": "priya@demo.com",
        "password": "demo123",
        "phone": "6235327657"
    },
    {
        "name": "Rahul Sharma",
        "email": "rahul@demo.com",
        "password": "demo123",
        "phone": "6235327657"
    }
]

SAMPLE_PRESCRIPTIONS = [
    {
        "user_email": "athulkishor2004@gmail.com",
        "filename": "arjun_prescription_1.jpg",
        "raw_ocr": "Metformin 500mg twice daily\nAmlodipine 5mg once daily",
        "cleaned_text": "Metformin 500mg - Take twice daily with food\nAmlodipine 5mg - Take once daily in the morning",
        "medicines_json": [
            {
                "name": "Metformin",
                "dosage": "500mg",
                "frequency": "twice daily",
                "purpose": "Blood sugar control",
                "side_effects": ["Nausea", "Stomach upset"],
                "warnings": ["Take with food"],
                "plain_english": "This keeps your blood sugar stable. Take one in the morning and one at night, always with a meal."
            },
            {
                "name": "Amlodipine",
                "dosage": "5mg",
                "frequency": "once daily",
                "purpose": "Blood pressure control",
                "side_effects": ["Ankle swelling"],
                "warnings": ["Do not stop suddenly"],
                "plain_english": "This controls your blood pressure. Take one tablet every morning."
            }
        ]
    },
    {
        "user_email": "priya@demo.com",
        "filename": "priya_prescription_1.jpg",
        "raw_ocr": "Pantoprazole 40mg once daily before breakfast",
        "cleaned_text": "Pantoprazole 40mg - Take once daily, 30 minutes before breakfast",
        "medicines_json": [
            {
                "name": "Pantoprazole",
                "dosage": "40mg",
                "frequency": "once daily before breakfast",
                "purpose": "Acid reflux",
                "side_effects": ["Headache"],
                "warnings": ["Take 30 minutes before eating"],
                "plain_english": "Take this on an empty stomach every morning, 30 minutes before breakfast."
            }
        ]
    }
]

SAMPLE_REMINDERS = [
    {
        "user_email": "athulkishor2004@gmail.com",
        "medicine_name": "Metformin 500mg",
        "dosage": "500mg",
        "frequency": "twice daily",
        "reminder_times": ["08:00", "20:00"],
        "is_active": 1
    },
    {
        "user_email": "athulkishor2004@gmail.com",
        "medicine_name": "Amlodipine 5mg",
        "dosage": "5mg",
        "frequency": "once daily",
        "reminder_times": ["08:00"],
        "is_active": 1
    },
    {
        "user_email": "priya@demo.com",
        "medicine_name": "Pantoprazole 40mg",
        "dosage": "40mg",
        "frequency": "once daily",
        "reminder_times": ["07:30"],
        "is_active": 0
    }
]

FALLBACK_MEDICINES = [
    {
        "name": "Paracetamol",
        "dosage": "500mg",
        "frequency": "three times daily",
        "purpose": "Fever and mild pain",
        "side_effects": ["Rare at normal doses"],
        "warnings": ["Do not exceed 4g/day"],
        "plain_english": "Take one tablet three times a day for fever or pain. Don't take more than 8 tablets in 24 hours."
    },
    {
        "name": "Cetirizine",
        "dosage": "10mg",
        "frequency": "once daily at bedtime",
        "purpose": "Allergy relief",
        "side_effects": ["Drowsiness"],
        "warnings": ["Avoid driving after taking"],
        "plain_english": "Take one tablet at night for allergies. It may make you sleepy, so don't drive."
    }
]


def seed_database():
    """Seed the database with sample data if tables are empty."""
    import database as db

    conn = db.get_db()

    # Check if users exist
    count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count > 0:
        conn.close()
        print("[SEED] Database already has data, skipping seed.")
        return

    print("[SEED] Seeding database with sample data...")

    # Create users
    user_ids = {}
    for user in SAMPLE_USERS:
        uid = db.create_user(user["name"], user["email"], user["password"], user["phone"])
        user_ids[user["email"]] = uid
        print(f"  → Created user: {user['email']} (id={uid})")

    # Create prescriptions
    prescription_ids = {}
    for rx in SAMPLE_PRESCRIPTIONS:
        uid = user_ids[rx["user_email"]]
        pid = db.save_prescription(uid, rx["filename"], rx["raw_ocr"], rx["cleaned_text"], rx["medicines_json"])
        prescription_ids[rx["user_email"]] = pid
        print(f"  → Created prescription for {rx['user_email']} (id={pid})")

    # Create reminders
    for rem in SAMPLE_REMINDERS:
        uid = user_ids[rem["user_email"]]
        user = db.get_user_by_id(uid)
        pid = prescription_ids.get(rem["user_email"])
        rid = db.create_reminder(
            user_id=uid,
            medicine_name=rem["medicine_name"],
            dosage=rem["dosage"],
            frequency=rem["frequency"],
            reminder_times=rem["reminder_times"],
            phone_number=user["phone"],
            prescription_id=pid
        )
        # Set is_active
        if not rem["is_active"]:
            db.toggle_reminder(rid)
        print(f"  → Created reminder: {rem['medicine_name']} for {rem['user_email']} (id={rid})")

    print("[SEED] Done!")
