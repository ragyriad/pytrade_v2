import json
import os
from ws_api import WealthsimpleAPI, WSAPISession, OTPRequiredException
import datetime
from ws_connector.helper_functions import anonymise
CREDS_FILE = "ws_cred.json"
SESSION_FILE = "session.json"

def get_creds():
    if not os.path.exists(CREDS_FILE):
        print("Not Found")
        return None, None
    with open(CREDS_FILE) as f:
        print("Found")
        data = json.load(f)
        return data

def save_session(session_json: str):
    data = json.loads(session_json)
    # Only persist the tokens, not the client_id/wssdi
    # Those will be freshly scraped from WS on next startup
    slim = {
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
    }
    with open(SESSION_FILE, "w") as f:
        json.dump(slim, f)

def load_session() -> WSAPISession | None:
    if not os.path.exists(SESSION_FILE):
        return None
    try:
        with open(SESSION_FILE) as f:
            content = f.read().strip()
        if not content:
            print("Session file is empty, will do fresh login")
            return None
        data = json.loads(content)
    except (json.JSONDecodeError, IOError) as e:
        print(f"Session file unreadable ({e}), will do fresh login")
        return None

    access_token = data.get("access_token")
    refresh_token = data.get("refresh_token")
    if not access_token or not refresh_token:
        print("Session file missing tokens, will do fresh login")
        return None

    return WSAPISession(
        access_token=access_token,
        refresh_token=refresh_token,
    )


def get_ws(username: str, password: str) -> WealthsimpleAPI:
    session = load_session()

    if session:
        try:
            print("Attempting to restore session...")
            ws = WealthsimpleAPI.from_token(session, save_session, username)
            print("Session restored successfully")
            return ws
        except Exception as e:
            print(f"Session unusable ({e}), falling back to login")

    otp = None
    while True:
        try:
            print("Logging in...")
            WealthsimpleAPI.login(username, password, otp, persist_session_fct=save_session)
            session = load_session()
            return WealthsimpleAPI.from_token(session, save_session, username)
        except OTPRequiredException:
            otp = input("OTP: ")

ws_creds = get_creds()
username = ws_creds.get("username")
password = ws_creds.get("password")
print(username + password)
ws = get_ws(username, password)

# Get your accounts
accounts = ws.get_accounts()




