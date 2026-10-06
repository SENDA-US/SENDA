from django.core.management.base import BaseCommand
from django.utils import timezone
from django.db import models 
from datetime import datetime, timedelta, timezone as dt_timezone
import requests

from google_health.services import GoogleAuthService
from google_health.models import (
    GoogleAccount, Assignment, PhysiologicalData, VariableType
)

API_BASE = "https://health.googleapis.com/v4/users/me/dataTypes"

DAILY_AGGREGATE_VARIABLES = {
    VariableType.STEPS: "steps",
    VariableType.DISTANCE: "distance",
}


def parse_time(value, fallback):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')) if value else fallback
    except Exception:
        return fallback


def fetch_all_pages(url, headers, params=None):
    """Descarga todos los dataPoints paginados de un endpoint."""
    all_points = []
    next_page_token = None

    while True:
        query_params = dict(params or {})
        if next_page_token:
            query_params['pageToken'] = next_page_token

        response = requests.get(url, headers=headers, params=query_params, timeout=30)
        if response.status_code != 200:
            print(f"  [ERROR] {response.status_code}: {response.text[:200]}")
            break

        data = response.json()
        all_points.extend(data.get('dataPoints', []))
        next_page_token = data.get('nextPageToken')

        if not next_page_token:
            break

    return all_points


class Command(BaseCommand):
    help = 'Reprocesa los totales diarios de STEPS y DISTANCE para un rango de fechas'

    def add_arguments(self, parser):
        parser.add_argument('--from', dest='date_from', type=str, required=True,
                            help='Fecha inicio en formato YYYY-MM-DD')
        parser.add_argument('--to', dest='date_to', type=str, required=True,
                            help='Fecha fin en formato YYYY-MM-DD')
        parser.add_argument('--email', type=str, default=None,
                            help='Email del participante (opcional)')

    def handle(self, *args, **options):
        date_from = datetime.strptime(options['date_from'], '%Y-%m-%d').date()
        date_to = datetime.strptime(options['date_to'], '%Y-%m-%d').date()
        email = options.get('email')

        accounts = GoogleAccount.objects.filter(authentication_status='ACTIVE')
        if email:
            accounts = accounts.filter(email=email)

        if not accounts.exists():
            self.stdout.write(self.style.ERROR('No hay cuentas activas'))
            return

        now = timezone.now()

        for account in accounts:
            self.stdout.write(f'\n=== Procesando {account.email} ===')

            # Refrescar token
            if not GoogleAuthService.refresh_access_token(account):
                self.stdout.write(self.style.ERROR('  Token inválido'))
                continue

            assignment = Assignment.objects.filter(
                participant=account.participant,
                start_date__lte=now,
            ).filter(
                models.Q(estimated_end_date__isnull=True) |
                models.Q(estimated_end_date__gte=now)
            ).first()

            if not assignment:
                self.stdout.write(self.style.WARNING('  Sin asignación activa'))
                continue

            headers = {"Authorization": f"Bearer {account.access_token}"}

            # Iterar día por día
            current = date_from
            while current <= date_to:
                self.stdout.write(f'\n  Día {current}:')
                next_day = current + timedelta(days=1)

                for variable_type, endpoint in DAILY_AGGREGATE_VARIABLES.items():
                    # 1. Borrar registros existentes de ese día
                    deleted, _ = PhysiologicalData.objects.filter(
                        assignment=assignment,
                        variable_type=variable_type,
                        physical_time__date=current,
                    ).delete()
                    if deleted:
                        self.stdout.write(f'    [{variable_type}] Borrados {deleted} registros antiguos')

                    # 2. Consultar API con paginación
                    #    Usamos civil_start_time para agrupar por día local (lo que ve el usuario)
                    url = f"{API_BASE}/{endpoint}/dataPoints"
                    filter_field = f"{endpoint}.interval.civil_start_time"
                    params = {
                        # El formato civil es YYYY-MM-DD, sin hora ni zona horaria
                        'filter': f'{filter_field} >= "{current.isoformat()}" AND {filter_field} < "{next_day.isoformat()}"'
                    }

                    points = fetch_all_pages(url, headers, params)
                    if not points:
                        self.stdout.write(f'    [{variable_type}] Sin datos para este día')
                        continue

                    # 3. Sumar todos los valores
                    total = 0.0
                    earliest_start = None
                    latest_end = None
                    device_name = 'Fitbit Device'
                    platform = 'FITBIT'
                    recording_method = 'UNKNOWN'

                    for point in points:
                        payload = point.get(endpoint, point)
                        interval = payload.get('interval', {})
                        start = parse_time(interval.get('startTime'), None)
                        end = parse_time(interval.get('endTime'), None)

                        if variable_type == VariableType.STEPS:
                            value = float(payload.get('count', 0))
                        else:  # DISTANCE
                            mm = payload.get('millimeters', 0)
                            value = float(mm) / 1_000_000.0

                        total += value

                        if start and (earliest_start is None or start < earliest_start):
                            earliest_start = start
                        if end and (latest_end is None or end > latest_end):
                            latest_end = end

                        ds = point.get('dataSource', {})
                        device_name = ds.get('device', {}).get('displayName', device_name)
                        platform = ds.get('platform', platform)
                        recording_method = ds.get('recordingMethod', recording_method)

                    # 4. Guardar un único registro por día
                    # physical_time = 23:59:59 del día local, convertido a UTC
                    # Construimos un datetime naive a las 23:59:59 y lo hacemos aware
                    naive_end = datetime.combine(current, datetime.max.time().replace(microsecond=0))
                    end_of_day = timezone.make_aware(naive_end, timezone.get_current_timezone())

                    PhysiologicalData.objects.create(
                        assignment=assignment,
                        variable_type=variable_type,
                        physical_time=end_of_day,
                        metric_value=total,
                        start_time=earliest_start,
                        end_time=latest_end,
                        device_name=device_name,
                        platform=platform,
                        recording_method=recording_method,
                    )
                    self.stdout.write(self.style.SUCCESS(
                        f'    [{variable_type}] {total} ({len(points)} puntos) '
                        f'de {earliest_start} a {latest_end}'
                    ))

                current += timedelta(days=1)

            self.stdout.write(self.style.SUCCESS(f'\n=== Completado {account.email} ==='))