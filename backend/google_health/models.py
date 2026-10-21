import uuid
from django.db import models
from django.core.exceptions import ValidationError
from django.utils import timezone
from django.db.models.signals import post_save, post_delete, pre_delete, pre_save
from django.dispatch import receiver
from django.contrib.auth.hashers import make_password, check_password
from django.contrib.auth.models import User
from django.conf import settings
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape
from django.db.models import Q
from datetime import timedelta


# ==========================================
# ENUMERADOS
# ==========================================

class AssignmentStatus(models.TextChoices):
    PENDING = 'PENDING', 'Pending'
    ACTIVE = 'ACTIVE', 'Active'
    COMPLETED = 'COMPLETED', 'Completed'


class FitbitStatus(models.TextChoices):
    FREE = 'FREE', 'Free'
    IN_USE = 'IN_USE', 'In Use'
    INACTIVE = 'INACTIVE', 'Inactive'
    MAINTENANCE = 'MAINTENANCE', 'Maintenance'


class VariableType(models.TextChoices):
    # DATOS DE SUEÑO
    SLEEP_DURATION = 'SLEEP_DURATION', 'Duración total del sueño'
    SLEEP_LIGHT = 'SLEEP_LIGHT', 'Minutos en sueño ligero'
    SLEEP_DEEP = 'SLEEP_DEEP', 'Minutos en sueño profundo'
    SLEEP_REM = 'SLEEP_REM', 'Minutos en sueño REM'
    SLEEP_AWAKE = 'SLEEP_AWAKE', 'Tiempo despierto durante el periodo de sueño'
    SLEEP_START = 'SLEEP_START', 'Hora de inicio del sueño'
    SLEEP_END = 'SLEEP_END', 'Hora de finalización del sueño'
    SLEEP_MINUTES_TO_FALL_ASLEEP = 'SLEEP_MINUTES_TO_FALL_ASLEEP', 'Minutos hasta que te duermes'
    SLEEP_MINUTES_ASLEEP = 'SLEEP_MINUTES_ASLEEP', 'Minutos reales dormidos'
    SLEEP_AFTER_WAKE_UP = 'SLEEP_AFTER_WAKE_UP', 'Minutos despierto tras levantarse'

    # FRECUENCIA RESPIRATORIA 
    RESPIRATORY_RATE_NOCTURNAL = 'RESPIRATORY_RATE_NOCTURNAL', 'Frecuencia respiratoria global (respiraciones/min)'
    RESPIRATORY_RATE_LIGHT = 'RESPIRATORY_RATE_LIGHT', 'Frecuencia respiratoria en sueño ligero'
    RESPIRATORY_RATE_DEEP = 'RESPIRATORY_RATE_DEEP', 'Frecuencia respiratoria en sueño profundo'
    RESPIRATORY_RATE_REM = 'RESPIRATORY_RATE_REM', 'Frecuencia respiratoria en sueño REM'

    # VARIABLES FISIOLÓGICAS 
    HEART_RATE = 'HEART_RATE', 'Frecuencia cardíaca'
    HEART_RATE_RESTING = 'HEART_RATE_RESTING', 'Frecuencia cardíaca en reposo'
    HRV_AVERAGE_MS = 'HRV_AVERAGE_MS', 'Promedio de variabilidad cardíaca (ms)'
    HRV_RMSSD = 'HRV_RMSSD', 'RMSSD en sueño profundo (ms)'
    HRV_NON_REM_HR = 'HRV_NON_REM_HR', 'Frecuencia cardíaca en sueño no-REM (bpm)'
    HRV_ENTROPY = 'HRV_ENTROPY', 'Entropía de la variabilidad cardíaca'

    # ACTIVIDAD Y ZONAS CARDÍACAS 
    HR_ZONE_FAT_BURN = 'HR_ZONE_FAT_BURN', 'Minutos en zona de quema de grasa'
    HR_ZONE_CARDIO = 'HR_ZONE_CARDIO', 'Minutos en zona cardio'
    HR_ZONE_PEAK = 'HR_ZONE_PEAK', 'Minutos en zona pico'
    ACTIVE_ZONE_MINUTES = 'ACTIVE_ZONE_MINUTES', 'Minutos activos (Active Zone Minutes)'
    STEPS = 'STEPS', 'Pasos'
    DISTANCE = 'DISTANCE', 'Distancia'


