from celery import shared_task
from django.utils import timezone
from django.db import models
from datetime import datetime, timedelta, timezone as dt_timezone
import requests

from google_health.services import GoogleAuthService
from google_health.models import (
    Alert, GoogleAccount, Assignment, PhysiologicalData,
    SyncLog, VariableType, AlertType, AlertPriority, activate_alert, resolve_alert_automatically
)

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

    resolve_alert_automatically(
        AlertType.NO_RECORDS,
        google_account=account,
        assignment=assignment,
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


@shared_task
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
            # =====================================================
            # 1. REFRESCAR TOKEN
            # =====================================================

            success = GoogleAuthService.refresh_access_token(account)

            if not success:
                activate_alert(
                    AlertType.TOKEN_EXPIRED,
                    google_account=account,
                    assignment=assignment,
                )

                # Solo registrar el error TOKEN_ERROR una vez por hora
                last_error = SyncLog.objects.filter(
                    google_account=account,
                    result='TOKEN_ERROR'
                ).order_by('-sync_date').first()

                if not last_error or (now - last_error.sync_date) > timedelta(hours=1):
                    SyncLog.objects.create(
                        google_account=account,
                        result='TOKEN_ERROR',
                        downloaded_records=0
                    )

                continue

            # Si ahora funciona, resolver alerta de token
            resolve_alert_automatically(
                AlertType.TOKEN_EXPIRED,
                google_account=account,
                assignment=assignment,
            )

            headers = {
                "Authorization": f"Bearer {account.access_token}"
            }

            total_downloaded = 0
            successful_endpoints = 0
            daily_totals = {}

            # =====================================================
            # 2. DESCARGAR TODOS LOS ENDPOINTS
            # =====================================================

            for endpoint in ENDPOINTS:
                url = (
                    f"{API_BASE}/"
                    f"{endpoint['endpoint_path']}/"
                    f"dataPoints"
                )

                try:
                    response = requests.get(
                        url,
                        headers=headers,
                        timeout=30
                    )

                except requests.RequestException:
                    continue

                # ---------------------------------------------
                # TOKEN INVÁLIDO
                # ---------------------------------------------
                if response.status_code in [401, 403]:
                    activate_alert(
                        AlertType.TOKEN_EXPIRED,
                        google_account=account,
                        assignment=assignment,
                    )
                    break  # Rompemos el bucle porque el token no es válido

                # ---------------------------------------------
                # ERROR DEL SERVIDOR / API EN ESTE ENDPOINT
                # ---------------------------------------------
                if response.status_code != 200:
                    continue  # Este endpoint falló, pero permitimos que los demás sigan

                # Si la respuesta es 200 OK, sumamos un éxito
                successful_endpoints += 1

                try:
                    data = response.json()
                except ValueError:
                    continue

                points = data.get('dataPoints', [])
                endpoint_downloaded = 0

                # =================================================
                # 3. PROCESAR CADA PUNTO
                # =================================================

                for point in points:
                    device_info = (
                        point.get('dataSource', {})
                        .get('device', {})
                    )

                    device_name = (
                        device_info.get('displayName')
                        or 'Fitbit Device'
                    )

                    platform = (
                        point.get('dataSource', {})
                        .get('platform')
                        or 'FITBIT'
                    )

                    recording_method = (
                        point.get('dataSource', {})
                        .get('recordingMethod')
                        or 'UNKNOWN'
                    )

                    payload = point.get(
                        endpoint['data_key'],
                        point
                    )

                    extracted = endpoint['extractor'](
                        payload,
                        now
                    )

                    for (
                        variable_type,
                        physical_time,
                        metric_value,
                        start_time,
                        end_time
                    ) in extracted:

                        if physical_time is None:
                            continue

                        if (
                            metric_value is None
                            and variable_type not in [
                                VariableType.SLEEP_START,
                                VariableType.SLEEP_END
                            ]
                        ):
                            continue

                        # =========================================
                        # STEPS Y DISTANCE ACUMULADOS POR DÍA
                        # =========================================

                        if variable_type in DAILY_AGGREGATE_VARIABLES:

                            day_date = (
                                start_time.date()
                                if start_time
                                else physical_time.date()
                            )

                            key = (
                                variable_type,
                                day_date
                            )

                            if key not in daily_totals:

                                daily_totals[key] = {
                                    'sum': 0.0,
                                    'earliest_start': (
                                        start_time
                                        or physical_time
                                    ),
                                    'latest_end': (
                                        end_time
                                        or physical_time
                                    ),
                                    'device_name': device_name,
                                    'platform': platform,
                                    'recording_method': recording_method,
                                }

                            daily_totals[key]['sum'] += float(
                                metric_value
                            )

                            candidate_start = (
                                start_time
                                or physical_time
                            )

                            candidate_end = (
                                end_time
                                or physical_time
                            )

                            if (
                                candidate_start
                                < daily_totals[key]['earliest_start']
                            ):
                                daily_totals[key][
                                    'earliest_start'
                                ] = candidate_start

                            if (
                                candidate_end
                                > daily_totals[key]['latest_end']
                            ):
                                daily_totals[key][
                                    'latest_end'
                                ] = candidate_end

                        # =========================================
                        # RESTO DE VARIABLES
                        # =========================================

                        else:

                            PhysiologicalData.objects.get_or_create(
                                assignment=assignment,
                                variable_type=variable_type,
                                physical_time=physical_time,
                                defaults={
                                    'metric_value': metric_value,
                                    'start_time': (
                                        start_time
                                        or physical_time
                                    ),
                                    'end_time': (
                                        end_time
                                        or physical_time
                                    ),
                                    'device_name': device_name,
                                    'platform': platform,
                                    'recording_method': recording_method,
                                }
                            )

                        endpoint_downloaded += 1

                total_downloaded += endpoint_downloaded

            # =====================================================
            # 4. GUARDAR TOTALES DIARIOS DE STEPS Y DISTANCE
            # =====================================================

            for (
                variable_type,
                day_date
            ), info in daily_totals.items():

                existing = (
                    PhysiologicalData.objects
                    .filter(
                        assignment=assignment,
                        variable_type=variable_type,
                        physical_time__date=day_date
                    )
                    .order_by('physical_time')
                    .first()
                )

                if existing:

                    existing.metric_value = info['sum']
                    existing.start_time = info['earliest_start']
                    existing.end_time = info['latest_end']
                    existing.device_name = info['device_name']
                    existing.platform = info['platform']
                    existing.recording_method = info['recording_method']

                    existing.save(
                        update_fields=[
                            'metric_value',
                            'start_time',
                            'end_time',
                            'device_name',
                            'platform',
                            'recording_method',
                        ]
                    )

                else:

                    PhysiologicalData.objects.create(
                        assignment=assignment,
                        variable_type=variable_type,
                        physical_time=info['earliest_start'],
                        metric_value=info['sum'],
                        start_time=info['earliest_start'],
                        end_time=info['latest_end'],
                        device_name=info['device_name'],
                        platform=info['platform'],
                        recording_method=info['recording_method'],
                    )

            # =====================================================
            # 5. RESULTADO DE LA SINCRONIZACIÓN
            # =====================================================
            if successful_endpoints == 0 and len(ENDPOINTS) > 0:
                activate_alert(
                    AlertType.SYNC_ERROR,
                    google_account=account,
                    assignment=assignment,
                )
                # Los errores siempre se registran
                SyncLog.objects.create(
                    google_account=account,
                    result='TOTAL_ERROR',
                    downloaded_records=total_downloaded,
                )
            else:
                resolve_alert_automatically(
                    AlertType.SYNC_ERROR,
                    google_account=account,
                    assignment=assignment,
                )

                # Solo registrar un SUCCESS al día por participante
                now_local = timezone.localtime(now)
                today_start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
                today_start_utc = today_start_local.astimezone(dt_timezone.utc)

                already_logged_today = SyncLog.objects.filter(
                    google_account=account,
                    result='SUCCESS',
                    sync_date__gte=today_start_utc
                ).exists()

                if successful_endpoints > 0 and not already_logged_today:
                    SyncLog.objects.create(
                        google_account=account,
                        result='SUCCESS',
                        downloaded_records=total_downloaded,
                    )

            # =====================================================
            # 6. EVALUAR ALERTAS BASADAS EN DATOS REALES
            # =====================================================
            evaluate_data_alerts(
                account=account,
                assignment=assignment,
                now=now,
                headers=headers,
            )

        except Exception as e:
            activate_alert(
                AlertType.SYNC_ERROR,
                google_account=account,
                assignment=assignment,
            )
            # Solo registrar un error cada hora
            last_error = SyncLog.objects.filter(
                google_account=account,
                result__startswith='ERROR'
            ).order_by('-sync_date').first()

            if not last_error or (now - last_error.sync_date) > timedelta(hours=1):
                SyncLog.objects.create(
                    google_account=account,
                    result=f'ERROR: {str(e)[:100]}',
                    downloaded_records=0
                )