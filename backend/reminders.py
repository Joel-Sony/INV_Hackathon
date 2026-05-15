"""
Reminders module — Frequency parser + Email sender via Gmail SMTP.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

SMTP_EMAIL = os.getenv("SMTP_EMAIL")        # e.g. yourname@gmail.com
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")   # Gmail App Password (16 chars)

# ============================================================
#  FREQUENCY PARSER
# ============================================================

FREQUENCY_MAP = {
    "once daily":                    ["08:00"],
    "twice daily":                   ["08:00", "20:00"],
    "three times daily":             ["08:00", "14:00", "20:00"],
    "thrice daily":                  ["08:00", "14:00", "20:00"],
    "four times daily":              ["07:00", "12:00", "17:00", "22:00"],
    "every 8 hours":                 ["06:00", "14:00", "22:00"],
    "every 12 hours":                ["08:00", "20:00"],
    "every 6 hours":                 ["06:00", "12:00", "18:00", "00:00"],
    "once daily before breakfast":   ["07:30"],
    "once daily after breakfast":    ["09:00"],
    "once daily at night":           ["21:00"],
    "once daily at bedtime":         ["22:00"],
    "once daily in the morning":     ["08:00"],
    "twice daily after meals":       ["09:00", "21:00"],
    "as needed":                     [],
}


def parse_frequency(frequency_text: str) -> list:
    """Convert frequency text to list of clock times."""
    if not frequency_text:
        return ["08:00"]
    freq_lower = frequency_text.lower().strip()
    for key, times in FREQUENCY_MAP.items():
        if key in freq_lower:
            return times
    return ["08:00"]


# ============================================================
#  EMAIL SENDING
# ============================================================

def _build_html_email(medicine_name: str, dosage: str = "", frequency: str = "") -> str:
    """Build a styled HTML email body."""
    now = datetime.now().strftime("%I:%M %p, %d %b %Y")
    return f"""
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:500px;margin:0 auto;background:#0f0f23;color:#e2e8f0;border-radius:16px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 28px;">
            <h1 style="margin:0;font-size:22px;color:#fff;">💊 MediScan Reminder</h1>
        </div>
        <div style="padding:28px;">
            <p style="font-size:16px;margin:0 0 8px;">Time to take your medicine:</p>
            <div style="background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:12px;padding:20px;margin:16px 0;">
                <h2 style="margin:0 0 6px;font-size:20px;color:#a5b4fc;">{medicine_name}</h2>
                <p style="margin:0;color:#94a3b8;font-size:14px;">{dosage} {('• ' + frequency) if frequency else ''}</p>
            </div>
            <p style="font-size:14px;color:#94a3b8;margin:20px 0 0;">Stay healthy! 💪</p>
            <hr style="border:none;border-top:1px solid #1e293b;margin:20px 0;">
            <p style="font-size:12px;color:#64748b;margin:0;">Sent at {now} by MediScan</p>
        </div>
    </div>
    """


def send_email(to_email: str, medicine_name: str, dosage: str = "", frequency: str = "") -> dict:
    """Send a reminder email via Gmail SMTP."""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        print(f"[EMAIL ⚠️] SMTP credentials not set — using mock")
        return send_email_mock(to_email, medicine_name)

    subject = f"💊 MediScan Reminder: Time to take {medicine_name}"
    html_body = _build_html_email(medicine_name, dosage, frequency)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"MediScan <{SMTP_EMAIL}>"
    msg["To"] = to_email

    # Plain text fallback
    plain = f"MediScan Reminder\n\nTime to take {medicine_name} ({dosage}). {frequency}.\nStay healthy!"
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.sendmail(SMTP_EMAIL, to_email, msg.as_string())

        print(f"[EMAIL ✅] Sent to {to_email}: {subject}")
        return {
            "status": "sent",
            "to": to_email,
            "subject": subject,
            "message": f"Reminder email sent for {medicine_name}",
            "sent_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        }
    except Exception as e:
        print(f"[EMAIL ❌] Failed: {e}")
        return {
            "status": "failed",
            "to": to_email,
            "error": str(e),
            "message": f"Failed to send email for {medicine_name}"
        }


def send_email_mock(to_email: str, medicine_name: str) -> dict:
    """Mock email — logs to console."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[EMAIL MOCK 📧] → {to_email}: Reminder for {medicine_name} (at {now})")
    return {
        "status": "mock",
        "to": to_email,
        "message": f"Mock reminder for {medicine_name}",
        "sent_at": now
    }
