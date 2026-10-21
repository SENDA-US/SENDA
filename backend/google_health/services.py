from decouple import config
import requests
from django.utils import timezone
from .models import GoogleAccount

class GoogleAuthService:
    @staticmethod
    def refresh_access_token(google_account: GoogleAccount):
        client_id = config("GOOGLE_CLIENT_ID")
        client_secret = config("GOOGLE_CLIENT_SECRET")
        token_uri = config("GOOGLE_TOKEN_URI")

        payload = {
            'client_id': client_id,
            'client_secret': client_secret,
            'refresh_token': google_account.refresh_token,
            'grant_type': 'refresh_token',
        }

        response = requests.post(token_uri, data=payload)
        
        if response.status_code == 200:
            token_data = response.json()
            google_account.access_token = token_data['access_token']
            
            # Calcular nueva fecha de expiración
            expires_in = token_data.get('expires_in', 3600)
            google_account.access_token_expiration = timezone.now() + timezone.timedelta(seconds=expires_in)
            google_account.authentication_status = 'ACTIVE'
            google_account.save()
            return True
        else:
            google_account.authentication_status = 'EXPIRED_OR_REVOKED'
            google_account.save()
            return False

    @staticmethod
    def fetch_physiological_data_from_google(google_account: GoogleAccount):
        if not google_account.access_token or (
            google_account.access_token_expiration and 
            google_account.access_token_expiration <= timezone.now()
        ):
            success = GoogleAuthService.refresh_access_token(google_account)
            if not success:
                raise Exception("No se pudo refrescar el token de acceso para la cuenta.")

        headers = {
            "Authorization": f"Bearer {google_account.access_token}",
            "Content-Type": "application/json"
        }

        mapping = {
            'HEART_RATE': 'heartRate',          
            'HEART_RATE_RESTING': 'restingHeartRate',
            'SLEEP_DURATION': 'sleep',
            'STEPS': 'steps',
            'DISTANCE': 'distance',
        }

        parsed_records = []
        from .models import VariableType

        for var_code, var_label in VariableType.choices:
            health_datatype = mapping.get(var_code)
            if not health_datatype:
                continue

            api_url = f"https://health.googleapis.com/v4/users/me/dataTypes/{health_datatype}/dataPoints"

            start_time = (timezone.now() - timezone.timedelta(days=60)).isoformat()
            end_time = timezone.now().isoformat()
            
            params = {
                "startTime": start_time,
                "endTime": end_time
            }

            response = requests.get(api_url, headers=headers, params=params)
            print(f"DEBUG: Respuesta de Google para {var_code}: {response.json()}")

            if response.status_code != 200:
                continue

            data = response.json()
            
            for point in data.get('dataPoints', []):
                # Extraer la marca temporal
                time_str = point.get('startTime') or point.get('updateTime')
                if not time_str:
                    continue
                
                physical_time = timezone.datetime.fromisoformat(time_str.replace('Z', '+00:00'))

                # Extraer el valor métrico 
                val = point.get('value') or point.get('metricValue', 0)
                if isinstance(val, dict):
                    val = val.get('fpVal') or val.get('intVal', 0)

                parsed_records.append({
                    'variable_type': var_code,
                    'physical_time': physical_time,
                    'metric_value': float(val)
                })

        return parsed_records

# Función que llama la tarea de Celery
def get_data_from_google(google_account: GoogleAccount):
    return GoogleAuthService.fetch_physiological_data_from_google(google_account)