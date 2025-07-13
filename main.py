import os
from typing import Dict, Optional
from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.security import OAuth2PasswordBearer
from dotenv import load_dotenv
from pydantic import BaseModel
import requests
from urllib.parse import quote, urlencode
from fastapi.staticfiles import StaticFiles
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from fastapi.middleware.cors import CORSMiddleware


# Load env vars from .env file
load_dotenv()

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET")
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI")

app = FastAPI()
app.mount("/static", StaticFiles(directory="static", html=True), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or specify domain like ["http://localhost:3000"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def list_events(access_token, refresh_token):
    creds = Credentials(token=access_token)
    service = build('calendar', 'v3', credentials=creds)
    events_result = service.events().list(
        calendarId='primary',
        timeMin='2025-07-14T00:00:00Z',
        maxResults=10,
        singleEvents=True,
        orderBy='startTime'
    ).execute()
    return events_result.get('items', [])


class EventSchema(BaseModel):
    summary: str
    start: Dict[str, str]
    end: Dict[str, str]
    description: Optional[str] = None

@app.get("/", response_class=FileResponse)
async def serve_home():
    return FileResponse("static/index.html")


@app.get("/events")
async def get_events(authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing access token")

    access_token = authorization.replace("Bearer ", "")
    events = list_events(access_token, None)
    return events


@app.post("/events")
async def create_event(event: EventSchema, authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing access token")
    access_token = authorization.replace("Bearer ", "")
    creds = Credentials(token=access_token)
    service = build('calendar', 'v3', credentials=creds)

    event_body = event.dict()
    created_event = service.events().insert(
        calendarId='primary', body=event_body).execute()
    return created_event


@app.delete("/events/{event_id}")
async def delete_event(event_id: str, authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing access token")
    access_token = authorization.replace("Bearer ", "")
    creds = Credentials(token=access_token)
    service = build('calendar', 'v3', credentials=creds)

    service.events().delete(calendarId='primary', eventId=event_id).execute()
    return {"message": "Event deleted"}


@app.put("/events/{event_id}")
async def update_event(event_id: str, event: EventSchema, authorization: str = Header(None)):
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing access token")
    access_token = authorization.replace("Bearer ", "")
    creds = Credentials(token=access_token)
    service = build('calendar', 'v3', credentials=creds)

    updated_event = service.events().update(
        calendarId='primary',
        eventId=event_id,
        body=event.dict()
    ).execute()
    return updated_event

@app.get("/login/google")
async def login_google():
    print("GOOGLE_CLIENT_ID:", GOOGLE_CLIENT_ID)
    print("GOOGLE_REDIRECT_URI:", GOOGLE_REDIRECT_URI)
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "response_type": "code",
        "scope": "openid email profile https://www.googleapis.com/auth/calendar",
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "access_type": "offline",
        "prompt": "consent"
    }

    if not GOOGLE_CLIENT_ID or not GOOGLE_REDIRECT_URI:
        return {"error": "Missing required OAuth environment variables."}
    auth_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    print("Auth URL:", auth_url)
    return {"auth_url": auth_url}


@app.get("/auth/google")
async def auth_google(code: str):
    token_url = "https://oauth2.googleapis.com/token"
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    token_response = requests.post(token_url, data=data)
    token_json = token_response.json()
    access_token = token_json.get("access_token")
    user_info = requests.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
        headers={"Authorization": f"Bearer {access_token}"}
    ).json()
    if not access_token:
        raise HTTPException(
            status_code=400, detail="Failed to get access token")
    # Redirect back to the frontend with access_token as query param
    params = urlencode({
        "token": access_token,
        "name": quote(user_info.get("name", "")),
        "picture": quote(user_info.get("picture", ""))
    })
    return RedirectResponse(url=f"/?{params}")



@app.get("/token")
async def get_token(token: str = Depends(oauth2_scheme)):
    return {"token": token}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8081, reload=True)
