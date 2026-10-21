from celery import shared_task
from django.utils import timezone
from django.db import models
from datetime import datetime, timedelta, timezone as dt_timezone
from django.core.management import call_command

import requests

from google_health.services import GoogleAuthService
from google_health.models import (
    Alert, GoogleAccount, Assignment, PhysiologicalData,
    SyncLog, SyncCursor, VariableType, AlertType, AlertPriority, activate_alert, resolve_alert_automatically
)

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMultiAlternatives

User = get_user_model()

API_BASE = "https://health.googleapis.com/v4/users/me/dataTypes"

# Variables que se acumulan como total diario 
DAILY_AGGREGATE_VARIABLES = [VariableType.STEPS, VariableType.DISTANCE]


def parse_time(value, fallback):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')) if value else fallback
    except Exception:
        return fallback


def extract_sleep(point, now):
    interval = point.get('interval', {})
    summary = point.get('summary', {})
    start_time = parse_time(interval.get('startTime'), now)
    end_time = parse_time(interval.get('endTime'), now)
    results = []

    def add_summary_field(field_name, variable_type):
        raw = summary.get(field_name)
        val = float(raw) if raw is not None and float(raw) > 0 else None
        if field_name in summary:
            results.append((variable_type, start_time, val, start_time, end_time))

    add_summary_field('minutesInSleepPeriod', VariableType.SLEEP_DURATION)
    add_summary_field('minutesAsleep', VariableType.SLEEP_MINUTES_ASLEEP)          
    add_summary_field('minutesAwake', VariableType.SLEEP_AWAKE)
    add_summary_field('minutesAfterWakeUp', VariableType.SLEEP_AFTER_WAKE_UP)   
    add_summary_field('minutesToFallAsleep', VariableType.SLEEP_MINUTES_TO_FALL_ASLEEP)

    # Fases del sueño (Light, Deep, REM)
    stage_map = {
        'LIGHT': VariableType.SLEEP_LIGHT,
        'DEEP': VariableType.SLEEP_DEEP,
        'REM': VariableType.SLEEP_REM,
    }
    for stage in summary.get('stagesSummary', []):
        stage_type = stage.get('type')
        if stage_type in stage_map:
            raw_minutes = stage.get('minutes')
            minutes_val = float(raw_minutes) if raw_minutes is not None and float(raw_minutes) > 0 else None
            results.append((stage_map[stage_type], start_time, minutes_val, start_time, end_time))

    # Hora de inicio y fin 
    if start_time:
        results.append((VariableType.SLEEP_START, start_time, None, start_time, end_time))
    if end_time:
        results.append((VariableType.SLEEP_END, end_time, None, start_time, end_time))

    return results


def extract_heart_rate(point, now):
    sample_time_str = point.get('sampleTime', {}).get('physicalTime')
    physical_time = parse_time(sample_time_str, now)
    raw_value = point.get('beatsPerMinute')
    value = float(raw_value) if raw_value is not None and float(raw_value) > 0 else None
    return [(VariableType.HEART_RATE, physical_time, value, physical_time, physical_time)]


def extract_daily_resting_heart_rate(point, now):
    date_info = point.get('date', {})
    year = date_info.get('year', now.year)
    month = date_info.get('month', now.month)
    day = date_info.get('day', now.day)
    
    # Esta variable no tieme DateTime sino Date únicamente 
    from datetime import timezone as dt_timezone
    day_dt = datetime(year, month, day, 0, 0, 0, tzinfo=dt_timezone.utc)
    
    raw_value = point.get('beatsPerMinute')
    value = float(raw_value) if raw_value is not None and float(raw_value) > 0 else None
    return [(VariableType.HEART_RATE_RESTING, day_dt, value, None, None)]

