from django.shortcuts import redirect, HttpResponse
from django.utils import timezone
from zoneinfo import ZoneInfo
from .oauth import GoogleOAuthService
from .models import Participant, GoogleAccount, Fitbit, SyncLog, Assignment, PhysiologicalData, Alert, VariableType
from decouple import config
from urllib.parse import urlencode
import requests
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login, logout, get_user_model
from django.contrib.auth.hashers import make_password
from django.db.models import Sum
from django.db import models
import json
import csv
import io
from datetime import datetime
import random
from django.core.cache import cache
from django.core.mail import send_mail, EmailMultiAlternatives
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.urls import reverse
from django.conf import settings
from collections import defaultdict
from django.contrib.auth import get_user_model
from django.db import transaction
import logging
logger = logging.getLogger(__name__)

def _parse_iso_param(v):
    """
    Devuelve una tupla (kind, value):
      - ('date', date)          → el usuario dio solo fecha ('YYYY-MM-DD')
      - ('datetime', datetime)  → el usuario dio fecha + hora ('YYYY-MM-DDTHH:MM')
      - (None, None)            → vacío o inválido
    El datetime que devuelve es siempre timezone-aware.
    """
    if not v:
        return (None, None)

    v = v.strip()

    # Caso 1: solo fecha
    if len(v) == 10:
        try:
            return ('date', datetime.strptime(v, '%Y-%m-%d').date())
        except ValueError:
            logger.warning("[DATE] Fecha no parseable: %r", v)
            return (None, None)

    # Caso 2: fecha con hora
    try:
        dt = datetime.fromisoformat(v.replace('Z', '+00:00'))
    except ValueError:
        logger.warning("[DATE] Fecha/hora no parseable: %r", v)
        return (None, None)

    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())

    return ('datetime', dt)

User = get_user_model()

def _add_cors_headers(request, resp):
    """Añade cabeceras CORS permitiendo orígenes locales y de producción."""
    origin = request.META.get('HTTP_ORIGIN') or request.headers.get('Origin') if hasattr(request, 'headers') else None
    if origin:
        allowed_origins = [
            'http://localhost:5174',
            'http://127.0.0.1:5174',
            'http://192.168.20.84:5174',
            'http://192.168.20.84',
            'https://150.214.230.66:5174',
            'https://150.214.230.66',
            'https://senda.us.es',
        ]
        if origin in allowed_origins or origin.startswith('http://localhost') or origin.startswith('http://127.0.0.1'):
            resp['Access-Control-Allow-Origin'] = origin
            resp['Access-Control-Allow-Credentials'] = 'true'
            resp['Vary'] = 'Origin'
            resp['Access-Control-Expose-Headers'] = 'Content-Disposition'
    return resp

def google_login_view(request):
    auth_url = GoogleOAuthService.get_authorization_url()
    return redirect(auth_url)

def google_callback_view(request):
    code = request.GET.get('code')
    if not code:
        return HttpResponse("No se encontró el código de autorización", status=400)

    print("=" * 60)
    print("CALLBACK RECIBIDO")
    print(f"CODE: {code[:30]}...")
    print(f"REDIRECT_URI CONFIGURADO: {config('GOOGLE_REDIRECT_URI')}")
    print("=" * 60)

    token_data = GoogleOAuthService.exchange_code_for_tokens(code)
    print(f"TOKEN DATA: {token_data}")
    print("=" * 60)

    if not token_data or 'access_token' not in token_data:
        error_detail = token_data.get('error') if isinstance(token_data, dict) else 'Unknown error'
        return HttpResponse(f"Error al intercambiar el código por tokens: {error_detail}", status=400)

    access_token = token_data.get('access_token')
    refresh_token = token_data.get('refresh_token') # Google solo lo manda la primera vez que se da consentimiento
    expires_in = token_data.get('expires_in', 3600)
    expires_at = timezone.now() + timezone.timedelta(seconds=expires_in)
    try:
        user_info_resp = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10  
        )
    except requests.exceptions.Timeout:
        return HttpResponse("Timeout al conectar con Google (userinfo)", status=504)
    except requests.exceptions.RequestException as e:
        return HttpResponse(f"Error al conectar con Google: {str(e)}", status=500)
    
    if user_info_resp.status_code == 200:
        email = user_info_resp.json().get('email')
        email = email.lower().strip()
    else:
        # Google devolvió un error al pedir la info del usuario
        return HttpResponse(
            f"Error al obtener info del usuario de Google: "
            f"HTTP {user_info_resp.status_code} - {user_info_resp.text}",
            status=500
        )

    # buscamos si existe una GoogleAccount para este correo
    google_account = GoogleAccount.objects.filter(email__iexact=email).first()

    if google_account:
        # Si existe, reutilizamos su participante asociado
        participant = google_account.participant
    else:
        participant = Participant.objects.filter(email=email).first()
        if participant:
            participant.email = email
            participant.save(update_fields=['email'])
        else:
            # Si es nuevo, calculamos el siguiente código autoincremental
            participant = Participant.objects.filter(email=email).first()

            if not participant:
                # Generar código único dentro de una transacción atómica
                with transaction.atomic():
                    # Bloquear la tabla de participantes para evitar carreras
                    last_participant = Participant.objects.select_for_update().order_by('-id').first()
                    
                    # Calcular el siguiente código
                    if last_participant:
                        # Extraer el número del último código (ej. SENDA_015 -> 15)
                        try:
                            last_num = int(last_participant.participant_code.split('_')[1])
                        except (IndexError, ValueError):
                            last_num = 0
                        next_code_num = last_num + 1
                    else:
                        next_code_num = 1
                    
                    participant_code = f"SENDA_{next_code_num:03d}"

                    participant = Participant.objects.create(
                        participant_code=participant_code,
                        email=email
                    )

    # Buscamos primero si la cuenta ya existe de forma segura
    existing_account = GoogleAccount.objects.filter(email=email).first()
    
    # Determinamos el refresh token definitivo: si Google manda uno nuevo, lo usamos. 
    # Si no, mantenemos el que ya tuviéramos guardado en la base de datos (o vacío si era totalmente nueva).
    if refresh_token:
        final_refresh_token = refresh_token
    elif existing_account and existing_account.refresh_token:
        final_refresh_token = existing_account.refresh_token
    else:
        final_refresh_token = ""

    try:
        google_account, created = GoogleAccount.objects.update_or_create(
            email=email,
            defaults={
                'participant': participant,
                'access_token': access_token,
                'refresh_token': final_refresh_token,
                'access_token_expiration': expires_at,
                'authentication_status': 'ACTIVE'
            }
        )
        action_text = "creado" if created else "actualizado"
        print(f"¡Autorización exitosa! Cuenta vinculada al participante {participant.participant_code} ({action_text}).")
    except Exception as e:
        print(f"❌ Error al crear/actualizar GoogleAccount: {e}")
        print(f"   Email: {email}")
        print(f"   Participant: {participant.participant_code}")
        frontend_url = config("FRONTEND_URL")
        query = urlencode({
            'oauth': 'error',
            'error': str(e)[:150],
            'participant_code': participant.participant_code,
        })
        return redirect(f"{frontend_url}/?{query}")

    frontend_url = config("FRONTEND_URL")
    query = urlencode({
        'oauth': 'success',
        'participant_code': participant.participant_code,
    })
    return redirect(f"{frontend_url}/?{query}")


@csrf_exempt
def api_participants(request):
    """Devuelve y crea participantes pre-registrados en la aplicación."""
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, POST, DELETE, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method == 'GET':
        participants = Participant.objects.all().order_by('participant_code')
        data = []
        for p in participants:
            try:
                g_account = p.google_account
            except GoogleAccount.DoesNotExist:
                g_account = None

            data.append({
                'participant_code': p.participant_code,
                'email': p.email,
                'access_token': g_account.access_token if g_account else None,
                'refresh_token': g_account.refresh_token if g_account else None,
                'access_token_expiration': g_account.access_token_expiration.isoformat() if g_account and g_account.access_token_expiration else None,
                'authentication_status': g_account.authentication_status if g_account else 'PENDING',
            })
        return _json_response(request, {'count': len(data), 'items': data})

    if request.method == 'DELETE':
        try:
            if request.body:
                payload = json.loads(request.body.decode('utf-8'))
            else:
                payload = {}
        except Exception:
            payload = {}

        participant_code = payload.get('participant_code') or request.GET.get('participant_code')
        if not participant_code:
            return _validation_error(request, 'missing_participant_code')

        participant = Participant.objects.filter(participant_code=participant_code).first()
        if not participant:
            return _json_response(request, {'ok': False, 'error': 'Participant not found'}, status=404)

        participant.delete()
        return _json_response(request, {'ok': True, 'deleted': participant_code})

    if request.method == 'POST':
        try:
            payload = json.loads(request.body.decode('utf-8'))
        except Exception:
            return _validation_error(request, 'invalid_json')

        email = payload.get('email')
        prefix = payload.get('prefix', 'SENDA').upper()

        if prefix not in ['PILOTO', 'SENDA']:
            prefix = 'SENDA'

        if not email:
            return _validation_error(request, 'missing_email')

        if Participant.objects.filter(email__iexact=email).exists():
            return _validation_error(request, 'Email ya registrado', status=409)

        with transaction.atomic():
            # Buscar el último participante que empiece por ese prefijo para calcular el correlativo
            last_participant = Participant.objects.filter(
                participant_code__startswith=f"{prefix}_"
            ).order_by('-id').first()

            if last_participant:
                try:
                    last_num = int(last_participant.participant_code.split('_')[1])
                except (IndexError, ValueError):
                    last_num = 0
                next_code_num = last_num + 1
            else:
                next_code_num = 1

        participant_code = f"{prefix}_{next_code_num:03d}"
        while Participant.objects.filter(participant_code=participant_code).exists():
            next_code_num += 1
            participant_code = f"{prefix}_{next_code_num:03d}"

        participant = Participant.objects.create(
            participant_code=participant_code,
            email=email.lower().strip()
        )

        GoogleAccount.objects.get_or_create(
            participant=participant,
            defaults={
                'email': email,
                'access_token': '',
                'refresh_token': '',
                'access_token_expiration': None,
                'authentication_status': 'PENDING',
            }
        )

        return _json_response(request, {
            'participant_code': participant.participant_code,
            'email': participant.email,
            'access_token': '',
            'refresh_token': '',
            'access_token_expiration': None,
            'authentication_status': 'PENDING',
        }, status=201)

    return _validation_error(request, 'method_not_allowed', status=405)



