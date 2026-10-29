from django.core.management.base import BaseCommand
from django.db import models
from django.utils import timezone
from datetime import timedelta
import requests

from google_health.services import GoogleAuthService
from google_health.models import (
    GoogleAccount, Assignment, PhysiologicalData,
    SyncLog, VariableType,
)

from google_health.tasks import ENDPOINTS


API_BASE = "https://health.googleapis.com/v4/users/me/dataTypes"
ALL_VARIABLE_TYPES = [choice[0] for choice in VariableType.choices]


class Command(BaseCommand):
    help = (
        'Descarga variables fisiológicas de Google Health para una o todas las cuentas. '
        'Pensado para reprocesar/forzar un sync manual. '
        'El sync automático corre cada 5 min desde Celery.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--email', type=str, default=None,
                            help='Email de la cuenta de Google (opcional). Si no se indica, procesa todas.')
        parser.add_argument('--participant', type=str, default=None,
                            help='Código de participante (alternativa a --email).')
        parser.add_argument('--variables', type=str, nargs='+', default=None,
                            choices=ALL_VARIABLE_TYPES,
                            help='Limitar a variables concretas.')
        parser.add_argument('--days', type=int, default=90,
                            help='Días hacia atrás a descargar (por defecto 90).')

    def handle(self, *args, **options):
        email = options.get('email')
        participant = options.get('participant')
        requested_variables = options.get('variables')
        days = options.get('days')

        accounts = GoogleAccount.objects.all()
        if email:
            accounts = accounts.filter(email=email)
        elif participant:
            accounts = accounts.filter(participant__participant_code=participant)

        if not accounts.exists():
            self.stdout.write(self.style.ERROR('No hay cuentas que procesar.'))
            return

        variable_filter = set(requested_variables) if requested_variables else None
        now = timezone.now()

        for account in accounts:
            code = getattr(account.participant, 'participant_code', 'N/A')
            self.stdout.write(f'\n=== {account.email} ({code}) ===')

            # 1) Token
            if not GoogleAuthService.refresh_access_token(account):
                self.stdout.write(self.style.ERROR('  ❌ Fallo al refrescar token'))
                SyncLog.objects.create(
                    google_account=account, result='TOKEN_ERROR', downloaded_records=0,
                )
                continue

            # 2) Asignación activa
            assignment = Assignment.objects.filter(
                participant=account.participant,
                start_date__lte=now,
                real_end_date__isnull=True,
            ).first()

            if not assignment:
                self.stdout.write(self.style.WARNING('  ⚠️  Sin asignación activa. Saltando.'))
                continue

            headers = {"Authorization": f"Bearer {account.access_token}"}
            since_dt = now - timedelta(days=days)
            since_date = since_dt.strftime('%Y-%m-%d')                # para date-only
            since_ts = since_dt.strftime('%Y-%m-%dT%H:%M:%SZ')        # para timestamp

            total_saved = 0
            hr_buckets = {}

            for endpoint in ENDPOINTS:
                path = endpoint['endpoint_path']
                url = f"{API_BASE}/{path}/dataPoints"

                # Filtro correcto por endpoint
                base_params = {}
                if path in ('steps', 'distance'):
                    field = f"{endpoint['data_key']}.interval.civil_start_time"
                    base_params['filter'] = f'{field} >= "{since_date}"'

                elif path == 'heart-rate':
                    field = 'heart_rate.sample_time.physical_time'
                    base_params['filter'] = f'{field} >= "{since_ts}"'

                elif path == 'sleep':
                    field = 'sleep.interval.civil_start_time'
                    base_params['filter'] = f'{field} >= "{since_date}"'

                elif path == 'daily-resting-heart-rate':
                    field = 'daily_resting_heart_rate.date'
                    base_params['filter'] = f'{field} >= "{since_date}"'

                elif path == 'daily-heart-rate-variability':
                    field = 'daily_heart_rate_variability.date'
                    base_params['filter'] = f'{field} >= "{since_date}"'

                elif path == 'respiratory-rate-sleep-summary':
                    field = 'respiratory_rate_sleep_summary.sample_time.physical_time'
                    base_params['filter'] = f'{field} >= "{since_ts}"'

                # Descargar todos los dataPoints (con paginación)
                all_points, next_token = [], None
                failed = False

                while True:
                    params = dict(base_params)
                    if next_token:
                        params['pageToken'] = next_token

                    try:
                        r = requests.get(url, headers=headers, params=params, timeout=30)
                    except requests.RequestException as e:
                        self.stdout.write(self.style.ERROR(f'  ❌ {path}: {e}'))
                        failed = True
                        break

                    if r.status_code != 200:
                        self.stdout.write(self.style.ERROR(
                            f'  ❌ {path}: HTTP {r.status_code} — {r.text[:120]}'
                        ))
                        failed = True
                        break

                    data = r.json()
                    all_points.extend(data.get('dataPoints', []))
                    next_token = data.get('nextPageToken')
                    if not next_token:
                        break

                if failed:
                    continue

                # Extraer y guardar
                saved = 0
                for point in all_points:
                    device_info = point.get('dataSource', {}).get('device', {}) or {}
                    device_name = device_info.get('displayName') or 'Fitbit Device'
                    platform = point.get('dataSource', {}).get('platform') or 'FITBIT'
                    recording_method = point.get('dataSource', {}).get('recordingMethod') or 'UNKNOWN'

                    payload = point.get(endpoint['data_key'], point)
                    extracted = endpoint['extractor'](payload, now)

                    for (variable_type, physical_time, metric_value, start_time, end_time) in extracted:
                        if physical_time is None:
                            continue
                        if variable_filter and variable_type not in variable_filter:
                            continue
                        if metric_value is None and variable_type not in (
                            VariableType.SLEEP_START, VariableType.SLEEP_END,
                        ):
                            continue

                        # HEART_RATE → agregación por minuto
                        if variable_type == VariableType.HEART_RATE:
                            minute_dt = physical_time.replace(second=0, microsecond=0)
                            key = (assignment.id, minute_dt)
                            if key not in hr_buckets:
                                hr_buckets[key] = {
                                    'values': [],
                                    'device_name': device_name,
                                    'platform': platform,
                                    'recording_method': recording_method,
                                }
                            hr_buckets[key]['values'].append(float(metric_value))
                            continue

                        # Resto → un dataPoint por fila
                        PhysiologicalData.objects.update_or_create(
                            assignment=assignment,
                            variable_type=variable_type,
                            physical_time=physical_time,
                            defaults={
                                'metric_value': metric_value,
                                'start_time': start_time or physical_time,
                                'end_time': end_time or physical_time,
                                'device_name': device_name,
                                'platform': platform,
                                'recording_method': recording_method,
                            }
                        )
                        saved += 1

                total_saved += saved
                self.stdout.write(self.style.SUCCESS(f'  ✅ {path}: {len(all_points)} puntos, {saved} guardados'))

            # Guardar HEART_RATE agregado por minut
            hr_saved = 0
            for (assignment_id, minute_dt), info in hr_buckets.items():
                if not info['values']:
                    continue
                avg = sum(info['values']) / len(info['values'])
                PhysiologicalData.objects.update_or_create(
                    assignment_id=assignment_id,
                    variable_type=VariableType.HEART_RATE,
                    physical_time=minute_dt,
                    defaults={
                        'metric_value': round(avg, 1),
                        'start_time': minute_dt,
                        'end_time': minute_dt,
                        'device_name': info['device_name'],
                        'platform': info['platform'],
                        'recording_method': info['recording_method'],
                    }
                )
                hr_saved += 1

            if hr_saved:
                self.stdout.write(self.style.SUCCESS(f'  ✅ HEART_RATE: {hr_saved} minutos'))

            SyncLog.objects.create(
                google_account=account,
                result='SUCCESS',
                downloaded_records=total_saved,
            )
            self.stdout.write(self.style.SUCCESS(f'Total guardado para {account.email}: {total_saved}\n'))