def extract_daily_hrv(point, now):
    date_info = point.get('date', {})
    day_dt = datetime(
        date_info.get('year', now.year),
        date_info.get('month', now.month),
        date_info.get('day', now.day),
        tzinfo=now.tzinfo
    )
    results = []

    # averageHeartRateVariabilityMilliseconds -> HRV_AVERAGE_MS
    avg_hrv = point.get('averageHeartRateVariabilityMilliseconds')
    if avg_hrv is not None and float(avg_hrv) > 0:
        results.append((VariableType.HRV_AVERAGE_MS, day_dt, float(avg_hrv), None, None))

    # entropy -> HRV_ENTROPY
    entropy = point.get('entropy')
    if entropy is not None and float(entropy) > 0:
        results.append((VariableType.HRV_ENTROPY, day_dt, float(entropy), None, None))

    # nonRemHeartRateBeatsPerMinute -> HRV_NON_REM_HR
    non_rem_hr = point.get('nonRemHeartRateBeatsPerMinute')
    if non_rem_hr is not None and float(non_rem_hr) > 0:
        results.append((VariableType.HRV_NON_REM_HR, day_dt, float(non_rem_hr), None, None))

    # deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds -> HRV_RMSSD
    rmssd = point.get('deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds')
    if rmssd is not None and float(rmssd) > 0:
        results.append((VariableType.HRV_RMSSD, day_dt, float(rmssd), None, None))

    return results


def extract_respiratory_rate(point, now):
    summary = point.get('respiratoryRateSleepSummary', point)    
    sample_time_str = summary.get('sampleTime', {}).get('physicalTime')
    physical_time = parse_time(sample_time_str, now)
    results = []

    stats_mapping = [
        ('fullSleepStats', VariableType.RESPIRATORY_RATE_NOCTURNAL),
        ('lightSleepStats', VariableType.RESPIRATORY_RATE_LIGHT),
        ('deepSleepStats', VariableType.RESPIRATORY_RATE_DEEP),
        ('remSleepStats', VariableType.RESPIRATORY_RATE_REM),
    ]

    for stat_key, var_type in stats_mapping:
        stat_data = summary.get(stat_key, {})
        raw_value = stat_data.get('breathsPerMinute')
        value = float(raw_value) if raw_value is not None and float(raw_value) > 0 else None
        
        if value is not None and physical_time:
            results.append((var_type, physical_time, value, physical_time, physical_time))

    return results


def extract_heart_rate_zones(point, now):
    date_info = point.get('date', {})
    day = datetime(
        date_info.get('year', now.year),
        date_info.get('month', now.month),
        date_info.get('day', now.day),
        tzinfo=now.tzinfo
    )
    zones = point.get('heartRateZones', [])
    zone_map = {
        'LIGHT': VariableType.HR_ZONE_FAT_BURN,
        'MODERATE': VariableType.HR_ZONE_CARDIO,
        'PEAK': VariableType.HR_ZONE_PEAK,
    }

    results = []
    for zone in zones:
        zone_type = zone.get('heartRateZoneType')
        if zone_type in zone_map:
            raw_minutes = zone.get('minutes', zone.get('durationMinutes'))
            minutes = float(raw_minutes) if raw_minutes is not None and float(raw_minutes) > 0 else None
            results.append((zone_map[zone_type], day, minutes, None, None))

    return results


def extract_active_zone_minutes(point, now):
    interval = point.get('interval', {})
    start_time = parse_time(interval.get('startTime'), now)
    end_time = parse_time(interval.get('endTime'), now)    
    heart_rate_zone = point.get('heartRateZone')
    
    zone_map = {
        'FAT_BURN': VariableType.HR_ZONE_FAT_BURN,
        'CARDIO': VariableType.HR_ZONE_CARDIO,
        'PEAK': VariableType.HR_ZONE_PEAK,
    }
    
    variable_type = zone_map.get(heart_rate_zone, VariableType.ACTIVE_ZONE_MINUTES)
    
    raw_value = point.get('activeZoneMinutes')
    value = float(raw_value) if raw_value is not None and float(raw_value) > 0 else None
    
    if value is None:
        return []
        
    return [(variable_type, start_time, value, start_time, end_time)]