class AlertPriority(models.TextChoices):
    HIGH = 'HIGH', 'Alta'
    MEDIUM = 'MEDIUM', 'Media'


class AlertType(models.TextChoices):
    SYNC_ERROR = 'SYNC_ERROR', 'Error de sincronización'
    NO_DATA_24H = 'NO_DATA_24H', 'Sin datos >24 horas'
    DEVICE_OFF = 'DEVICE_OFF', 'Pulsera apagada'
    LOW_BATTERY = 'LOW_BATTERY', 'Batería <20%'
    TOKEN_EXPIRED = 'TOKEN_EXPIRED', 'Token caducado'
    DEVICE_UNLINKED = 'DEVICE_UNLINKED', 'Dispositivo desvinculado'
    NO_RECORDS = 'NO_RECORDS', 'Participante sin registros'
    HRV_UNAVAILABLE = 'HRV_UNAVAILABLE', 'HRV no disponible'
    INSUFFICIENT_SLEEP = 'INSUFFICIENT_SLEEP', 'Sueño insuficiente'
    INSUFFICIENT_USAGE = 'INSUFFICIENT_USAGE', 'Tiempo de uso insuficiente'


ALERT_CATALOG = {
    AlertType.SYNC_ERROR: {
        'message': 'No ha sido posible sincronizar los datos del participante. Revise la conexión e inténtelo de nuevo.',
        'email_message': 'Por favor, revise la conexión a internet de tu móvil o reinícielo.',
        'priority': AlertPriority.HIGH,
    },
    AlertType.NO_DATA_24H: {
        'message': 'No se han recibido datos del participante en las últimas 24 horas. Compruebe que la pulsera está siendo utilizada y sincronizada correctamente.',
        'email_message': 'Por favor, compruebe que tiene bien puesta y ajustada la pulsera (y sincronícela desde la app Google Health).',
        'priority': AlertPriority.HIGH,
    },
    AlertType.DEVICE_OFF: {
        'message': 'La pulsera parece estar apagada o sin actividad. Solicite al participante que la encienda y sincronice con la aplicación Fitbit.',
        'email_message': 'Por favor, compruebe que la pulsera esté cargada y con batería suficiente.',
        'priority': AlertPriority.HIGH,
    },
    AlertType.LOW_BATTERY: {
        'message': 'La batería de la pulsera es inferior al 20%. Se recomienda recargar el dispositivo para evitar pérdidas de datos.',
        'email_message': 'Por favor, recargue su pulsera.',
        'priority': AlertPriority.MEDIUM,
    },
    AlertType.TOKEN_EXPIRED: {
        'message': 'No se puede acceder a los datos del participante. Es necesario volver a autorizar la conexión con Google Health.',
        'email_message': 'Por favor, póngase en contacto con los investigadores, es necesario volver a conectar su pulsera.',
        'priority': AlertPriority.HIGH,
    },
    AlertType.DEVICE_UNLINKED: {
        'message': 'La pulsera ya no está vinculada a la cuenta del participante. Compruebe la configuración de Fitbit y Google Health.',
        'email_message': 'Por favor, póngase en contacto con los investigadores, es necesario volver a conectar su pulsera.',
        'priority': AlertPriority.HIGH,
    },
    AlertType.NO_RECORDS: {
        'message': 'No existen datos registrados para este participante. Compruebe que el proceso de vinculación se ha completado correctamente.',
        'email_message': 'Por favor, póngase en contacto con los investigadores, es necesario volver a conectar su pulsera.',
        'priority': AlertPriority.HIGH,
    },
    AlertType.HRV_UNAVAILABLE: {
        'message': 'No se ha podido obtener la variabilidad de la frecuencia cardíaca (HRV) para este día. Esto puede deberse a un tiempo de uso insuficiente durante el sueño o a una calidad de señal inadecuada.',
        'email_message': 'Por favor, recuerde no quitarse la pulsera para dormir, es importante el registro del sueño.',
        'priority': AlertPriority.MEDIUM,
    },
    AlertType.INSUFFICIENT_SLEEP: {
        'message': 'Se ha registrado un tiempo de sueño insuficiente para obtener todas las métricas fisiológicas.',
        'email_message': 'Por favor, recuerde no quitarse la pulsera para dormir, es importante el registro del sueño.',
        'priority': AlertPriority.MEDIUM,
    },
    AlertType.INSUFFICIENT_USAGE: {
        'message': 'La pulsera ha sido utilizada menos de 18 horas durante el día. Algunas variables fisiológicas pueden estar incompletas.',
        'email_message': 'Por favor, recuerde no quitarse la pulsera a lo largo del día.',
        'priority': AlertPriority.MEDIUM,
    },
}


