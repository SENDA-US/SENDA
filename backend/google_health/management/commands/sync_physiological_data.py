from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import models
from datetime import datetime, timedelta
import requests

from google_health.services import GoogleAuthService
from google_health.models import (
    Alert, GoogleAccount, Assignment, PhysiologicalData,
    SyncLog, VariableType, AlertType, trigger_alert
)

API_BASE = "https://health.googleapis.com/v4/users/me/dataTypes"

DAILY_AGGREGATE_VARIABLES = [VariableType.STEPS, VariableType.DISTANCE]


from google_health.tasks import (
    extract_sleep,
    extract_heart_rate,
    extract_daily_resting_heart_rate,
    extract_daily_hrv,
    extract_respiratory_rate,
    extract_heart_rate_zones,
    extract_active_zone_minutes,
    extract_steps,
    extract_distance,
    ENDPOINTS,
)

ALL_VARIABLE_TYPES = [choice[0] for choice in VariableType.choices]


class Command(BaseCommand):
    help = 'Descarga variables fisiológicas de Google Health para una o todas las cuentas activas'

    def add_arguments(self, parser):
        parser.add_argument('--email', type=str, default=None)
        parser.add_argument('--variables', type=str, nargs='+', default=None,
                             choices=ALL_VARIABLE_TYPES)

    def handle(self, *args, **options):
        email = options.get('email')
        requested_variables = options.get('variables')

        accounts = GoogleAccount.objects.all()
        if email:
            accounts = accounts.filter(email=email)
            if not accounts.exists():
                self.stdout.write(self.style.ERROR(f'No existe ninguna cuenta con el correo {email}'))
                return
        elif not accounts.exists():
            self.stdout.write(self.style.ERROR('No hay cuentas de Google registradas.'))
            return

        target_endpoints = ENDPOINTS
        variable_filter = set(requested_variables) if requested_variables else None

        now = timezone.now()

        for account in accounts:
            self.stdout.write(f'\nProcesando cuenta: {account.email} ({account.participant.participant_code})')

            success = GoogleAuthService.refresh_access_token(account)
            if not success:
                self.stdout.write(self.style.ERROR(f'Fallo al refrescar token para {account.email}'))
                SyncLog.objects.create(google_account=account, result='TOKEN_ERROR', downloaded_records=0)
                continue

            assignment = Assignment.objects.filter(
                participant=account.participant,
                start_date__lte=now,
            ).filter(
                models.Q(estimated_end_date__isnull=True) | models.Q(estimated_end_date__gte=now)
            ).first()

            if not assignment:
                self.stdout.write(self.style.WARNING(
                    f'El participante {account.participant.participant_code} no tiene asignación activa ahora mismo.'
                ))
                continue

            headers = {"Authorization": f"Bearer {account.access_token}"}

            total_downloaded = 0
            daily_totals = {}
            heart_rate_buckets = {}

            for endpoint in target_endpoints:
                url = f"{API_BASE}/{endpoint['endpoint_path']}/dataPoints"

                # Paginación + filtro de fecha (últimos 2 días por seguridad)
                base_params = {}
                endpoint_path = endpoint['endpoint_path']
                dos_dias_atras = now - timedelta(days=2)
                fecha_filtro = dos_dias_atras.strftime('%Y-%m-%dT%H:%M:%SZ')

                if endpoint_path in ['steps', 'distance']:
                    filter_field = f"{endpoint['data_key']}.interval.civil_start_time"
                    base_params['filter'] = f'{filter_field} >= "{dos_dias_atras.date().isoformat()}"'
                elif endpoint_path == 'heart-rate':
                    # Retrocedemos 2 min para volver a descargar el último minuto completo
                    since_hr = (since - timedelta(minutes=2)).strftime('%Y-%m-%dT%H:%M:%SZ')
                    base_params['filter'] = f'heart_rate.sample_time.physical_time >= "{since_hr}"'

                all_points = []
                next_page_token = None
                page_count = 0
                endpoint_failed = False

                while True:
                    page_count += 1
                    if page_count > 500:
                        break

                    params = dict(base_params)
                    if next_page_token:
                        params['pageToken'] = next_page_token

                    try:
                        response = requests.get(url, headers=headers, params=params, timeout=30)
                    except requests.RequestException as e:
                        self.stdout.write(self.style.ERROR(f" -> {endpoint_path}: {e}"))
                        endpoint_failed = True
                        break

                    if response.status_code != 200:
                        self.stdout.write(self.style.ERROR(
                            f" -> Error al consultar {endpoint_path}: {response.status_code}"
                        ))
                        endpoint_failed = True
                        break

                    data = response.json()
                    page_points = data.get('dataPoints', [])
                    all_points.extend(page_points)
                    next_page_token = data.get('nextPageToken')

                    if not next_page_token:
                        break

                if endpoint_failed:
                    continue

                endpoint_downloaded = 0

                for point in all_points:
                    device_info = point.get('dataSource', {}).get('device', {})
                    device_name = device_info.get('displayName', 'Fitbit Device')
                    platform = point.get('dataSource', {}).get('platform', 'FITBIT')
                    recording_method = point.get('dataSource', {}).get('recordingMethod', 'UNKNOWN')

                    payload = point.get(endpoint['data_key'], point)
                    extracted = endpoint['extractor'](payload, now)

                    for variable_type, physical_time, metric_value, start_time, end_time in extracted:
                        if variable_filter and variable_type not in variable_filter:
                            continue
                        if physical_time is None or metric_value is None:
                            continue

                        # HEART_RATE → bucket por minuto
                        if variable_type == VariableType.HEART_RATE:
                            minute_dt = physical_time.replace(second=0, microsecond=0)
                            key = (assignment.id, minute_dt)
                            if key not in heart_rate_buckets:
                                heart_rate_buckets[key] = {
                                    'values': [],
                                    'device_name': device_name,
                                    'platform': platform,
                                    'recording_method': recording_method,
                                }
                            heart_rate_buckets[key]['values'].append(float(metric_value))
                            endpoint_downloaded += 1
                            continue

                        # STEPS/DISTANCE → agregación diaria
                        if variable_type in DAILY_AGGREGATE_VARIABLES:
                            day_date = start_time.date() if start_time else physical_time.date()
                            key = (variable_type, day_date)
                            if key not in daily_totals:
                                daily_totals[key] = {
                                    'sum': 0.0,
                                    'earliest_start': start_time or physical_time,
                                    'latest_end': end_time or physical_time,
                                    'device_name': device_name,
                                    'platform': platform,
                                    'recording_method': recording_method,
                                }
                            daily_totals[key]['sum'] += float(metric_value)
                        else:
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
                        endpoint_downloaded += 1

                total_downloaded += endpoint_downloaded
                self.stdout.write(self.style.SUCCESS(
                    f" -> {endpoint['endpoint_path']}: {endpoint_downloaded} registros"
                ))

            # Guardar HEART_RATE agregado
            hr_saved = 0
            for (assignment_id, minute_dt), info in heart_rate_buckets.items():
                values = info['values']
                if not values:
                    continue
                avg_value = sum(values) / len(values)
                PhysiologicalData.objects.update_or_create(
                    assignment_id=assignment_id,
                    variable_type=VariableType.HEART_RATE,
                    physical_time=minute_dt,
                    defaults={
                        'metric_value': round(avg_value, 1),
                        'start_time': minute_dt,
                        'end_time': minute_dt,
                        'device_name': info['device_name'],
                        'platform': info['platform'],
                        'recording_method': info['recording_method'],
                    }
                )
                hr_saved += 1
            if hr_saved:
                self.stdout.write(self.style.SUCCESS(f" -> HEART_RATE: {hr_saved} minutos agregados"))

            # Guardar STEPS/DISTANCE agregados
            for (variable_type, day_date), info in daily_totals.items():
                naive_end = datetime.combine(day_date, datetime.max.time().replace(microsecond=0))
                physical_time_to_save = timezone.make_aware(naive_end, timezone.get_current_timezone())
                PhysiologicalData.objects.update_or_create(
                    assignment=assignment,
                    variable_type=variable_type,
                    physical_time__date=day_date,
                    defaults={
                        'metric_value': info['sum'],
                        'physical_time': physical_time_to_save,
                        'start_time': info['earliest_start'],
                        'end_time': info['latest_end'],
                        'device_name': info['device_name'],
                        'platform': info['platform'],
                        'recording_method': info['recording_method'],
                    }
                )

            SyncLog.objects.create(
                google_account=account,
                result='SUCCESS',
                downloaded_records=total_downloaded
            )
            self.stdout.write(self.style.SUCCESS(f'Total registros guardados: {total_downloaded}'))