def extract_steps(point, now):
    interval = point.get('interval', {})
    start_time = parse_time(interval.get('startTime'), now)
    end_time = parse_time(interval.get('endTime'), now)
    raw_value = point.get('count')
    value = float(raw_value) if raw_value is not None and float(raw_value) > 0 else None
    return [(VariableType.STEPS, start_time, value, start_time, end_time)]


def extract_distance(point, now):
    interval = point.get('interval', {})
    start_time = parse_time(interval.get('startTime'), now)
    end_time = parse_time(interval.get('endTime'), now)
    millimeters = point.get('millimeters')
    
    value = (
        float(millimeters) / 1_000_000.0
        if millimeters is not None and float(millimeters) > 0
        else None
    )
    return [(VariableType.DISTANCE, start_time, value, start_time, end_time)]


ENDPOINTS = [
    {"endpoint_path": "sleep", "data_key": "sleep", "extractor": extract_sleep},
    {"endpoint_path": "steps", "data_key": "steps", "extractor": extract_steps},
    {"endpoint_path": "distance", "data_key": "distance", "extractor": extract_distance},
    {"endpoint_path": "heart-rate", "data_key": "heartRate", "extractor": extract_heart_rate},
    {"endpoint_path": "daily-resting-heart-rate", "data_key": "dailyRestingHeartRate", "extractor": extract_daily_resting_heart_rate},
    {"endpoint_path": "daily-heart-rate-variability", "data_key": "dailyHeartRateVariability", "extractor": extract_daily_hrv},
    {"endpoint_path": "respiratory-rate-sleep-summary", "data_key": "respiratoryRateSleepSummary", "extractor": extract_respiratory_rate},
    {"endpoint_path": "daily-heart-rate-zones", "data_key": "dailyHeartRateZones", "extractor": extract_heart_rate_zones},
    {"endpoint_path": "active-zone-minutes", "data_key": "activeZoneMinutes", "extractor": extract_active_zone_minutes},
]


def calculate_wear_time_hours(assignment, day_date):
    """
    Calcula las horas totales de uso de la pulsera en base al primer y último registro del día
    o a la suma de los intervalos registrados.
    """
    records = PhysiologicalData.objects.filter(
        assignment=assignment,
        physical_time__date=day_date
    ).exclude(variable_type__in=[VariableType.SLEEP_START, VariableType.SLEEP_END])

    if not records.exists():
        return 0.0

    # Lógica estimada basada en la diferencia entre el primer y último registro del día
    earliest = records.order_by('physical_time').first().physical_time
    latest = records.order_by('-physical_time').first().physical_time
    
    diff_hours = (latest - earliest).total_seconds() / 3600.0
    return min(diff_hours, 24.0)

