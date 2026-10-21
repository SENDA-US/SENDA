from django.core.management.base import BaseCommand
from google_health.models import GoogleAccount
from google_health.services import GoogleAuthService
import requests
import time

class Command(BaseCommand):
    help = 'Realiza una petición de prueba de Heart Rate a la Google Health API para la cuenta específica'

    def handle(self, *args, **options):
        target_email = 'olgacantalejog@gmail.com'
        self.stdout.write(f'Buscando la cuenta {target_email} y realizando petición de Heart Rate...')
        
        try:
            account = GoogleAccount.objects.get(email=target_email)
        except GoogleAccount.DoesNotExist:
            self.stdout.write(self.style.ERROR(f'No se encontró ninguna cuenta con el correo {target_email}.'))
            return

        GoogleAuthService.refresh_access_token(account)

        # Rango de tiempo de prueba (últimas 24 horas en milisegundos Unix)
        end_time_ms = int(time.time() * 1000)
        start_time_ms = end_time_ms - (24 * 60 * 60 * 1000)

        # Endpoint de Google Health para datasets de ritmo cardíaco
        url = f"https://health.googleapis.com/v4/users/me/dataTypes/heart-rate/dataPoints"
        
        headers = {
            "Authorization": f"Bearer {account.access_token}"
        }

        response = requests.get(url, headers=headers)
        
        if response.status_code == 200:
            self.stdout.write(self.style.SUCCESS(f'¡Petición de Heart Rate exitosa para {target_email}!'))
            self.stdout.write(str(response.json()))
        else:
            self.stdout.write(self.style.ERROR(f'Error en la API ({response.status_code}): {response.text}'))