@csrf_exempt
def api_participants_list(request):
    """Devuelve solo los códigos de los participantes."""
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    codes = list(Participant.objects.values_list('participant_code', flat=True).order_by('participant_code'))
    return _json_response(request, {'items': codes})


@csrf_exempt
def api_participants_update(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'PUT, POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method not in ['PUT', 'POST']:
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        original_code = payload.get('original_code')
        new_code = payload.get('participant_code')
        new_email = payload.get('email')

        if not original_code:
            return _validation_error(request, 'missing_original_code', status=400)

        participant = Participant.objects.filter(participant_code=original_code).first()
        if not participant:
            return _validation_error(request, 'Participant not found', status=404)

        if new_code and new_code != original_code:
            new_code = new_code.upper().strip()
            
            # Comprobar que empieza obligatoriamente por SENDA_ o PILOTO_
            if not (new_code.startswith('SENDA_') or new_code.startswith('PILOTO_')):
                return _validation_error(request, 'Participant code must start with SENDA_ or PILOTO_', status=400)
            
            # Formatear automáticamente la parte numérica a 3 dígitos (ej: PILOTO_7 -> PILOTO_007)
            try:
                prefix, num_part = new_code.split('_', 1)
                if num_part.isdigit():
                    new_code = f"{prefix}_{num_part.zfill(3)}"
                else:
                    return _validation_error(request, 'Invalid participant number format', status=400)
            except ValueError:
                return _validation_error(request, 'Invalid participant code format', status=400)

            # Comprobar si ya existe en otro participante
            if Participant.objects.filter(participant_code=new_code).exists():
                return _validation_error(request, 'Participant code already exists', status=409)
            
            participant.participant_code = new_code

        # Validar si el nuevo email ya existe en otro participante
        if new_email:
            new_email = new_email.lower().strip()
            if Participant.objects.filter(email__iexact=new_email).exclude(pk=participant.pk).exists():
                return _validation_error(request, 'Email already registered', status=409)
            participant.email = new_email

        participant.save()
        return _json_response(request, {
            'ok': True,
            'participant_code': participant.participant_code,
            'email': participant.email
        })
    except Exception as e:
        return _validation_error(request, str(e), status=400)


@csrf_exempt
def api_fitbits_list(request):
    """Devuelve solo los códigos de los fitbits."""
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    codes = list(Fitbit.objects.values_list('fitbit_code', flat=True).order_by('fitbit_code'))
    return _json_response(request, {'items': codes})


def api_fitbits(request):
    """Devuelve pulseras y su estado operativo calculado según las asignaciones activas."""
    now = timezone.now()
    fitbits = []
    
    for f in Fitbit.objects.all().order_by('fitbit_code'):
        has_active_assignment = f.assignments.filter(
            models.Q(real_end_date__isnull=True) | models.Q(real_end_date__gt=now),
            start_date__lte=now
        ).exists()

        # Si está en mantenimiento o inactiva manualmente, respetamos ese estado
        if f.status in ['MAINTENANCE', 'INACTIVE']:
            operational_status = f.status
        else:
            operational_status = 'IN_USE' if has_active_assignment else 'FREE'
            
            if f.status != operational_status:
                f.status = operational_status
                f.save(update_fields=['status'])

        fitbits.append({
            'fitbit_code': f.fitbit_code,
            'status': operational_status,
        })

    counts = {
        'in_use': sum(1 for f in fitbits if f['status'] == 'IN_USE'),
        'free': sum(1 for f in fitbits if f['status'] == 'FREE'),
        'maintenance': sum(1 for f in fitbits if f['status'] == 'MAINTENANCE'),
        'inactive': sum(1 for f in fitbits if f['status'] == 'INACTIVE'),
    }
    
    resp = JsonResponse({'count': len(fitbits), 'items': fitbits, 'counts': counts})
    return _add_cors_headers(request, resp)


@csrf_exempt
def api_fitbits_create(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'POST':
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        return _validation_error(request, 'invalid_json')

    fitbit_code = payload.get('fitbit_code')
    status = payload.get('status') or 'FREE'

    if not fitbit_code:
        return _validation_error(request, 'missing_fitbit_code')

    if not fitbit_code.upper().startswith('F_'):
        return _validation_error(request, 'Fitbit code must start with F_', status=400)

    # Formatear automáticamente la parte numérica a 3 dígitos
    try:
        prefix, num_part = fitbit_code.split('_', 1)
        if num_part.isdigit():
            fitbit_code = f"F_{num_part.zfill(3)}"
        else:
            return _validation_error(request, 'Invalid Fitbit number format', status=400)
    except ValueError:
        return _validation_error(request, 'Invalid Fitbit code format', status=400)
    
    if Fitbit.objects.filter(fitbit_code=fitbit_code).exists():
        return _validation_error(request, 'Fitbit code already exists', status=409)

    fb = Fitbit.objects.create(fitbit_code=fitbit_code, status=status)
    return _json_response(request, {'ok': True, 'fitbit_code': fb.fitbit_code, 'status': fb.status}, status=201)


@csrf_exempt
def api_fitbits_update_status(request):
    """Permite cambiar manualmente el estado operativo de una Fitbit (FREE, IN_USE, MAINTENANCE, INACTIVE)."""
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'POST':
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        fitbit_code = payload.get('fitbit_code')
        new_status = payload.get('status')
        
        if not fitbit_code or not new_status:
            return _validation_error(request, 'missing_required_fields', status=400)
            
        valid_statuses = ['FREE', 'IN_USE', 'MAINTENANCE', 'INACTIVE']
        if new_status not in valid_statuses:
            return _validation_error(request, 'invalid_status', status=400)

        fitbit = Fitbit.objects.filter(fitbit_code=fitbit_code).first()
        if not fitbit:
            return _validation_error(request, 'Fitbit not found', status=404)

        fitbit.status = new_status
        fitbit.save(update_fields=['status'])

        return _json_response(request, {'ok': True, 'fitbit_code': fitbit.fitbit_code, 'status': fitbit.status})
    except Exception as e:
        return _validation_error(request, str(e), status=400)


@csrf_exempt
def api_fitbits_update_code(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'PUT, POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method not in ['PUT', 'POST']:
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        original_code = payload.get('original_code')
        new_code = payload.get('fitbit_code')

        if not original_code or not new_code:
            return _validation_error(request, 'missing_required_fields', status=400)

        if not new_code.upper().startswith('F_'):
            return _validation_error(request, 'Fitbit code must start with F_', status=400)

        # Formatear automáticamente la parte numérica a 3 dígitos
        try:
            prefix, num_part = new_code.split('_', 1)
            if num_part.isdigit():
                new_code = f"F_{num_part.zfill(3)}"
            else:
                return _validation_error(request, 'Invalid Fitbit number format', status=400)
        except ValueError:
            return _validation_error(request, 'Invalid Fitbit code format', status=400)
        
        fitbit = Fitbit.objects.filter(fitbit_code=original_code).first()
        if not fitbit:
            return _validation_error(request, 'Fitbit not found', status=404)

        if new_code != original_code:
            if Fitbit.objects.filter(fitbit_code=new_code).exists():
                return _validation_error(request, 'Fitbit code already exists', status=409)
            fitbit.fitbit_code = new_code

        fitbit.save(update_fields=['fitbit_code'])
        return _json_response(request, {'ok': True, 'fitbit_code': fitbit.fitbit_code})
    except Exception as e:
        return _validation_error(request, str(e), status=400)


@csrf_exempt
def api_fitbits_delete(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'DELETE, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'DELETE':
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        payload = {}

    fitbit_code = payload.get('fitbit_code') or request.GET.get('fitbit_code')
    if not fitbit_code:
        return _validation_error(request, 'missing_fitbit_code')

    fb = Fitbit.objects.filter(fitbit_code=fitbit_code).first()
    if not fb:
        return _json_response(request, {'ok': False, 'error': 'Fitbit not found'}, status=404)

    fb.delete()
    return _json_response(request, {'ok': True, 'deleted': fitbit_code})


@csrf_exempt
def api_assignments(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'GET':
        return _validation_error(request, 'method_not_allowed', status=405)

    assignments = Assignment.objects.select_related('participant', 'fitbit').order_by('-start_date')
    now = timezone.now()
    
    items = []
    for assignment in assignments:
        if not assignment.real_end_date:
            status = 'ACTIVE'
        elif assignment.real_end_date > now:
            status = 'ACTIVE'  # Sigue activo si la fecha de fin real aún no ha ocurrido
        else:
            status = 'COMPLETED'

        items.append({
            'id': str(assignment.id),
            'participant_code': assignment.participant.participant_code if assignment.participant else None,
            'fitbit_code': assignment.fitbit.fitbit_code if assignment.fitbit else None,
            'start_date': assignment.start_date.isoformat() if assignment.start_date else None,
            'estimated_end_date': assignment.estimated_end_date.isoformat() if assignment.estimated_end_date else None,
            'real_end_date': assignment.real_end_date.isoformat() if assignment.real_end_date else None,
            'status': status,
        })
        
    return _json_response(request, {'count': len(items), 'items': items})


@csrf_exempt
def api_assignments_create(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'POST':
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        return _validation_error(request, 'invalid_json')

    participant_code = payload.get('participant_code')
    fitbit_code = payload.get('fitbit_code')
    start_date_str = payload.get('start_date')
    estimated_end_date_str = payload.get('estimated_end_date')
    real_end_date_str = payload.get('real_end_date')

    if not participant_code or not fitbit_code or not start_date_str:
        return _validation_error(request, 'missing_required_fields')

    participant = Participant.objects.filter(participant_code=participant_code).first()
    fitbit = Fitbit.objects.filter(fitbit_code=fitbit_code).first()

    if not participant or not fitbit:
        return _validation_error(request, 'Participant or Fitbit not found', status=404)

    try:
        # Convertir y asegurar zona horaria consciente (timezone-aware)
        tz = timezone.get_current_timezone()
        
        start_date = datetime.fromisoformat(start_date_str)
        if timezone.is_naive(start_date):
            start_date = timezone.make_aware(start_date, tz)

        estimated_end_date = None
        if estimated_end_date_str:
            estimated_end_date = datetime.fromisoformat(estimated_end_date_str)
            if timezone.is_naive(estimated_end_date):
                estimated_end_date = timezone.make_aware(estimated_end_date, tz)

        real_end_date = None
        if real_end_date_str:
            real_end_date = datetime.fromisoformat(real_end_date_str)
            if timezone.is_naive(real_end_date):
                real_end_date = timezone.make_aware(real_end_date, tz)

        assignment = Assignment.objects.create(
            participant=participant,
            fitbit=fitbit,
            start_date=start_date,
            estimated_end_date=estimated_end_date,
            real_end_date=real_end_date,
        )
    except Exception as e:
        return _validation_error(request, str(e), status=400)

    return _json_response(request, {
        'ok': True,
        'id': str(assignment.id),
        'status': assignment.status
    }, status=201)


@csrf_exempt
def api_assignments_update(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'POST':
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        assignment_id = payload.get('id')
        assignment = Assignment.objects.get(id=assignment_id)

        p_code = payload.get('participant_code')
        if p_code:
            participant = Participant.objects.filter(participant_code=p_code).first()
            if not participant:
                return _validation_error(request, 'Participant not found', status=404)
            assignment.participant = participant

        f_code = payload.get('fitbit_code')
        if f_code:
            fitbit = Fitbit.objects.filter(fitbit_code=f_code).first()
            if not fitbit:
                return _validation_error(request, 'Fitbit not found', status=404)
            assignment.fitbit = fitbit

        assignment.start_date = datetime.fromisoformat(payload.get('start_date'))
        assignment.estimated_end_date = datetime.fromisoformat(payload.get('estimated_end_date')) if payload.get('estimated_end_date') else None
        real_end = payload.get('real_end_date')
        assignment.real_end_date = datetime.fromisoformat(real_end) if real_end else None
        assignment.save()
        
        return _json_response(request, {'ok': True})
    except Exception as e:
        return _validation_error(request, str(e), status=400)


@csrf_exempt
def api_assignments_delete(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'POST':
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        assignment_id = payload.get('id')
        
        if not assignment_id:
            return _validation_error(request, 'missing_id', status=400)
            
        assignment = Assignment.objects.get(id=assignment_id)
        assignment.delete()
        
        return _json_response(request, {'ok': True, 'message': 'Asignación eliminada correctamente'})
    except Assignment.DoesNotExist:
        return _validation_error(request, 'assignment_not_found', status=404)
    except Exception as e:
        return _validation_error(request, str(e), status=400)


@csrf_exempt
def api_physiological_data(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'GET':
        return _validation_error(request, 'method_not_allowed', status=405)

    participant_code = request.GET.get('participant')
    fitbit_code = request.GET.get('fitbit')
    variable_type = request.GET.get('variable_type')
    date_from = request.GET.get('from')
    date_to = request.GET.get('to')
    status_filter = request.GET.get('status')

    qs = PhysiologicalData.objects.select_related(
        'assignment__participant',
        'assignment__fitbit'
    )

    # -----------------------------------------------------
    # FILTRAR POR PARTICIPANTE
    # -----------------------------------------------------
    if participant_code:
        codes = [
            c.strip()
            for c in participant_code.split(',')
            if c.strip()
        ]

        qs = qs.filter(
            assignment__participant__participant_code__in=codes
        )

    # -----------------------------------------------------
    # FILTRAR POR FITBIT
    # -----------------------------------------------------
    if fitbit_code:
        f_codes = [
            f.strip()
            for f in fitbit_code.split(',')
            if f.strip()
        ]

        qs = qs.filter(
            assignment__fitbit__fitbit_code__in=f_codes
        )

    # -----------------------------------------------------
    # FILTRAR POR VARIABLE
    # -----------------------------------------------------
    if variable_type:
        vars_list = [
            v.strip()
            for v in variable_type.split(',')
            if v.strip()
        ]

        qs = qs.filter(variable_type__in=vars_list)

    # -----------------------------------------------------
    # FILTRAR POR FECHAS
    # -----------------------------------------------------
    kind_from, val_from = _parse_iso_param(date_from)
    kind_to,   val_to   = _parse_iso_param(date_to)

    if kind_from == 'date':
        qs = qs.filter(physical_time__date__gte=val_from)
    elif kind_from == 'datetime':
        qs = qs.filter(physical_time__gte=val_from)

    if kind_to == 'date':
        qs = qs.filter(physical_time__date__lte=val_to)
    elif kind_to == 'datetime':
        qs = qs.filter(physical_time__lte=val_to)

    logger.warning("[PHYSIO_DATA] Registros tras aplicar filtros: %d", qs.count())

    # -----------------------------------------------------
    # FILTRAR POR ESTADO DEL PARTICIPANTE
    # -----------------------------------------------------
    if status_filter and status_filter != 'ALL':
        valid_participants = []

        for participant in Participant.objects.all():

            assignment = (
                Assignment.objects
                .filter(participant=participant)
                .order_by('-start_date')
                .first()
            )

            if not assignment:
                p_status = 'PENDING'

            elif (
                assignment.real_end_date
                and assignment.real_end_date <= timezone.now()
            ):
                p_status = 'COMPLETED'

            elif assignment.start_date > timezone.now():
                p_status = 'PENDING'

            else:
                p_status = 'ACTIVE'

            if p_status == status_filter:
                valid_participants.append(
                    participant.participant_code
                )

        qs = qs.filter(
            assignment__participant__participant_code__in=valid_participants
        )

    # =====================================================
    # PARÁMETROS DE PAGINACIÓN
    # =====================================================
    try:
        page = int(request.GET.get('page', 1))
    except (ValueError, TypeError):
        page = 1
    try:
        page_size = int(request.GET.get('page_size', 50))
    except (ValueError, TypeError):
        page_size = 50

    # Límites de seguridad
    page = max(page, 1)
    page_size = min(max(page_size, 10), 200)  # entre 10 y 200

    # =====================================================
    # CONTEO TOTAL (para saber cuántas páginas hay)
    # =====================================================
    total_count = qs.count()

    # =====================================================
    # SLICE PAGINADO
    # =====================================================
    offset = (page - 1) * page_size
    page_qs = qs.order_by('-physical_time')[offset:offset + page_size]
    records = list(page_qs)

    # =====================================================
    # VARIABLES DISPONIBLES EN EL FILTRO ACTUAL
    # =====================================================
    # Útil para el frontend: mostrar qué variables hay
    variables_available = list(
        qs.values_list('variable_type', flat=True).distinct()
    )

    # =====================================================
    # SERIALIZACIÓN
    # =====================================================
    items = []
    for item in records:
        items.append({
            'participant_code': item.assignment.participant.participant_code,
            'fitbit_code': item.assignment.fitbit.fitbit_code,
            'variable_type': item.variable_type,
            'physical_time': item.physical_time.isoformat(),
            'metric_value': item.metric_value,
        })

    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1

    return _json_response(
        request,
        {
            'count': total_count,
            'page': page,
            'page_size': page_size,
            'total_pages': total_pages,
            'variables_available': variables_available,
            'items': items,
        }
    )



@csrf_exempt
def api_variable_types_list(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    
    variables = [{'code': choice[0], 'label': choice[1]} for choice in VariableType.choices]
    resp = JsonResponse({'items': variables})
    return _add_cors_headers(request, resp)


@csrf_exempt
def api_alerts(request):

    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'GET':
        return _validation_error(
            request,
            'method_not_allowed',
            status=405
        )

    status_filter = request.GET.get('status', 'ALL')
    priority_filter = request.GET.get('priority', 'ALL')
    participant_filter = request.GET.get('participant', '').strip()
    alert_type_filter = request.GET.get('type', 'ALL')

    alerts = (
        Alert.objects
        .select_related(
            'assignment__participant',
            'assignment__fitbit',
            'google_account'
        )
    )

    # ----------------------------------------
    # FILTRO POR ESTADO
    # ----------------------------------------

    if status_filter == 'ACTIVE':
        alerts = alerts.filter(resolved=False)

    elif status_filter == 'RESOLVED':
        alerts = alerts.filter(resolved=True)

    # ----------------------------------------
    # FILTRO POR PRIORIDAD
    # ----------------------------------------

    if priority_filter in ['HIGH', 'MEDIUM']:
        alerts = alerts.filter(priority=priority_filter)

    # ----------------------------------------
    # FILTRO POR TIPO DE ALERTA
    # ----------------------------------------

    if alert_type_filter != 'ALL':
        alerts = alerts.filter(alert_type=alert_type_filter)

    # ----------------------------------------
    # FILTRO POR PARTICIPANTE
    # ----------------------------------------

    if participant_filter:
        alerts = alerts.filter(
            assignment__participant__participant_code__icontains=participant_filter
        )

    # ----------------------------------------
    # ORDEN
    # Activas primero y más recientes primero
    # ----------------------------------------

    alerts = alerts.order_by(
        'resolved',
        '-last_detected_at'
    )[:500]

    items = []

    for alert in alerts:

        participant_code = None
        fitbit_code = None

        if alert.assignment:
            if alert.assignment.participant:
                participant_code = (
                    alert.assignment.participant.participant_code
                )

            if alert.assignment.fitbit:
                fitbit_code = (
                    alert.assignment.fitbit.fitbit_code
                )

        items.append({
            'id': str(alert.id),

            'type': alert.alert_type,
            'type_label': alert.get_alert_type_display(),

            'message': alert.message,
            'priority': alert.priority,

            'resolved': alert.resolved,

            'participant_code': participant_code,

            'fitbit_code': fitbit_code,

            'email': (
                alert.google_account.email
                if alert.google_account
                else None
            ),

            'details': alert.details or {},

            'first_detected_at': (
                alert.first_detected_at.isoformat()
                if alert.first_detected_at
                else None
            ),

            'last_detected_at': (
                alert.last_detected_at.isoformat()
                if alert.last_detected_at
                else None
            ),

            'created_at': (
                alert.created_at.isoformat()
                if alert.created_at
                else None
            ),

            'resolved_at': (
                alert.resolved_at.isoformat()
                if alert.resolved_at
                else None
            ),
        })

    return _json_response(
        request,
        {
            'count': len(items),
            'items': items,
        }
    )

@csrf_exempt
def api_resolve_alert(request, alert_id):

    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'POST':
        return _validation_error(
            request,
            'method_not_allowed',
            status=405
        )

    try:
        alert = Alert.objects.get(id=alert_id)

        if alert.resolved:
            return _json_response(
                request,
                {
                    'ok': True,
                    'already_resolved': True,
                    'message': 'La alerta ya estaba resuelta'
                }
            )

        alert.resolved = True
        alert.resolved_at = timezone.now()

        alert.save(
            update_fields=[
                'resolved',
                'resolved_at'
            ]
        )

        return _json_response(
            request,
            {
                'ok': True,
                'message': 'Alerta marcada como resuelta correctamente',
                'resolved_at': alert.resolved_at.isoformat()
            }
        )

    except Alert.DoesNotExist:
        return _validation_error(
            request,
            'alert_not_found',
            status=404
        )

# =========================================================
# Tamaño de bloque para downsampling de HEART_RATE
# =========================================================
# def _pick_hr_block(date_from, date_to):
#     """
#     Devuelve el tamaño del bloque (en minutos) para agrupar HEART_RATE
#     según el rango temporal solicitado.
#     """
#     if not (date_from and date_to):
#         return 60        # sin fechas → 1 hora
#     try:
#         d1 = datetime.fromisoformat(date_from).date()
#         d2 = datetime.fromisoformat(date_to).date()
#     except ValueError:
#         return 60

#     dias = max((d2 - d1).days, 1)
#     if dias <= 1:
#         return 1         # 1 día → minuto
#     if dias <= 7:
#         return 5         # 1 semana → 5 min
#     if dias <= 30:
#         return 15        # 1 mes → 15 min
#     return 60            # más → 1 hora



@csrf_exempt
def api_export_physiological_data(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'GET':
        return _validation_error(
            request,
            'method_not_allowed',
            status=405
        )

    export_type = request.GET.get('type')
    export_format = request.GET.get('format', 'csv')

    rows = []

    # =========================================================
    # DATOS FISIOLÓGICOS
    # =========================================================

    if export_type == 'physiological':

        participant_code = request.GET.get('participant')
        fitbit_code = request.GET.get('fitbit')
        variable_type = request.GET.get('variable_type')
        date_from = request.GET.get('from')
        date_to = request.GET.get('to')
        status_filter = request.GET.get('status')

        qs = (
            PhysiologicalData.objects
            .select_related(
                'assignment__participant',
                'assignment__fitbit'
            )
        )

        # -----------------------------------------------------
        # FILTRO PARTICIPANTE
        # -----------------------------------------------------

        if participant_code:
            codes = [c.strip() for c in participant_code.split(',') if c.strip()]
            qs = qs.filter(
                assignment__participant__participant_code__in=codes
            )

        # -----------------------------------------------------
        # FILTRO FITBIT
        # -----------------------------------------------------

        if fitbit_code:
            f_codes = [f.strip() for f in fitbit_code.split(',') if f.strip()]
            qs = qs.filter(
                assignment__fitbit__fitbit_code__in=f_codes
            )

        # -----------------------------------------------------
        # FILTRO VARIABLE
        # -----------------------------------------------------

        if variable_type:
            vars_list = [v.strip() for v in variable_type.split(',') if v.strip()]

            # Si la exportación es de sueño (contiene alguna variable SLEEP_*),
            # añadimos también SLEEP_START y SLEEP_END para que estén disponibles
            # en el pivot aunque el usuario no los haya seleccionado explícitamente.
            if any(v.startswith('SLEEP_') for v in vars_list):
                for bound in ('SLEEP_START', 'SLEEP_END'):
                    if bound not in vars_list:
                        vars_list.append(bound)

            qs = qs.filter(
                variable_type__in=vars_list
            )

        # -----------------------------------------------------
        # FILTRO FECHA 
        # -----------------------------------------------------

        kind_from, val_from = _parse_iso_param(date_from)
        kind_to,   val_to   = _parse_iso_param(date_to)

        if kind_from == 'date':
            qs = qs.filter(physical_time__date__gte=val_from)
        elif kind_from == 'datetime':
            qs = qs.filter(physical_time__gte=val_from)

        if kind_to == 'date':
            qs = qs.filter(physical_time__date__lte=val_to)
        elif kind_to == 'datetime':
            qs = qs.filter(physical_time__lte=val_to)

        logger.info(
            "[EXPORT] Filtro aplicado → from=(%s, %s) to=(%s, %s), registros=%d",
            kind_from, val_from, kind_to, val_to, qs.count(),
        )

        # -----------------------------------------------------
        # FILTRO POR ESTADO DEL PARTICIPANTE
        # -----------------------------------------------------

        if status_filter and status_filter != 'ALL':

            valid_participants = []

            for participant in Participant.objects.all():

                assignment = (
                    Assignment.objects
                    .filter(participant=participant)
                    .order_by('-start_date')
                    .first()
                )

                if not assignment:
                    participant_status = 'PENDING'

                elif assignment.real_end_date:
                    participant_status = 'COMPLETED'

                elif assignment.start_date > timezone.now():
                    participant_status = 'PENDING'

                else:
                    participant_status = 'ACTIVE'

                if participant_status == status_filter:
                    valid_participants.append(
                        participant.participant_code
                    )

            qs = qs.filter(
                assignment__participant__participant_code__in=
                valid_participants
            )

        # =====================================================
        # CONSTRUCCIÓN DE TABLA PIVOT
        # =====================================================

        from zoneinfo import ZoneInfo

        local_tz = ZoneInfo("Europe/Madrid")

        pivot_data = {}
        variables_found = set()

        for item in qs.order_by('-physical_time').iterator(chunk_size=2000):

            if not item.assignment:
                continue

            participant = item.assignment.participant
            fitbit = item.assignment.fitbit

            if not participant or not fitbit:
                continue

            participant_code_value = participant.participant_code
            fitbit_code_value = fitbit.fitbit_code

            # -------------------------------------------------
            # Convertir UTC -> Europe/Madrid
            # -------------------------------------------------

            local_time = item.physical_time.astimezone(local_tz)
            time_key = local_time.replace(microsecond=0)

            # -------------------------------------------------
            # CLAVE DE LA FILA
            # -------------------------------------------------
            # Para SLEEP_START y SLEEP_END agrupamos por DÍA
            # (así el start y el end de la misma noche caen en la misma fila)
            if item.variable_type.startswith('SLEEP_'):
                # Si la hora es antes del mediodía, es parte de la noche anterior
                if time_key.hour < 12:
                    from datetime import timedelta
                    sleep_day = (time_key - timedelta(days=1)).date()
                else:
                    sleep_day = time_key.date()

                row_key = (
                    participant_code_value,
                    fitbit_code_value,
                    sleep_day
                )
            else:
                row_key = (
                    participant_code_value,
                    fitbit_code_value,
                    time_key
                )  

            if row_key not in pivot_data:

                pivot_data[row_key] = {
                    'participant_code': participant_code_value,
                    'fitbit_code': fitbit_code_value,
                    'physical_time': time_key,
                    'variables': {}
                }
            else:
                # Actualizamos physical_time a la hora más reciente de la noche
                if time_key > pivot_data[row_key]['physical_time']:
                    pivot_data[row_key]['physical_time'] = time_key

            # -------------------------------------------------
            # VARIABLE -> VALOR
            # -------------------------------------------------

            val = item.metric_value
            
            if item.variable_type in ('SLEEP_START', 'SLEEP_END'):
                # Guardamos la hora completa (con fecha, hora, minuto, segundo)
                pivot_data[row_key]['variables'][item.variable_type] = time_key.isoformat()
                # Actualizamos physical_time al más reciente (para el orden)
                if time_key > pivot_data[row_key]['physical_time']:
                    pivot_data[row_key]['physical_time'] = time_key

            elif val is not None and float(val) > 0:
                try:
                    num_val = float(val)

                    # Convertimos a texto para que CSV y XLSX muestren siempre el punto decimal
                    if num_val.is_integer():
                        formatted_value = str(int(num_val))
                    else:
                        formatted_value = format(num_val, '.15g')

                    pivot_data[row_key]['variables'][item.variable_type] = formatted_value

                except (ValueError, TypeError):
                    pivot_data[row_key]['variables'][item.variable_type] = str(val)

            else:
                pivot_data[row_key]['variables'][item.variable_type] = '-'  # -, null o nada (en excel)


        # =====================================================
        # DETECCIÓN DE MODO SUEÑO
        # =====================================================

        # Detectar si la exportación incluye alguna variable de sueño (SLEEP_*)
        # En ese caso:
        #   - NO se incluye physical_time
        #   - SÍ se incluyen SLEEP_START y SLEEP_END
        if variable_type:
            selected_vars = [v.strip() for v in variable_type.split(',') if v.strip()]
            only_sleep = any(v.startswith('SLEEP_') for v in selected_vars)
        else:
            # Sin filtro: miramos si en los datos aparecen variables SLEEP_*
            only_sleep = any(v.startswith('SLEEP_') for v in variables_found)

            
        # =====================================================
        # ORDEN DE VARIABLES
        # =====================================================

        sleep_bounds = ['SLEEP_START', 'SLEEP_END']

        if variable_type:
            ordered_variables = [
                v.strip() for v in variable_type.split(',')
                if v.strip() in variables_found
                or v.strip() in [c[0] for c in VariableType.choices]
            ]

            if only_sleep:
                # Añadir SLEEP_START y SLEEP_END si no están ya en la lista
                for sb in sleep_bounds:
                    if sb not in ordered_variables:
                        ordered_variables.insert(0, sb)
                # Ordenar: primero SLEEP_START, luego SLEEP_END, luego el resto
                ordered_variables = sorted(
                    ordered_variables,
                    key=lambda v: sleep_bounds.index(v) if v in sleep_bounds else 99
                )
        else:
            # Sin filtro: mostramos todas las variables del sistema
            ordered_variables = [choice[0] for choice in VariableType.choices]

            if only_sleep:
                # Aseguramos que SLEEP_START y SLEEP_END estén al principio
                for sb in reversed(sleep_bounds):
                    if sb in ordered_variables:
                        ordered_variables.remove(sb)
                    ordered_variables.insert(0, sb)

        # Añadir cualquier variable que aparezca en los datos pero no esté en la lista
        remaining_variables = sorted(variables_found - set(ordered_variables))
        ordered_variables.extend(remaining_variables)

        # =====================================================
        # CABECERA
        # =====================================================

        rows = []

        header = [
            'participant_code',
            'fitbit_code',
        ]

        if not only_sleep:
            header.append('physical_time')

        header.extend(ordered_variables)

        rows.append(header)

        # =====================================================
        # DATOS
        # =====================================================

        sorted_rows = sorted(
            pivot_data.values(),
            key=lambda row: row['physical_time'],
            reverse=True
        )

        for row in sorted_rows:

            row_data = [
                row['participant_code'],
                row['fitbit_code'],
            ]

            # Solo añadimos physical_time si NO es exportación exclusiva de sueño
            if not only_sleep:
                row_data.append(row['physical_time'].isoformat())

            for variable in ordered_variables:
                # El valor ya está guardado correctamente en el pivot
                # (para SLEEP_START/SLEEP_END es la hora; para el resto es el valor numérico)
                value = row['variables'].get(variable, '')
                row_data.append(value)

            rows.append(row_data)

        # =====================================================
        # NOMBRE DEL ARCHIVO
        # =====================================================

        name_parts = []

        if participant_code:
            name_parts.append(
                participant_code
            )

        if variable_type:
            name_parts.append(
                variable_type.lower()
            )

        if status_filter and status_filter != 'ALL':
            name_parts.append(
                status_filter.lower()
            )

        file_root = (
            "_".join(name_parts)
            if name_parts
            else 'physiological_data'
        )

    # =========================================================
    # TIPO DE EXPORTACIÓN NO VÁLIDO
    # =========================================================

    else:
        return _validation_error(
            request,
            'invalid_export_type',
            status=400
        )

    # =========================================================
    # EXPORTAR XLSX
    # =========================================================

    if export_format == 'xlsx':

        import openpyxl

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Datos"

        for row in rows:
            ws.append(row)

        # Ajustar automáticamente el ancho de las columnas
        for column_cells in ws.columns:

            max_length = 0
            column_letter = column_cells[0].column_letter

            for cell in column_cells:

                if cell.value is not None:
                    max_length = max(
                        max_length,
                        len(str(cell.value))
                    )

            ws.column_dimensions[
                column_letter
            ].width = min(
                max_length + 2,
                40
            )

        output = io.BytesIO()

        wb.save(output)

        output.seek(0)

        response = HttpResponse(
            output.getvalue(),
            content_type=(
                'application/vnd.openxmlformats-officedocument.'
                'spreadsheetml.sheet'
            )
        )

        response['Content-Disposition'] = (
            f'attachment; filename="{file_root}.xlsx"'
        )

    # =========================================================
    # EXPORTAR CSV
    # =========================================================

    else:

        output = io.BytesIO()

        wrapper = io.TextIOWrapper(
            output,
            encoding='utf-8-sig',
            newline=''
        )

        writer = csv.writer(
            wrapper,
            delimiter=';'
        )

        for row in rows:
            writer.writerow(row)

        wrapper.flush()
        output.seek(0)

        response = HttpResponse(
            output.getvalue(),
            content_type='text/csv'
        )

        response['Content-Disposition'] = (
            f'attachment; filename="{file_root}.csv"'
        )

    return _add_cors_headers(
        request,
        response
    )


@csrf_exempt
def api_export(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'GET':
        return _validation_error(request, 'method_not_allowed', status=405)

    export_type = request.GET.get('type')
    export_format = request.GET.get('format', 'csv')

    logger.warning(
        "[EXPORT] type=%r format=%r from=%r to=%r participant=%r variable=%r",
        request.GET.get('type'),
        request.GET.get('format'),
        request.GET.get('from'),
        request.GET.get('to'),
        request.GET.get('participant'),
        request.GET.get('variable_type'),
    )
    check_only = request.GET.get('check', 'false') == 'true'

    rows = []
    has_data = False
    filter_parts = []
    
    local_tz = ZoneInfo("Europe/Madrid")
    today_date = timezone.localtime(timezone.now()).date()

    # Validación de fechas/años futuros
    for key, val in request.GET.items():
        if val and str(val).strip() and str(val).strip().upper() != 'ALL':
            val_str = str(val).strip()
            try:
                if len(val_str) == 10 and '-' in val_str:
                    parsed_d = datetime.strptime(val_str, '%Y-%m-%d').date()
                    if parsed_d > today_date:
                        return JsonResponse({'ok': False, 'error': 'La fecha seleccionada no puede ser posterior a hoy.'}, status=400)
                elif len(val_str) == 4 and val_str.isdigit():
                    if int(val_str) > today_date.year:
                        return JsonResponse({'ok': False, 'error': 'El año seleccionado no puede ser posterior al actual.'}, status=400)
            except ValueError:
                pass

    def format_date_madrid(dt):
        if not dt:
            return ''

        try:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, local_tz)

            return timezone.localtime(dt, local_tz).isoformat()

        except Exception as e:
            print(f"ERROR formateando fecha: {dt!r} -> {e}")
            return str(dt)

    # =========================================================
    # PARTICIPANTES
    # =========================================================
    if export_type == 'participants':
        p_filter = request.GET.get('participant_code')
        status_filter = request.GET.get('study_status')

        if p_filter and p_filter != 'ALL': filter_parts.append(p_filter)
        if status_filter and status_filter != 'ALL': filter_parts.append(status_filter.lower())

        rows.append(['participant_code', 'email', 'authentication_status', 'study_status'])

        for account in GoogleAccount.objects.select_related('participant'):
            participant = account.participant
            if not participant: continue
                
            assignment = Assignment.objects.filter(participant=participant).order_by('-start_date').first()
            if not assignment: study_status = 'PENDING'
            elif assignment.real_end_date: study_status = 'COMPLETED'
            elif assignment.start_date > timezone.now(): study_status = 'PENDING'
            else: study_status = 'ACTIVE'

            if p_filter and p_filter != 'ALL' and p_filter.strip().lower() not in participant.participant_code.lower(): continue
            if status_filter and status_filter != 'ALL' and study_status != status_filter: continue

            rows.append([participant.participant_code, account.email, account.authentication_status, study_status])
            has_data = True
        
        file_root = _generate_filename('participants', filter_parts)

    # =========================================================
    # FITBITS
    # =========================================================
    elif export_type == 'fitbits':
        f_filter = request.GET.get('fitbit_code')
        status_filter = request.GET.get('status')

        if f_filter and f_filter != 'ALL': filter_parts.append(f_filter)
        if status_filter and status_filter != 'ALL': filter_parts.append(status_filter.lower())

        rows.append(['fitbit_code', 'status', 'assigned_participant'])

        for fitbit in Fitbit.objects.all():
            if f_filter and f_filter != 'ALL' and f_filter.strip().lower() not in fitbit.fitbit_code.lower(): continue
            if status_filter and status_filter != 'ALL' and fitbit.status != status_filter: continue

            assignment = fitbit.assignments.filter(real_end_date__isnull=True).order_by('-start_date').first()
            assigned = assignment.participant.participant_code if assignment and assignment.participant else ''

            rows.append([fitbit.fitbit_code, fitbit.status, assigned])
            has_data = True
        
        file_root = _generate_filename('fitbits', filter_parts)

    # =========================================================
    # ASIGNACIONES
    # =========================================================
    elif export_type == 'assignments':
        p_code = request.GET.get('participant_code')
        f_code = request.GET.get('fitbit_code')
        d_start = request.GET.get('start_date')
        d_end = request.GET.get('end_date')
        status_filter = request.GET.get('status')

        # Añadir filtros a la lista (SOLO si no son ALL o están vacíos)
        filter_parts = []  # Reiniciar para esta sección
        if p_code and p_code != 'ALL' and p_code.strip():
            filter_parts.append(p_code.strip())
        if f_code and f_code != 'ALL' and f_code.strip():
            filter_parts.append(f_code.strip())
        if status_filter and status_filter != 'ALL' and status_filter.strip():
            filter_parts.append(status_filter.lower().strip())
        if d_start and d_start.strip():
            filter_parts.append(d_start.strip())
        if d_end and d_end.strip():
            filter_parts.append(d_end.strip())

        rows.append(['participant_code', 'fitbit_code', 'start_date', 'estimated_end_date', 'real_end_date', 'status'])

        qs = Assignment.objects.select_related('participant', 'fitbit').all()
        if p_code and p_code != 'ALL' and p_code.strip():
            qs = qs.filter(participant__participant_code__icontains=p_code.strip())
        if f_code and f_code != 'ALL' and f_code.strip():
            qs = qs.filter(fitbit__fitbit_code__icontains=f_code.strip())
        if d_start:
            try: 
                qs = qs.filter(start_date__date__gte=datetime.strptime(d_start, '%Y-%m-%d').date())
            except ValueError: 
                pass
        if d_end:
            try: 
                qs = qs.filter(real_end_date__date=datetime.strptime(d_end, '%Y-%m-%d').date())
            except ValueError: 
                pass

        for assignment in qs:
            if status_filter and status_filter != 'ALL' and assignment.status != status_filter:
                continue
            rows.append([
                assignment.participant.participant_code if assignment.participant else '',
                assignment.fitbit.fitbit_code if assignment.fitbit else '',
                format_date_madrid(assignment.start_date),
                format_date_madrid(assignment.estimated_end_date),
                format_date_madrid(assignment.real_end_date),
                assignment.status
            ])
            has_data = True
        
        file_root = _generate_filename('assignments', filter_parts)

    # =========================================================
    # ALERTAS
    # =========================================================
    elif export_type == 'alerts':
        a_type = request.GET.get('alert_type')
        a_priority = request.GET.get('priority')
        p_code = request.GET.get('participant_code')
        f_code = request.GET.get('fitbit_code')
        d_first = request.GET.get('first_detected_at')
        d_resolved = request.GET.get('resolved_at')

        if a_type and a_type != 'ALL': filter_parts.append(a_type.lower())
        if a_priority and a_priority != 'ALL': filter_parts.append(a_priority.lower())
        if p_code and p_code != 'ALL': filter_parts.append(p_code)
        if f_code and f_code != 'ALL': filter_parts.append(f_code)
        if d_first and d_first.strip(): filter_parts.append(d_first)
        if d_resolved and d_resolved.strip(): filter_parts.append(d_resolved)

        rows.append(['alert_id', 'type', 'priority', 'resolved', 'participant_code', 'fitbit_code', 'email', 'first_detected_at', 'resolved_at', 'created_at'])

        qs = Alert.objects.select_related('assignment__participant', 'assignment__fitbit', 'google_account').all()
        if a_type and a_type != 'ALL': qs = qs.filter(alert_type=a_type)
        if a_priority and a_priority != 'ALL': qs = qs.filter(priority=a_priority)
        if p_code and p_code != 'ALL': qs = qs.filter(assignment__participant__participant_code__icontains=p_code.strip())
        if f_code and f_code != 'ALL': qs = qs.filter(assignment__fitbit__fitbit_code__icontains=f_code.strip())
        if d_first and d_first.strip():
            try: qs = qs.filter(first_detected_at__date=datetime.strptime(d_first.strip(), '%Y-%m-%d').date())
            except ValueError: pass
        if d_resolved and d_resolved.strip():
            try: qs = qs.filter(resolved_at__date=datetime.strptime(d_resolved.strip(), '%Y-%m-%d').date())
            except ValueError: pass

        for alert in qs:
            rows.append([
                str(alert.id), alert.alert_type, alert.priority, str(alert.resolved),
                alert.assignment.participant.participant_code if alert.assignment and alert.assignment.participant else '',
                alert.assignment.fitbit.fitbit_code if alert.assignment and alert.assignment.fitbit else '',
                alert.google_account.email if alert.google_account else '',
                format_date_madrid(alert.first_detected_at),
                format_date_madrid(alert.resolved_at),
                format_date_madrid(alert.created_at)
            ])
            has_data = True
        
        file_root = _generate_filename('alerts', filter_parts)

    # =========================================================
    # RESEARCHERS
    # =========================================================
    elif export_type == 'researchers':
        rows.append(['email', 'created_at', 'is_active'])
        User = get_user_model()
        for researcher in User.objects.all():
            rows.append([
                researcher.email,
                format_date_madrid(researcher.date_joined) if hasattr(researcher, 'date_joined') else '',
                str(researcher.is_active)
            ])
            has_data = True
        file_root = 'researchers'

    # =========================================================
    # SINCRONIZACIONES
    # =========================================================
    elif export_type == 'syncs':
        sync_date = request.GET.get('sync_date')
        if sync_date and sync_date.strip(): filter_parts.append(sync_date)

        rows.append(['sync_date_madrid', 'email', 'result', 'downloaded_records'])
        qs = SyncLog.objects.select_related('google_account').order_by('-sync_date')
        
        if sync_date and sync_date.strip():
            try:
                date_obj = datetime.strptime(sync_date.strip(), '%Y-%m-%d').date()
                start_dt = datetime.combine(date_obj, datetime.min.time(), tzinfo=local_tz)
                end_dt = datetime.combine(date_obj, datetime.max.time(), tzinfo=local_tz)
                qs = qs.filter(sync_date__range=(start_dt, end_dt))
            except ValueError:
                pass

        for log in qs:
            sync_local = log.sync_date.astimezone(local_tz)
            rows.append([
                sync_local.isoformat(),
                log.google_account.email if log.google_account else '',
                log.result,
                log.downloaded_records
            ])
            has_data = True
        
        file_root = _generate_filename('syncs', filter_parts)

    else:
        return _validation_error(request, 'invalid_export_type', status=400)

    if check_only:
        return JsonResponse({'ok': True, 'has_data': has_data, 'count': len(rows) - 1 if has_data else 0})

    if not has_data or len(rows) <= 1:
        return JsonResponse({'ok': False, 'error': 'No hay información para los filtros seleccionados'}, status=404)

    if export_format == 'xlsx':
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Datos"
        for row in rows: ws.append(row)

        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            ws.column_dimensions[col[0].column_letter].width = min(max_len + 2, 40)

        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        response = HttpResponse(output.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        response['Content-Disposition'] = f'attachment; filename="{file_root}.xlsx"'
    else:
        output = io.BytesIO()
        wrapper = io.TextIOWrapper(output, encoding='utf-8-sig', newline='')
        writer = csv.writer(wrapper, delimiter=';')
        for row in rows: writer.writerow(row)
        wrapper.flush()
        output.seek(0)
        response = HttpResponse(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{file_root}.csv"'

    return _add_cors_headers(request, response)


def _generate_filename(base_name, filter_parts):
    """
    Construye el nombre del archivo personalizado combinando base_name y filtros.
    Maneja tanto listas como valores individuales.
    """
    if not filter_parts:
        return base_name
    
    if not isinstance(filter_parts, list):
        filter_parts = [filter_parts]
    
    clean_parts = []
    for part in filter_parts:
        if part is not None:
            part_str = str(part).strip()
            if part_str and part_str.upper() != 'ALL':
                clean = part_str.replace(' ', '_').replace('/', '_').replace(':', '_').replace('\\', '_').lower()
                if len(clean) > 20:
                    clean = clean[:20]
                clean_parts.append(clean)
    
    # Si no hay partes limpias, devolver solo el nombre base
    if not clean_parts:
        return base_name
    
    if len(clean_parts) == 1:
        return f"{base_name}_{clean_parts[0]}"
    else:
        return f"{base_name}_{'_'.join(clean_parts)}"


@csrf_exempt
def api_synclogs(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'GET':
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)

    syncs = SyncLog.objects.select_related('google_account').order_by('-sync_date')[:100]
    items = [
        {
            'id': str(log.id),
            'sync_date': log.sync_date.isoformat() if log.sync_date else None,
            'email': log.google_account.email if log.google_account else None,
            'result': log.result,
            'downloaded_records': log.downloaded_records,
        }
        for log in syncs
    ]
    total_records = syncs.aggregate(Sum('downloaded_records'))['downloaded_records__sum'] or 0
    return _json_response(request, {'count': len(items), 'total_records': total_records, 'items': items})


@csrf_exempt
def api_clear_synclogs(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'POST':
        return _json_response(request, {'ok': False, 'error': 'method_not_allowed'}, status=405)
    
    if not _admin_required(request):
     return _json_response(request, {'ok': False, 'error': 'not_authorized'}, status=403)

    # Borramos todos los logs de sincronización
    SyncLog.objects.all().delete()
    return _json_response(request, {'ok': True, 'message': 'Historial de sincronizaciones vaciado correctamente'})


def _json_response(request, payload, status=200):
    resp = JsonResponse(payload, status=status)
    return _add_cors_headers(request, resp)


def _validation_error(request, message, status=400):
    return _json_response(request, {'ok': False, 'error': message}, status=status)


def _admin_required(request):
    return request.user.is_authenticated and request.user.is_superuser


def _researcher_required(request):
    return request.user.is_authenticated and not request.user.is_superuser


@csrf_exempt
def api_auth_status(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    data = {
        'authenticated': request.user.is_authenticated,
        'username': request.user.username if request.user.is_authenticated else None,
        'is_superuser': request.user.is_authenticated and request.user.is_superuser,
        'is_researcher': request.user.is_authenticated and not request.user.is_superuser,
    }
    return _json_response(request, data)


@csrf_exempt
def api_researcher_login(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)

    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = json.loads(request.body)
        username = data.get('username')
        password = data.get('password')
    except json.JSONDecodeError:
        return _validation_error(request, 'Invalid JSON format')

    # Validar que existan los datos
    if not username or not password:
        return _validation_error(request, 'missing_credentials')

    user = authenticate(request, username=username, password=password)

    if user is None:
        return _validation_error(request, 'invalid_credentials', status=401)

    if not user.is_active:
        return _validation_error(request, 'account_disabled', status=401)

    login(request, user)

    return _json_response(request, {
        'ok': True,
        'username': user.username,
        'is_researcher': True
    })


@csrf_exempt
def api_logout(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'POST':
        return _validation_error(request, 'method_not_allowed', status=405)

    logout(request)
    return _json_response(request, {'ok': True})


@csrf_exempt
def api_dashboard(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'GET':
        return _validation_error(request, 'method_not_allowed', status=405)

    participants_count = Participant.objects.count()
    fitbits = list(Fitbit.objects.all())
    active_fitbits = sum(1 for f in fitbits if f.operational_status == 'IN_USE')
    free_fitbits = sum(1 for f in fitbits if f.operational_status == 'FREE')
    maintenance_fitbits = sum(1 for f in fitbits if f.operational_status == 'MAINTENANCE')
    sync_logs = SyncLog.objects.all()
    success_count = sync_logs.filter(result__icontains='success').count()
    error_count = sync_logs.exclude(result__icontains='success').count()
    total_records = sync_logs.aggregate(Sum('downloaded_records'))['downloaded_records__sum'] or 0
    alerts_count = Alert.objects.filter(resolved=False).count()

    return _json_response(request, {
        'participants_count': participants_count,
        'active_fitbits': active_fitbits,
        'free_fitbits': free_fitbits,
        'maintenance_fitbits': maintenance_fitbits,
        'sync_success': success_count,
        'sync_error': error_count,
        'total_records': total_records,
        'alerts_count': alerts_count,
    })

@csrf_exempt
def api_admin_create_researcher(request):
    """El administrador autoriza un correo y envía un email con opciones de Sí/No."""
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'POST':
        return _validation_error(request, 'method_not_allowed', status=405)
    if not _admin_required(request):
        return _validation_error(request, 'not_authorized', status=403)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        return _validation_error(request, 'invalid_json')

    email = payload.get('email')
    if not email:
        return _validation_error(request, 'missing_email')

    if User.objects.filter(username=email).exists():
        return _validation_error(request, 'Ya existe un usuario con ese correo', status=409)

    # Creamos el usuario como inactivo (pendiente de aceptación)
    user = User.objects.create_user(username=email, email=email, is_active=False)
    user.set_unusable_password()
    user.save()

    # Generar enlaces de confirmación Sí / No usando codificación segura del email
    uid = urlsafe_base64_encode(force_bytes(email))
    frontend_url = config("FRONTEND_URL")
    backend_url = config("BACKEND_URL")
    
    yes_url = f"{backend_url}/api/auth/researcher/respond/?uid={uid}&action=yes"
    no_url = f"{backend_url}/api/auth/researcher/respond/?uid={uid}&action=no"

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verificación de cuenta - SENDA</title>
        <style>
            /* Estilos responsivos para clientes de correo */
            @media only screen and (max-width: 600px) {{
                .main-container {{
                    width: 100% !important;
                    border-radius: 0 !important;
                }}
                .content-padding {{
                    padding: 20px !important;
                }}
                .header-padding {{
                    padding: 20px 20px 16px 20px !important;
                }}
                .footer-padding {{
                    padding: 20px !important;
                }}
                .button-stack {{
                    display: block !important;
                    width: 100% !important;
                    margin-right: 0 !important;
                    margin-bottom: 12px !important;
                }}
                .button-full {{
                    display: block !important;
                    width: 100% !important;
                    box-sizing: border-box !important;
                }}
            }}
        </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto; background-color: #f1f5f9;">
            <tr>
                <td align="center" style="padding: 20px 0;">
                    <!-- Contenedor Principal (ancho fijo máx 600px, flexible en móvil) -->
                    <table border="0" cellpadding="0" cellspacing="0" class="main-container" width="600" style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        
                        <!-- Cabecera con Logo SENDA -->
                        <tr>
                            <td class="header-padding" style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #f1f5f9;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto;">
                                    <tr>
                                        <td class="header-padding" style="padding: 28px 40px 20px 40px; border-bottom: 1px solid #f1f5f9;">
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto;">
                                                <tr>
                                                    <td style="vertical-align: middle;">
                                                        <img 
                                                            src="https://senda.us.es/images/senda.png" 
                                                            alt="SENDA" 
                                                            width="150" 
                                                            style="display: block; border: 0; outline: none; text-decoration: none; max-height: 75px; width: auto;" />
                                                    </td>
                                                    <td align="right" style="vertical-align: middle; font-size: 12px; color: #64748b; font-weight: 600;">
                                                        Plataforma de investigación
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- Contenido del Mensaje -->
                        <tr>
                            <td class="content-padding" style="padding: 40px;">
                                <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 700; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                    Verificación de cuenta
                                </h2>
                                <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                    Hola,
                                </p>
                                <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                    Has sido autorizado/a para colaborar como investigador/a en la plataforma <strong style="color: #0f766e;">SENDA</strong> (Salud Emocional y Neurociencia para el Desarrollo de Andalucía).
                                </p>
                                <p style="margin: 0 0 28px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                    Para confirmar tu identidad y activar tu acceso, por favor elige una opción:
                                </p>

                                <!-- Botones de Acción (Sí / No) - Responsive Stack -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto; margin-bottom: 32px;">
                                    <tr>
                                        <td>
                                            <a href="{yes_url}" target="_blank" class="button-stack button-full" style="background-color: #059669; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block; margin-right: 12px; box-shadow: 0 2px 4px rgba(5, 150, 105, 0.2); text-align: center;">
                                                Sí, aceptar autorización
                                            </a>
                                            <a href="{no_url}" target="_blank" class="button-full" style="background-color: #ffffff; color: #dc2626; border: 1px solid #fca5a5; padding: 13px 24px; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px; display: inline-block; text-align: center;">
                                                No, rechazar
                                            </a>
                                        </td>
                                    </tr>
                                </table>

                                <!-- Tarjeta de Aviso de Seguridad -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
                                    <tr>
                                        <td style="padding: 16px 20px; font-size: 13px; color: #64748b; line-height: 1.5;">
                                            🔒 <strong>Aviso de seguridad:</strong> Si tú no has solicitado este acceso, puedes ignorar o rechazar este mensaje de forma segura.
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- Pie de Página -->
                        <tr>
                            <td class="footer-padding" style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto;">
                                    <tr>
                                        <td style="font-size: 12px; color: #64748b; line-height: 1.5;">
                                            Este enlace es seguro y único para ti.<br>
                                            Atentamente, <strong style="color: #0f766e;">Equipo SENDA</strong><br>
                                            Universidad de Sevilla
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    subject = 'Autorización como investigador/a en SENDA'
    from_email = config('DEFAULT_FROM_EMAIL')
    text_content = f"Hola,\n\nTe han autorizado como investigador/a en SENDA.\n\nAcepta la autorización aquí: {yes_url}\nO recházala aquí: {no_url}\n\nAtentamente,\nEquipo SENDA"

    email_msg = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=from_email,
        to=[email],
        reply_to=['admin@sendaproject.es'],
    )
    email_msg.attach_alternative(html_content, "text/html")
    email_msg.send(fail_silently=False)

    return _json_response(request, {'ok': True, 'email': email})


def researcher_response_view(request):
    """Vista que procesa cuando el investigador hace clic en Sí o No desde su correo."""
    uid = request.GET.get('uid')
    action = request.GET.get('action')

    if not uid or not action:
        return HttpResponse("Enlace inválido o incompleto.", status=400)

    try:
        email = force_str(urlsafe_base64_decode(uid))
        user = User.objects.get(username=email)
    except (TypeError, ValueError, OverflowError, User.DoesNotExist):
        return HttpResponse("Usuario no encontrado.", status=404)

    frontend_url = config("FRONTEND_URL")

    if action == 'yes':
        user.is_active = True
        user.save()
        return HttpResponse(
            f"<html><body style='font-family:sans-serif; text-align:center; padding-top:50px;'>"
            f"<h2 style='color:green;'>¡Autorización aceptada con éxito!</h2>"
            f"<p>Tu cuenta para el correo <b>{email}</b> ya está activa. Ya puedes iniciar sesión en SENDA.</p>"
            f"</body></html>"
        )
    elif action == 'no':
        user.delete() 
        return HttpResponse(
            f"<html><body style='font-family:sans-serif; text-align:center; padding-top:50px;'>"
            f"<h2 style='color:red;'>Autorización rechazada</h2>"
            f"<p>Has rechazado la invitación para el correo <b>{email}</b>. La cuenta ha sido descartada.</p>"
            f"</body></html>"
        )
    
    return HttpResponse("Acción no válida.", status=400)

@csrf_exempt
def api_researcher_request_code(request):
    """Paso 1 del Login: El investigador introduce su correo y se le envía un código temporal de un solo uso."""
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'POST':
        return _validation_error(request, 'method_not_allowed', status=405)

    try:
        data = json.loads(request.body)
        email = data.get('email')
    except json.JSONDecodeError:
        return _validation_error(request, 'Invalid JSON format')

    if not email:
        return _validation_error(request, 'missing_email')

    try:
        user = User.objects.get(username=email, is_superuser=False)
    except User.DoesNotExist:
        return _validation_error(request, 'email_not_authorized', status=404)

    # Generar código OTP temporal de un solo uso
    code = f"{random.randint(100000, 999999)}"
    cache.set(f"otp_{email}", code, timeout=300)  # 5 minutos de validez

    subject = 'Tu código de verificación - SENDA'
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Código de verificación - SENDA</title>
        <style>
            /* Estilos responsivos para clientes de correo */
            @media only screen and (max-width: 600px) {{
                .main-container {{
                    width: 100% !important;
                    border-radius: 0 !important;
                }}
                .content-padding {{
                    padding: 20px !important;
                }}
                .header-padding {{
                    padding: 20px 20px 16px 20px !important;
                }}
                .footer-padding {{
                    padding: 20px !important;
                }}
                .otp-text {{
                    font-size: 24px !important;
                    letter-spacing: 4px !important;
                }}
            }}
        </style>
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto; background-color: #f1f5f9;">
            <tr>
                <td align="center" style="padding: 20px 0;">
                    <!-- Contenedor Principal -->
                    <table border="0" cellpadding="0" cellspacing="0" class="main-container" width="600" style="background-color: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                        
                        <!-- Cabecera con Logo SENDA -->
                        <tr>
                            <td class="header-padding" style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #f1f5f9;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto;">
                                    <tr>
                                        <td class="header-padding" style="padding: 28px 40px 20px 40px; border-bottom: 1px solid #f1f5f9;">
                                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto;">
                                                <tr>
                                                    <td style="vertical-align: middle;">
                                                        <img 
                                                            src="https://senda.us.es/images/senda.png" 
                                                            alt="SENDA" 
                                                            width="150" 
                                                            style="display: block; border: 0; outline: none; text-decoration: none; max-height: 75px; width: auto;" />
                                                    </td>
                                                    <td align="right" style="vertical-align: middle; font-size: 12px; color: #64748b; font-weight: 600;">
                                                        Plataforma de investigación
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- Contenido del Mensaje -->
                        <tr>
                            <td class="content-padding" style="padding: 40px;">
                                <h2 style="margin: 0 0 20px 0; font-size: 20px; font-weight: 700; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                                    Código de acceso
                                </h2>
                                <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                    Hola,
                                </p>
                                <p style="margin: 0 0 24px 0; font-size: 15px; line-height: 1.6; color: #334155;">
                                    Has solicitado iniciar sesión en la plataforma <strong style="color: #0f766e;">SENDA</strong>. Utiliza el siguiente código de verificación de un solo uso (válido por 5 minutos):
                                </p>

                                <!-- Bloque Destacado del Código OTP - Responsive -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto; margin-bottom: 28px;">
                                    <tr>
                                        <td align="center" style="background-color: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 12px; padding: 20px;">
                                            <span class="otp-text" style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #0f766e;">{code}</span>
                                        </td>
                                    </tr>
                                </table>

                                <!-- Tarjeta de Aviso de Seguridad -->
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px;">
                                    <tr>
                                        <td style="padding: 16px 20px; font-size: 13px; color: #64748b; line-height: 1.5;">
                                            🔒 <strong>Aviso de seguridad:</strong> Si no has solicitado este código, puedes ignorar este mensaje con total seguridad. Nadie podrá acceder a tu cuenta sin él.
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                        <!-- Pie de Página -->
                        <tr>
                            <td class="footer-padding" style="background-color: #f8fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
                                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: auto;">
                                    <tr>
                                        <td style="font-size: 12px; color: #64748b; line-height: 1.5;">
                                            Este código es confidencial.<br>
                                            Atentamente, <strong style="color: #0f766e;">Equipo SENDA</strong><br>
                                            Universidad de Sevilla
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>

                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    """

    text_content = f"Hola,\n\nTu código de verificación para SENDA es: {code}\n\nEste código caduca en 5 minutos.\n\nAtentamente,\nEquipo SENDA"

    from_email = f"SENDA <{settings.DEFAULT_FROM_EMAIL}>"
    
    email_msg = EmailMultiAlternatives(
        subject=subject,
        body=text_content,
        from_email=from_email,
        to=[email],
        reply_to=['admin@sendaproject.es'],  
    )
    email_msg.attach_alternative(html_content, "text/html")
    email_msg.send(fail_silently=False)

    return _json_response(request, {'ok': True, 'message': 'Código enviado correctamente'})


@csrf_exempt
def api_researcher_verify_code(request):
    """Paso 2 del Login: El investigador introduce el código y accede directamente a la plataforma."""
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'POST':
        return _validation_error(request, 'method_not_allowed', status=405)

    try:
        data = json.loads(request.body)
        email = data.get('email')
        code = data.get('code')
    except json.JSONDecodeError:
        return _validation_error(request, 'Invalid JSON format')

    if not email or not code:
        return _validation_error(request, 'missing_credentials')

    cached_code = cache.get(f"otp_{email}")

    if not cached_code or str(cached_code) != str(code):
        return _validation_error(request, 'invalid_or_expired_code', status=401)

    try:
        user = User.objects.get(username=email, is_superuser=False)
        if not user.is_active:
            return _validation_error(request, 'La cuenta aún no ha sido verificada con el código inicial', status=403)
    except User.DoesNotExist:
        return _validation_error(request, 'email_not_authorized', status=404)

    # Invalidar el código usado para que no se pueda reutilizar
    cache.delete(f"otp_{email}")

    user.backend = 'django.contrib.auth.backends.ModelBackend'
    login(request, user)

    return _json_response(request, {
        'ok': True,
        'username': user.username,
        'is_researcher': True
    })


@csrf_exempt
def api_researcher_verify_registration(request):
    """Paso final del alta: El investigador verifica el código enviado por el admin para activar su cuenta."""
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'POST':
        return _validation_error(request, 'method_not_allowed', status=405)

    try:
        data = json.loads(request.body)
        email = data.get('email')
        code = data.get('code')
    except json.JSONDecodeError:
        return _validation_error(request, 'Invalid JSON format')

    if not email or not code:
        return _validation_error(request, 'missing_credentials')

    cached_code = cache.get(f"otp_{email}")

    if not cached_code or str(cached_code) != str(code):
        return _validation_error(request, 'invalid_or_expired_code', status=401)

    try:
        user = User.objects.get(username=email, is_superuser=False)
    except User.DoesNotExist:
        return _validation_error(request, 'user_not_found', status=404)

    # Activar la cuenta del investigador definitivamente
    user.is_active = True
    user.save()
    cache.delete(f"otp_{email}")

    return _json_response(request, {'ok': True, 'message': 'Cuenta verificada y activada con éxito'})


@csrf_exempt
def api_admin_delete_researcher(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'POST':
        return _validation_error(request, 'method_not_allowed', status=405)
    if not _admin_required(request):
        return _validation_error(request, 'not_authorized', status=403)

    try:
        payload = json.loads(request.body.decode('utf-8'))
        email = payload.get('email')
        user = User.objects.get(username=email)
        user.delete()
        return _json_response(request, {'ok': True})
    except User.DoesNotExist:
        return _validation_error(request, 'user_not_found', status=404)
    except Exception:
        return _validation_error(request, 'error_deleting')

    
@csrf_exempt
def api_admin_researchers(request):
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'GET':
        return _validation_error(request, 'method_not_allowed', status=405)
    if not _admin_required(request):
        return _validation_error(request, 'not_authorized', status=403)

    users = User.objects.filter(is_superuser=False).order_by('-date_joined')
    items = [
        {'email': user.email, 'created_at': user.date_joined.isoformat(), 'is_active': user.is_active}
        for user in users
    ]
    return _json_response(request, {'count': len(items), 'items': items})


@csrf_exempt
def api_admin_login(request):
    """Autentica un administrador usando username/password y crea sesión para /admin/.
    Se espera POST con JSON {username, password}.
    """
    if request.method == 'OPTIONS':
        resp = JsonResponse({'ok': True})
        resp['Access-Control-Allow-Methods'] = 'POST, OPTIONS'
        resp['Access-Control-Allow-Headers'] = 'Content-Type'
        return _add_cors_headers(request, resp)
    if request.method != 'POST':
        resp = JsonResponse({'ok': False, 'error': 'method_not_allowed'}, status=405)
        return _add_cors_headers(request, resp)

    try:
        payload = json.loads(request.body.decode('utf-8'))
    except Exception:
        resp = JsonResponse({'ok': False, 'error': 'invalid_json'}, status=400)
        return _add_cors_headers(request, resp)

    username = payload.get('username')
    password = payload.get('password')
    if not username or not password:
        resp = JsonResponse({'ok': False, 'error': 'missing_credentials'}, status=400)
        return _add_cors_headers(request, resp)

    user = authenticate(request, username=username, password=password)
    if user is None:
        resp = JsonResponse({'ok': False, 'error': 'invalid_credentials'}, status=401)
        return _add_cors_headers(request, resp)

    if not user.is_active or not user.is_superuser:
        resp = JsonResponse({'ok': False, 'error': 'No tiene permisos'}, status=403)
        return _add_cors_headers(request, resp)

    login(request, user)
    resp = JsonResponse({'ok': True, 'username': user.username, 'is_superuser': user.is_superuser})
    return _add_cors_headers(request, resp)