def get_device_battery(account, headers):
    """
    Consulta el endpoint pairedDevices de Google Health para obtener
    el nivel de batería del dispositivo emparejado.
    
    Devuelve un diccionario con:
      - battery_level: int (0-100) o None
      - battery_status: str ('High', 'Medium', 'Low', 'Empty') o None
      - device_name: str o None
    """
    try:
        url = "https://health.googleapis.com/v4/users/me/pairedDevices"
        response = requests.get(url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            return {'battery_level': None, 'battery_status': None, 'device_name': None}
        
        data = response.json()
        devices = data.get('pairedDevices', [])
        
        if not devices:
            return {'battery_level': None, 'battery_status': None, 'device_name': None}
        
        # Cogemos el primer dispositivo (normalmente solo hay uno)
        device = devices[0]
        
        return {
            'battery_level': device.get('batteryLevel'),
            'battery_status': device.get('batteryStatus'),
            'device_name': device.get('deviceVersion'),
        }
    except Exception:
        return {'battery_level': None, 'battery_status': None, 'device_name': None}


def evaluate_data_alerts(account, assignment, now, headers):

    today = now.date()

    # =========================================================
    # PARTICIPANTE SIN REGISTROS
    # =========================================================

    has_records = PhysiologicalData.objects.filter(
    assignment=assignment
).exists()

    if not has_records:
        activate_alert(
            AlertType.NO_RECORDS,
            google_account=account,
            assignment=assignment,
            details={
                'reason': 'No existen registros fisiológicos para esta asignación.'
            }
        )
    else:
        resolve_alert_automatically(
            AlertType.NO_RECORDS,
            google_account=account,
            assignment=assignment
        )


    # =========================================================
    # SIN DATOS DURANTE MÁS DE 24 HORAS
    # =========================================================

    last_record = (
        PhysiologicalData.objects
        .filter(assignment=assignment)
        .order_by('-physical_time')
        .first()
    )

    if last_record:
        time_diff = now - last_record.physical_time

        if time_diff.total_seconds() > 86400:
            activate_alert(
                AlertType.NO_DATA_24H,
                google_account=account,
                assignment=assignment,
                details={
                    'last_record_at': last_record.physical_time.isoformat(),
                    'hours_without_data': round(
                        time_diff.total_seconds() / 3600,
                        1
                    ),
                }
            )
        else:
            resolve_alert_automatically(
                AlertType.NO_DATA_24H,
                google_account=account,
                assignment=assignment
            )

    # =========================================================
    # PULSERA POSIBLEMENTE APAGADA
    # =========================================================

    recent_threshold = now - timedelta(hours=2)

    recent_records = PhysiologicalData.objects.filter(
        assignment=assignment,
        physical_time__gte=recent_threshold
    ).exists()

    if not recent_records:

        activate_alert(
            AlertType.DEVICE_OFF,
            google_account=account,
            assignment=assignment,
        )

    else:

        resolve_alert_automatically(
            AlertType.DEVICE_OFF,
            google_account=account,
            assignment=assignment,
        )

    # =========================================================
    # HRV NO DISPONIBLE - Solo comprobar después del mediodía
    # =========================================================

    if now.hour >= 12:

        hrv_exists = PhysiologicalData.objects.filter(
            assignment=assignment,
            variable_type=VariableType.HRV_AVERAGE_MS,
            physical_time__date=today
        ).exists()

        if not hrv_exists:

            activate_alert(
                AlertType.HRV_UNAVAILABLE,
                google_account=account,
                assignment=assignment,
            )

        else:

            resolve_alert_automatically(
                AlertType.HRV_UNAVAILABLE,
                google_account=account,
                assignment=assignment,
            )

    # =========================================================
    # SUEÑO INSUFICIENTE
    # =========================================================

    MINIMUM_SLEEP_MINUTES = 420

    sleep_record = (
        PhysiologicalData.objects
        .filter(
            assignment=assignment,
            variable_type=VariableType.SLEEP_DURATION,
            physical_time__date=today
        )
        .order_by('-physical_time')
        .first()
    )

    if sleep_record and sleep_record.metric_value is not None:

        if sleep_record.metric_value < MINIMUM_SLEEP_MINUTES:

            activate_alert(
                AlertType.INSUFFICIENT_SLEEP,
                google_account=account,
                assignment=assignment,
            )

        else:

            resolve_alert_automatically(
                AlertType.INSUFFICIENT_SLEEP,
                google_account=account,
                assignment=assignment,
            )

    # =========================================================
    # TIEMPO DE USO INSUFICIENTE
    # Solo comprobar al final del día
    # =========================================================

    if now.hour >= 20:

        wear_time_hours = calculate_wear_time_hours(
            assignment,
            today
        )

        if wear_time_hours < 18:

            activate_alert(
                AlertType.INSUFFICIENT_USAGE,
                google_account=account,
                assignment=assignment,
            )

        else:

            resolve_alert_automatically(
                AlertType.INSUFFICIENT_USAGE,
                google_account=account,
                assignment=assignment,
            )
    
    # =========================================================
    # BATERÍA BAJA (<20%)
    # =========================================================

    battery_info = get_device_battery(account, headers)
    battery_level = battery_info.get('battery_level')

    if battery_level is not None:
        if battery_level < 20:
            activate_alert(
                AlertType.LOW_BATTERY,
                google_account=account,
                assignment=assignment,
                details={
                    'battery_level': battery_level,
                    'battery_status': battery_info.get('battery_status'),
                    'device_name': battery_info.get('device_name'),
                }
            )
        else:
            resolve_alert_automatically(
                AlertType.LOW_BATTERY,
                google_account=account,
                assignment=assignment,
            )


@shared_task(time_limit=1800, soft_time_limit=1500, max_retries=0)
def sync_all_users_data():
    accounts = GoogleAccount.objects.filter(authentication_status='ACTIVE')
    now = timezone.now()

    for account in accounts:
        assignment = Assignment.objects.filter(
            participant=account.participant,
            start_date__lte=now,
            real_end_date__isnull=True
        ).first()

        if not assignment:
            continue

        try:
            success = GoogleAuthService.refresh_access_token(account)
            if not success:
                activate_alert(AlertType.TOKEN_EXPIRED, google_account=account, assignment=assignment)
                last_error = SyncLog.objects.filter(
                    google_account=account, result='TOKEN_ERROR'
                ).order_by('-sync_date').first()
                if not last_error or (now - last_error.sync_date) > timedelta(hours=1):
                    SyncLog.objects.create(
                        google_account=account, result='TOKEN_ERROR', downloaded_records=0
                    )
                continue

            resolve_alert_automatically(AlertType.TOKEN_EXPIRED, google_account=account, assignment=assignment)

            headers = {"Authorization": f"Bearer {account.access_token}"}

            total_downloaded = 0
            successful_endpoints = 0
            daily_totals = {}
            heart_rate_buckets = {}   

            for endpoint in ENDPOINTS:
                url = f"{API_BASE}/{endpoint['endpoint_path']}/dataPoints"

                cursor, _ = SyncCursor.objects.get_or_create(
                    google_account=account,
                    endpoint=endpoint['endpoint_path'],
                )

                all_points = []
                next_page_token = None
                endpoint_failed = False
                token_invalid = False
                page_count = 0
                MAX_PAGES = 5000
                max_seen_time = cursor.last_synced_at

                base_params = {}
                endpoint_path = endpoint['endpoint_path']

                if cursor.last_synced_at:
                    since = cursor.last_synced_at
                else:
                    since = now - timedelta(days=90)

                fecha_filtro = since.strftime('%Y-%m-%dT%H:%M:%SZ')

                if endpoint_path in ['steps', 'distance']:
                    sync_start_date = timezone.localtime(now).date() - timedelta(days=2)
                    filter_field = f"{endpoint['data_key']}.interval.civil_start_time"
                    base_params['filter'] = f'{filter_field} >= "{sync_start_date.isoformat()}"'
                elif endpoint_path == 'heart-rate':
                    # Retrocedemos 2 min para volver a descargar el último minuto completo
                    since_hr = (since - timedelta(minutes=2)).strftime('%Y-%m-%dT%H:%M:%SZ')
                    base_params['filter'] = f'heart_rate.sample_time.physical_time >= "{since_hr}"'
                elif endpoint_path == 'active-zone-minutes':
                    base_params['filter'] = f'active_zone_minutes.interval.start_time >= "{fecha_filtro}"'
                elif endpoint_path == 'daily-heart-rate-zones':
                    hace_90_dias = (timezone.localtime(now) - timedelta(days=90)).date()
                    base_params['filter'] = f'daily_heart_rate_zones.date >= "{hace_90_dias.isoformat()}"'

                while True:
                    page_count += 1
                    if page_count > MAX_PAGES:
                        print(f"[WARN] {endpoint_path}: {MAX_PAGES} páginas alcanzadas")
                        break

                    params = dict(base_params)
                    if next_page_token:
                        params['pageToken'] = next_page_token

                    try:
                        response = requests.get(url, headers=headers, params=params, timeout=30)
                    except requests.RequestException as e:
                        print(f"[ERROR] {endpoint_path}: requests falló: {e}")
                        endpoint_failed = True
                        break

                    if response.status_code in [401, 403]:
                        token_invalid = True
                        break

                    if response.status_code != 200:
                        print(f"[ERROR] {endpoint_path}: HTTP {response.status_code}")
                        endpoint_failed = True
                        break

                    try:
                        data = response.json()
                    except ValueError:
                        print(f"[ERROR] {endpoint_path}: JSON inválido")
                        endpoint_failed = True
                        break

                    page_points = data.get('dataPoints', [])
                    all_points.extend(page_points)

                    for p in page_points:
                        pt = None
                        if endpoint_path == 'heart-rate':
                            pt_str = p.get('heartRate', {}).get('sampleTime', {}).get('physicalTime')
                        elif endpoint_path in ['steps', 'distance']:
                            inner = p.get(endpoint['data_key'], {})
                            interval = inner.get('interval', {})
                            pt_str = interval.get('endTime') or interval.get('startTime')
                        else:
                            pt_str = (
                                p.get('sampleTime', {}).get('physicalTime')
                                or p.get('interval', {}).get('endTime')
                                or p.get('interval', {}).get('startTime')
                            )
                        if pt_str:
                            pt = parse_time(pt_str, None)
                            if pt and (max_seen_time is None or pt > max_seen_time):
                                max_seen_time = pt

                    next_page_token = data.get('nextPageToken')

                    if page_count == 1 or page_count % 10 == 0:
                        print(f"[{endpoint_path}] pág {page_count}, total {len(all_points)}")

                    if not next_page_token:
                        break

                if token_invalid:
                    activate_alert(AlertType.TOKEN_EXPIRED, google_account=account, assignment=assignment)
                    break

                if endpoint_failed:
                    continue

                if max_seen_time:
                    cursor.last_synced_at = max_seen_time
                cursor.last_sync_started_at = now
                cursor.last_sync_finished_at = timezone.now()
                cursor.last_sync_records = len(all_points)
                cursor.save()

                successful_endpoints += 1

                points = all_points
                endpoint_downloaded = 0

                for point in points:
                    device_info = point.get('dataSource', {}).get('device', {})
                    device_name = device_info.get('displayName') or 'Fitbit Device'
                    platform = point.get('dataSource', {}).get('platform') or 'FITBIT'
                    recording_method = point.get('dataSource', {}).get('recordingMethod') or 'UNKNOWN'

                    payload = point.get(endpoint['data_key'], point)
                    extracted = endpoint['extractor'](payload, now)

                    for (variable_type, physical_time, metric_value, start_time, end_time) in extracted:
                        if physical_time is None:
                            continue

                        if (metric_value is None and variable_type not in
                                [VariableType.SLEEP_START, VariableType.SLEEP_END]):
                            continue

                        if variable_type == VariableType.HEART_RATE:
                            minute_dt = physical_time.replace(second=0, microsecond=0)
                            bucket_key = (assignment.id, minute_dt)
                            if bucket_key not in heart_rate_buckets:
                                heart_rate_buckets[bucket_key] = {
                                    'values': [],
                                    'device_name': device_name,
                                    'platform': platform,
                                    'recording_method': recording_method,
                                }
                            heart_rate_buckets[bucket_key]['values'].append(float(metric_value))
                            endpoint_downloaded += 1
                            continue
                        # 

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

                            candidate_start = start_time or physical_time
                            candidate_end = end_time or physical_time

                            if candidate_start < daily_totals[key]['earliest_start']:
                                daily_totals[key]['earliest_start'] = candidate_start
                            if candidate_end > daily_totals[key]['latest_end']:
                                daily_totals[key]['latest_end'] = candidate_end

                        else:
                            PhysiologicalData.objects.get_or_create(
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

            # =====================================================
            # 3b. GUARDAR HEART_RATE AGREGADO POR MINUTO 
            # =====================================================
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
                print(f"[HEART_RATE] Guardados {hr_saved} minutos agregados (de {sum(len(v['values']) for v in heart_rate_buckets.values())} muestras crudas)")


            # =====================================================
            # 4. GUARDAR TOTALES DIARIOS DE STEPS Y DISTANCE
            # =====================================================

            sync_time = timezone.now()
            today_local = timezone.localtime(sync_time).date()

            for (variable_type, day_date), info in daily_totals.items():
                if (today_local - day_date).days > 2:
                    continue
                if day_date < today_local:
                    # Día pasado: usar 23:59:59 del día local
                    naive_end = datetime.combine(day_date, datetime.max.time().replace(microsecond=0))
                    physical_time_to_save = timezone.make_aware(naive_end, timezone.get_current_timezone())
                else:
                    # Día actual: usar la hora actual
                    physical_time_to_save = sync_time

                # Buscar TODOS los registros del día para esta variable
                todos = list(PhysiologicalData.objects.filter(
                    assignment=assignment,
                    variable_type=variable_type,
                    physical_time__date=day_date
                ).order_by('id'))

                if todos:
                    # Actualiza el primero
                    existing = todos[0]
                    existing.metric_value = info['sum']
                    existing.physical_time = physical_time_to_save
                    existing.start_time = info['earliest_start']
                    existing.end_time = info['latest_end']
                    existing.device_name = info['device_name']
                    existing.platform = info['platform']
                    existing.recording_method = info['recording_method']
                    existing.save(update_fields=[
                        'metric_value', 'physical_time', 'start_time',
                        'end_time', 'device_name', 'platform', 'recording_method',
                    ])

                    # Borrar duplicados
                    ids_a_borrar = [r.id for r in todos[1:]]
                    if ids_a_borrar:
                        print(f"[INFO] Borrando {len(ids_a_borrar)} duplicados de {variable_type} en {day_date}")
                        PhysiologicalData.objects.filter(id__in=ids_a_borrar).delete()
                else:
                    # No existe, crear
                    PhysiologicalData.objects.create(
                        assignment=assignment,
                        variable_type=variable_type,
                        physical_time=physical_time_to_save,
                        metric_value=info['sum'],
                        start_time=info['earliest_start'],
                        end_time=info['latest_end'],
                        device_name=info['device_name'],
                        platform=info['platform'],
                        recording_method=info['recording_method'],
                    )

            # =====================================================
            # 5. RESULTADO DE LA SINCRONIZACIÓN (SIN CAMBIOS)
            # =====================================================
            if successful_endpoints == 0 and len(ENDPOINTS) > 0:
                activate_alert(AlertType.SYNC_ERROR, google_account=account, assignment=assignment)
                SyncLog.objects.create(google_account=account, result='TOTAL_ERROR', downloaded_records=total_downloaded)
            else:
                resolve_alert_automatically(AlertType.SYNC_ERROR, google_account=account, assignment=assignment)
                now_local = timezone.localtime(now)
                today_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
                today_start_utc = today_start_local.astimezone(dt_timezone.utc)
                already_logged_today = SyncLog.objects.filter(
                    google_account=account, result='SUCCESS', sync_date__gte=today_start_utc
                ).exists()
                if successful_endpoints > 0 and not already_logged_today:
                    SyncLog.objects.create(
                        google_account=account, result='SUCCESS', downloaded_records=total_downloaded
                    )

            # =====================================================
            # 6. EVALUAR ALERTAS (SIN CAMBIOS)
            # =====================================================
            evaluate_data_alerts(account=account, assignment=assignment, now=now, headers=headers)

        except Exception as e:
            import traceback
            print(f"[ERROR] sync_all_users_data falló para {account.email}: {e}")
            traceback.print_exc()
            activate_alert(AlertType.SYNC_ERROR, google_account=account, assignment=assignment)
            last_error = SyncLog.objects.filter(
                google_account=account, result__startswith='ERROR'
            ).order_by('-sync_date').first()
            if not last_error or (now - last_error.sync_date) > timedelta(hours=1):
                SyncLog.objects.create(
                    google_account=account,
                    result=f'ERROR: {str(e)[:100]}',
                    downloaded_records=0
                )

@shared_task(time_limit=300, soft_time_limit=270)
def close_previous_day_for_account(account_id, date_str):
    """
    Cierra STEPS/DISTANCE de un día concreto para UNA cuenta.
    """
    from google_health.models import GoogleAccount
    account = GoogleAccount.objects.filter(id=account_id).first()
    if not account:
        return
    try:
        call_command(
            'reprocess_daily_aggregates',
            '--from', date_str,
            '--to', date_str,
            '--email', account.email,
        )
        print(f'[CLOSE_DAY] {account.email} cerrado para {date_str}')
    except Exception as e:
        print(f'[CLOSE_DAY][ERROR] {account.email}: {e}')


@shared_task(time_limit=300, soft_time_limit=270)
def close_previous_day_aggregates():
    """
    Fan-out: lanza una tarea por cada cuenta activa para cerrar el día anterior.
    """
    yesterday = (timezone.localtime(timezone.now()).date() - timedelta(days=1)).isoformat()
    print(f'[CLOSE_DAY] Cerrando el día {yesterday} para todas las cuentas activas')

    account_ids = list(
        GoogleAccount.objects.filter(authentication_status='ACTIVE')
        .values_list('id', flat=True)
    )

    for account_id in account_ids:
        close_previous_day_for_account.delay(str(account_id), yesterday)

    print(f'[CLOSE_DAY] Lanzadas {len(account_ids)} tareas hijas')


import logging
logger = logging.getLogger(__name__)

@shared_task(
    bind=True,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={'max_retries': 3},
    time_limit=60,
)
def send_alert_email_task(self, alert_id):
    from google_health.models import Alert, GoogleAccount

    try:
        alert = Alert.objects.select_related(
            'assignment__participant',
            'assignment__fitbit',
            'google_account',
        ).get(id=alert_id)
    except Alert.DoesNotExist:
        logger.warning("[ALERT_EMAIL] Alerta %s ya no existe", alert_id)
        return

    # -------- Contexto --------
    participant_code = "N/A"
    fitbit_code      = "N/A"
    participant_email = None

    if alert.assignment:
        if alert.assignment.participant:
            participant_code = alert.assignment.participant.participant_code
        if alert.assignment.fitbit:
            fitbit_code = alert.assignment.fitbit.fitbit_code

    if alert.google_account and alert.google_account.email:
        participant_email = alert.google_account.email
    elif alert.assignment and alert.assignment.participant:
        gacc = GoogleAccount.objects.filter(
            participant=alert.assignment.participant
        ).first()
        if gacc:
            participant_email = gacc.email

    # -------- Destinatarios --------
    researcher_emails = list(
        User.objects.filter(is_active=True, is_superuser=False)
        .exclude(email='')
        .values_list('email', flat=True)
    )

    recipients = list(researcher_emails)
    if participant_email and participant_email not in recipients:
        recipients.append(participant_email)

    if not recipients:
        logger.warning("[ALERT_EMAIL] Alerta %s sin destinatarios", alert_id)
        return

    subject = f"[SENDA - Alerta] {alert.get_alert_type_display()} ({alert.priority})"

    text_content = (
        f"Se ha generado una nueva alerta en la plataforma SENDA.\n\n"
        f"Tipo: {alert.get_alert_type_display()}\n"
        f"Prioridad: {alert.priority}\n"
        f"Participante: {participant_code} (Dispositivo: {fitbit_code})\n"
        f"Mensaje: {alert.message}\n\n"
        f"Accede a la plataforma para gestionarla."
    )

    html_content = f"""... (usa la plantilla HTML que ya tienes) ..."""

    # -------- from_email seguro --------
    default_from = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER
    if '<' in default_from and '>' in default_from:
        from_email = default_from            # ya tiene formato "Nombre <mail>"
    else:
        from_email = f"SENDA Alertas <{default_from}>"

    try:
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=from_email,
            to=recipients,
            reply_to=['admin@sendaproject.es'],
        )
        msg.attach_alternative(html_content, "text/html")
        sent = msg.send(fail_silently=False)
        logger.info(
            "[ALERT_EMAIL] Alerta %s (%s) enviada a %d destinatarios (participante=%s)",
            alert_id, alert.alert_type, sent, participant_email,
        )
    except Exception as exc:
        logger.exception("[ALERT_EMAIL] Fallo al enviar alerta %s: %s", alert_id, exc)
        raise   # deja que Celery reintente