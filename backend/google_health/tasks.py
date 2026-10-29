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

API_BASE = "https://health.googleapis.com/v4/users/me/dataTypes"

DAILY_AGGREGATE_VARIABLES = []


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
                    fecha_date = since.strftime('%Y-%m-%d')
                    filter_field = f"{endpoint['data_key']}.interval.civil_start_time"
                    base_params['filter'] = f'{filter_field} >= "{fecha_date}"'
                elif endpoint_path == 'heart-rate':
                    since_hr = (since - timedelta(minutes=2)).strftime('%Y-%m-%dT%H:%M:%SZ')
                    base_params['filter'] = f'heart_rate.sample_time.physical_time >= "{since_hr}"'

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
            # 4. RESULTADO DE LA SINCRONIZACIÓN (SIN CAMBIOS)
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
