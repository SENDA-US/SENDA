from urllib.parse import urlencode

from decouple import config
import requests


class GoogleOAuthService:

    @staticmethod
    def get_authorization_url():
        params = {
            "client_id": config("GOOGLE_CLIENT_ID"),
            "redirect_uri": config("GOOGLE_REDIRECT_URI"),
            "response_type": "code",
            "scope": " ".join([
                "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
                "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
                "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
                "https://www.googleapis.com/auth/googlehealth.settings.readonly",
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile"
            ]),
            "access_type": "offline",
            "prompt": "select_account consent",
        }

        auth_uri = config("GOOGLE_AUTH_URI")

        return f"{auth_uri}?{urlencode(params)}"

    @staticmethod
    def exchange_code_for_tokens(code):
        token_uri = config("GOOGLE_TOKEN_URI")
        payload = {
            "code": code,
            "client_id": config("GOOGLE_CLIENT_ID"),
            "client_secret": config("GOOGLE_CLIENT_SECRET"),
            "redirect_uri": config("GOOGLE_REDIRECT_URI"),
            "grant_type": "authorization_code",
        }

        try:
            response = requests.post(token_uri, data=payload, timeout=15)
        except requests.exceptions.Timeout:
            return {'error': 'Timeout al conectar con Google (token)', 'status_code': 504}
        except requests.exceptions.RequestException as e:
            return {'error': f'Error de conexión: {str(e)}', 'status_code': 500}

        if response.status_code == 200:
            data = response.json()

            print("========== GOOGLE TOKEN RESPONSE ==========")
            print("STATUS:", response.status_code)
            print("HAS ACCESS TOKEN:", bool(data.get("access_token")))
            print("HAS REFRESH TOKEN:", bool(data.get("refresh_token")))
            print("===========================================")

            return data

        try:
            error_data = response.json()
        except Exception:
            error_data = response.text

        print("========== GOOGLE TOKEN ERROR ==========")
        print("STATUS:", response.status_code)
        print("ERROR:", error_data)
        print("=========================================")

        return {
            'error': error_data,
            'status_code': response.status_code
        }