# ==========================================
# ENTIDADES
# ==========================================

class Participant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant_code = models.CharField(max_length=100, unique=True)
    email = models.EmailField(unique=True, null=True, blank=True)
    password_hash = models.CharField(max_length=128, blank=True)

    def set_password(self, raw_password):
        self.password_hash = make_password(raw_password)

    def check_password(self, raw_password):
        return check_password(raw_password, self.password_hash)

    def __str__(self):
        return self.participant_code


class Fitbit(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    fitbit_code = models.CharField(max_length=100, unique=True)
    status = models.CharField(
        max_length=20,
        choices=FitbitStatus.choices,
        default=FitbitStatus.FREE
    )

    @property
    def operational_status(self):
        if self.status in (FitbitStatus.MAINTENANCE, FitbitStatus.INACTIVE):
            return self.status

        now = timezone.localtime(timezone.now())
        tz = timezone.get_current_timezone()

        active = self.assignments.filter(
            start_date__lte=now
        ).filter(
            models.Q(estimated_end_date__isnull=True) | models.Q(estimated_end_date__gte=now)
        ).exists()

        return FitbitStatus.IN_USE if active else FitbitStatus.FREE

    def __str__(self):
        return f"Fitbit {self.fitbit_code}"


class GoogleAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.OneToOneField(Participant, on_delete=models.CASCADE, related_name='google_account')
    email = models.EmailField(unique=True)
    access_token = models.TextField(blank=True, default='')
    refresh_token = models.TextField(blank=True, default='')
    access_token_expiration = models.DateTimeField(null=True, blank=True)
    authentication_status = models.CharField(max_length=50, default='PENDING')

    def __str__(self):
        return self.email


@receiver(post_save, sender=Participant)
def create_pending_google_account_for_participant(sender, instance, created, **kwargs):
    if not instance.email:
        return

    try:
        google_account = instance.google_account
        if google_account.email != instance.email:
            google_account.email = instance.email
            google_account.save(update_fields=['email'])
        return
    except GoogleAccount.DoesNotExist:
        pass

    existing = GoogleAccount.objects.filter(email__iexact=instance.email).first()
    if existing:
        existing.participant = instance
        existing.save(update_fields=['participant'])
        return

    GoogleAccount.objects.create(
        participant=instance,
        email=instance.email,
        access_token='',
        refresh_token='',
        access_token_expiration=None,
        authentication_status='PENDING'
    )


class Assignment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    participant = models.ForeignKey(Participant, on_delete=models.CASCADE, related_name='assignments')
    fitbit = models.ForeignKey(Fitbit, on_delete=models.CASCADE, related_name='assignments')
    start_date = models.DateTimeField()
    estimated_end_date = models.DateTimeField(blank=True, null=True)  
    real_end_date = models.DateTimeField(blank=True, null=True)       

    @property
    def status(self):
        # Si tiene fecha de fin real, ya está completada independientemente de la fecha estimada
        if self.real_end_date:
            return AssignmentStatus.COMPLETED

        tz = timezone.get_current_timezone()
        now = timezone.localtime(timezone.now(), timezone=tz)

        start = self.start_date
        if timezone.is_naive(start):
            start = timezone.make_aware(start, tz)
        start = timezone.localtime(start, timezone=tz)

        if start > now:
            return AssignmentStatus.PENDING

        if self.estimated_end_date:
            end = self.estimated_end_date
            if timezone.is_naive(end):
                end = timezone.make_aware(end, tz)
            end = timezone.localtime(end, timezone=tz)
            if end < now:
                return AssignmentStatus.COMPLETED

        return AssignmentStatus.ACTIVE

    
    def clean(self):
        super().clean()
        if not self.start_date:
            return

        # Forzar zona horaria actual (maneja el desfase de la hora europea)
        tz = timezone.get_current_timezone()
        if timezone.is_naive(self.start_date):
            self.start_date = timezone.make_aware(self.start_date, tz)
        
        if self.estimated_end_date and timezone.is_naive(self.estimated_end_date):
            self.estimated_end_date = timezone.make_aware(self.estimated_end_date, tz)

        if self.estimated_end_date and self.estimated_end_date <= self.start_date:
            raise ValidationError("La fecha de finalización estimada debe ser posterior a la fecha de inicio.")

        overlapping = Assignment.objects.filter(fitbit=self.fitbit)
        if self.pk:
            overlapping = overlapping.exclude(pk=self.pk)

        for existing in overlapping:
            ex_start = existing.start_date
            ex_end = existing.estimated_end_date

            if not ex_end:
                raise ValidationError(f"La pulsera {self.fitbit.fitbit_code} ya está asignada de forma indefinida.")

            new_end = self.estimated_end_date if self.estimated_end_date else timezone.now() + timezone.timedelta(days=3650)

            if self.start_date <= ex_end and new_end >= ex_start:
                raise ValidationError(
                    f"Conflicto de fechas: La pulsera {self.fitbit.fitbit_code} ya está asignada a "
                    f"{existing.participant.participant_code} del {ex_start.strftime('%d/%m/%Y')} al {ex_end.strftime('%d/%m/%Y')}."
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Assignment: {self.participant.participant_code} -> {self.fitbit.fitbit_code} ({self.status})"


class SyncLog(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    google_account = models.ForeignKey(GoogleAccount, on_delete=models.CASCADE, related_name='sync_logs')
    sync_date = models.DateTimeField(auto_now_add=True)
    result = models.CharField(max_length=100)
    downloaded_records = models.IntegerField(default=0)

    def __str__(self):
        return f"Sync {self.sync_date} - {self.result}"


class SyncCursor(models.Model):
    """
    Estado de sincronización incremental por (cuenta, endpoint).
    Guarda el timestamp del último dataPoint descargado con éxito.
    Sirve para que cada ciclo pida a Google solo lo nuevo.
    """
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    google_account = models.ForeignKey(
        GoogleAccount,
        on_delete=models.CASCADE,
        related_name='sync_cursors',
    )
    endpoint = models.CharField(max_length=100)
    last_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text='Timestamp del último dataPoint sincronizado (UTC)',
    )
    last_sync_started_at = models.DateTimeField(null=True, blank=True)
    last_sync_finished_at = models.DateTimeField(null=True, blank=True)
    last_sync_records = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('google_account', 'endpoint')]
        indexes = [
            models.Index(fields=['google_account', 'endpoint']),
        ]

    def __str__(self):
        return f"{self.google_account.email} | {self.endpoint} | {self.last_synced_at}"


class PhysiologicalData(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(Assignment, on_delete=models.CASCADE, related_name='physiological_data')
    variable_type = models.CharField(max_length=100, choices=VariableType.choices)
    physical_time = models.DateTimeField()
    start_time = models.DateTimeField(blank=True, null=True)
    end_time = models.DateTimeField(blank=True, null=True)
    metric_value = models.FloatField(null=True, blank=True)
    device_name = models.CharField(max_length=100, blank=True, null=True)
    platform = models.CharField(max_length=100, blank=True, null=True)
    recording_method = models.CharField(max_length=100, blank=True, null=True)

    def __str__(self):
        return f"{self.variable_type}: {self.metric_value} at {self.physical_time}"

    class Meta:
        indexes = [
            models.Index(
                fields=['physical_time'],
                name='idx_physio_time',
            ),
            models.Index(
                fields=['variable_type', 'physical_time'],
                name='idx_physio_var_time',
            ),
            models.Index(
                fields=['assignment', 'variable_type', 'physical_time'],
                name='idx_physio_assign_var_time',
            ),
        ]


class Alert(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    assignment = models.ForeignKey(
        Assignment,
        on_delete=models.CASCADE,
        related_name='alerts',
        null=True,
        blank=True,
    )
    google_account = models.ForeignKey(
        GoogleAccount,
        on_delete=models.CASCADE,
        related_name='alerts',
        null=True,
        blank=True,
    )
    alert_type = models.CharField(max_length=50, choices=AlertType.choices)
    priority = models.CharField(max_length=20, choices=AlertPriority.choices)
    message = models.TextField()
    details = models.JSONField(default=dict, blank=True)
    first_detected_at = models.DateTimeField(default=timezone.now)
    last_detected_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved = models.BooleanField(default=False)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.message or not self.priority:
            catalog_entry = ALERT_CATALOG[self.alert_type]
            self.message = (self.message or catalog_entry['message'])
            self.priority = (self.priority or catalog_entry['priority'])

        super().save(*args, **kwargs)

    def __str__(self):
        return (
            f"[{self.priority}] "
            f"{self.get_alert_type_display()}"
        )


def activate_alert(
    alert_type,
    google_account=None,
    assignment=None,
    message=None,
    details=None,
):
    """
    Crea o actualiza una alerta.
    Regla anti-spam: no se crea más de UNA alerta por
    (tipo + participante/asignación + cuenta) al día.
    """
    if not assignment and not google_account:
        return None

    base_filters = {'alert_type': alert_type}
    if assignment:
        base_filters['assignment'] = assignment
    if google_account:
        base_filters['google_account'] = google_account

    catalog_entry = ALERT_CATALOG[alert_type]
    default_message = catalog_entry['message']
    priority = catalog_entry['priority']

    # ------------------------------------------------------------------
    # Si existe una alerta ACTIVA del mismo tipo, actualizamos su
    # estado, sin reenviar correo.
    # ------------------------------------------------------------------
    active_alert = Alert.objects.filter(**base_filters, resolved=False).first()
    if active_alert:
        active_alert.message = message or default_message
        active_alert.details = details or {}
        active_alert.last_detected_at = timezone.now()
        active_alert.save(
            update_fields=[
                'message',
                'details',
                'last_detected_at',
            ]
        )
        return active_alert

    # ------------------------------------------------------------------
    # Si se ha creado o resulto una alerta del mismo tipo hoy, 
    # no volvemos a crearla hasta el día siguiente.
    # ------------------------------------------------------------------
    today_local = timezone.localdate()
    already_today = Alert.objects.filter(**base_filters).filter(
        Q(first_detected_at__date=today_local) |
        Q(resolved_at__date=today_local)
    ).exists()

    if already_today:
        return None   # silencio hasta mañana

    # ------------------------------------------------------------------
    # Crear nueva alerta + enviar correo
    # ------------------------------------------------------------------
    new_alert = Alert.objects.create(
        alert_type=alert_type,
        google_account=google_account,
        assignment=assignment,
        priority=priority,
        message=message or default_message,
        details=details or {},
        first_detected_at=timezone.now(),
        last_detected_at=timezone.now(),
        resolved=False,
    )

    # Enviar notificación por email al participante y a los investigadores activos
    send_alert_notification_emails(new_alert)

    return new_alert


def resolve_alert_automatically(
    alert_type,
    google_account=None,
    assignment=None,
):
    """
    Resuelve automáticamente una alerta cuando el problema desaparece.
    """

    filters = {
        'alert_type': alert_type,
        'resolved': False,
    }

    if assignment:
        filters['assignment'] = assignment

    if google_account:
        filters['google_account'] = google_account

    Alert.objects.filter(**filters).update(
        resolved=True,
        resolved_at=timezone.now()
    )

import logging
logger = logging.getLogger(__name__)

def send_alert_notification_emails(alert):
    """
    Envía un correo de alerta a:
      1. El participante afectado (si tiene un email de GoogleAccount vinculado)
         → recibe el mensaje 'email_message' (lenguaje cercano, orientado a acción).
      2. Todos los investigadores activos (is_active=True, is_superuser=False)
         → reciben el mensaje técnico + el 'email_message' como contexto.
    """
    print(f"[ALERT_EMAIL] Invocado para alerta {alert.id} ({alert.alert_type})")

    catalog_entry = ALERT_CATALOG.get(alert.alert_type, {})
    email_message = catalog_entry.get('email_message', alert.message)

    # ---------- Contexto ----------
    participant_code = "N/A"
    fitbit_code = "N/A"
    participant_email = None

    if alert.assignment:
        if alert.assignment.participant:
            participant_code = alert.assignment.participant.participant_code
        if alert.assignment.fitbit:
            fitbit_code = alert.assignment.fitbit.fitbit_code

    if alert.google_account and alert.google_account.email:
        participant_email = alert.google_account.email
    elif alert.assignment and alert.assignment.participant:
        gacc = GoogleAccount.objects.filter(participant=alert.assignment.participant).first()
        if gacc:
            participant_email = gacc.email

    # Destinatarios 
    researcher_emails = list(
        User.objects.filter(is_active=True, is_superuser=False)
        .exclude(email='')
        .values_list('email', flat=True)
    )

    from_email = settings.DEFAULT_FROM_EMAIL or settings.EMAIL_HOST_USER

    # ==========================================================
    # 1) CORREO AL PARTICIPANTE
    # ==========================================================
    if participant_email:
        subject_p = f"[SENDA] Acción requerida: {alert.get_alert_type_display()}"

        text_participant = (
            f"Hola,\n\n"
            f"Se ha detectado una incidencia en tu pulsera:\n\n"
            f"{email_message}\n\n"
            f"Atentamente,\nEquipo SENDA · Universidad de Sevilla"
        )

        html_participant = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; }}
                .container {{ max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; margin: 0 auto; }}
                .header {{ background: #1d5a3d; color: #ffffff; padding: 24px; text-align: center; font-size: 18px; font-weight: bold; }}
                .content {{ padding: 30px; color: #334155; font-size: 15px; line-height: 1.7; }}
                .action {{ background: #ecfdf5; border-left: 4px solid #10b981; padding: 16px 20px; border-radius: 8px; font-size: 16px; color: #065f46; font-weight: 600; margin: 20px 0; }}
                .footer {{ background: #f8fafc; padding: 16px 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">Plataforma SENDA</div>
                <div class="content">
                    <p>Hola,</p>
                    <p>Se ha detectado una incidencia en tu pulsera:</p>
                    <div class="action">{email_message}</div>
                </div>
                <div class="footer">
                    Equipo SENDA · Universidad de Sevilla
                </div>
            </div>
        </body>
        </html>
        """

        try:
            msg_p = EmailMultiAlternatives(
                subject=subject_p,
                body=text_participant,
                from_email=from_email,
                to=[participant_email],
                reply_to=['admin@sendaproject.es'],
            )
            msg_p.attach_alternative(html_participant, "text/html")
            n = msg_p.send(fail_silently=False)
            print(f"[ALERT_EMAIL] ✅ Participante ({participant_email}): {n} enviado(s)")
        except Exception as e:
            import traceback
            print(f"[ALERT_EMAIL] ❌ Error enviando al participante {participant_email}: {e}")
            traceback.print_exc()

    # ==========================================================
    # 2) CORREO A INVESTIGADORES
    # ==========================================================
    if researcher_emails:
        subject_r = f"[SENDA - Alerta] {alert.get_alert_type_display()} ({alert.priority}) · {participant_code}"

        text_researcher = (
            f"Se ha generado una nueva alerta en la plataforma SENDA.\n\n"
            f"Tipo:        {alert.get_alert_type_display()}\n"
            f"Prioridad:   {alert.priority}\n"
            f"Participante:{participant_code}\n"
            f"Dispositivo: {fitbit_code}\n"
            f"Email part.: {participant_email or 'N/A'}\n\n"
            f"Mensaje técnico: {alert.message}\n"
            f"Mensaje enviado al participante: {email_message}\n\n"
            f"Accede a la plataforma para gestionarla."
        )

        html_researcher = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f1f5f9; margin: 0; padding: 20px; }}
                .container {{ max-width: 600px; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; margin: 0 auto; }}
                .header {{ background: #1d5a3d; color: #ffffff; padding: 24px; text-align: center; font-size: 18px; font-weight: bold; }}
                .content {{ padding: 30px; color: #334155; font-size: 14px; line-height: 1.6; }}
                .badge {{ display: inline-block; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: bold; background: #fee2e2; color: #991b1b; }}
                .info {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 18px; margin: 16px 0; font-size: 13px; }}
                .email-msg {{ background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; border-radius: 6px; font-style: italic; color: #1e40af; margin-top: 12px; }}
                .footer {{ background: #f8fafc; padding: 16px 30px; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">Plataforma SENDA - Notificación de Incidencia</div>
                <div class="content">
                    <p>Se ha registrado una nueva incidencia que requiere supervisión:</p>
                    <p><strong>Tipo de Alerta:</strong> {escape(alert.get_alert_type_display())}<br>
                    <strong>Prioridad:</strong> <span class="badge">{escape(alert.priority)}</span></p>

                    <div class="info">
                        <strong>Participante:</strong> {participant_code}<br>
                        <strong>Dispositivo:</strong> {fitbit_code}<br>
                        <strong>Email participante:</strong> {participant_email or 'N/A'}
                    </div>

                    <p><strong>Mensaje técnico (plataforma):</strong><br>
                    {alert.message}</p>

                    <p><strong>Mensaje enviado al participante:</strong></p>
                    <div class="email-msg">{email_message}</div>
                </div>
                <div class="footer">
                    Plataforma SENDA · Universidad de Sevilla
                </div>
            </div>
        </body>
        </html>
        """

        try:
            msg_r = EmailMultiAlternatives(
                subject=subject_r,
                body=text_researcher,
                from_email=from_email,
                to=researcher_emails,
                reply_to=['admin@sendaproject.es'],
            )
            msg_r.attach_alternative(html_researcher, "text/html")
            n = msg_r.send(fail_silently=False)
            print(f"[ALERT_EMAIL] ✅ Investigadores ({len(researcher_emails)}): {n} enviado(s)")
        except Exception as e:
            import traceback
            print(f"[ALERT_EMAIL] ❌ Error enviando a investigadores: {e}")
            traceback.print_exc()


# ==========================================
# SEÑALES PARA ACTUALIZAR FITBIT
# ==========================================

@receiver(pre_save, sender=Assignment)
def capture_previous_fitbit(sender, instance, **kwargs):
    if instance.pk:
        try:
            previous = Assignment.objects.get(pk=instance.pk)
            if previous.fitbit_id != instance.fitbit_id:
                instance._previous_fitbit_id = previous.fitbit_id
        except Assignment.DoesNotExist:
            pass


@receiver(post_save, sender=Assignment)
def update_fitbit_status(sender, instance, **kwargs):
    if instance.fitbit:
        real_status = instance.fitbit.operational_status
        if instance.fitbit.status != real_status:
            instance.fitbit.status = real_status
            instance.fitbit.save()

    previous_fitbit_id = getattr(instance, '_previous_fitbit_id', None)
    if previous_fitbit_id:
        try:
            previous_fitbit = Fitbit.objects.get(pk=previous_fitbit_id)
            real_status = previous_fitbit.operational_status
            if previous_fitbit.status != real_status:
                previous_fitbit.status = real_status
                previous_fitbit.save()
        except Fitbit.DoesNotExist:
            pass


@receiver(post_delete, sender=Assignment)
def update_fitbit_status_on_delete(sender, instance, **kwargs):
    if instance.fitbit_id:
        try:
            fitbit = Fitbit.objects.get(pk=instance.fitbit_id)
            real_status = fitbit.operational_status
            if fitbit.status != real_status:
                fitbit.status = real_status
                fitbit.save()
        except Fitbit.DoesNotExist:
            pass


@receiver(pre_delete, sender=Participant)
def capture_fitbits_before_delete(sender, instance, **kwargs):
    fitbit_ids = list(
        instance.assignments.values_list('fitbit_id', flat=True).distinct()
    )
    instance._fitbits_to_recheck = fitbit_ids


@receiver(post_delete, sender=Participant)
def recheck_fitbits_after_delete(sender, instance, **kwargs):
    fitbit_ids = getattr(instance, '_fitbits_to_recheck', [])
    if not fitbit_ids:
        return

    for fitbit in Fitbit.objects.filter(id__in=fitbit_ids):
        real_status = fitbit.operational_status
        if fitbit.status != real_status:
            fitbit.status = real_status
            fitbit.save()


@receiver(post_save, sender=GoogleAccount)
def check_token_or_sync_error(sender, instance, created, **kwargs):
    """Si hay problemas de autenticación o estado crítico en la cuenta."""
    if instance.authentication_status and instance.authentication_status != 'ACTIVE':
        activate_alert(AlertType.TOKEN_EXPIRED, google_account=instance)
    else:
        # Si vuelve a estar activa, resolvemos automáticamente la alerta de token
        Alert.objects.filter(google_account=instance, alert_type=AlertType.TOKEN_EXPIRED, resolved=False).update(
            resolved=True, resolved_at=timezone.now()
        )