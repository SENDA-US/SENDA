from django.contrib import admin
from .models import Participant, Fitbit, GoogleAccount, Assignment, SyncLog, PhysiologicalData, VariableType, Alert


@admin.register(Participant)
class ParticipantAdmin(admin.ModelAdmin):
    list_display = ('participant_code',)
    search_fields = ('participant_code',)
    ordering = ('participant_code',)


@admin.register(Fitbit)
class FitbitAdmin(admin.ModelAdmin):
    list_display = ('fitbit_code', 'status')
    list_filter = ('status',)
    search_fields = ('fitbit_code',)
    ordering = ('fitbit_code',)


@admin.register(GoogleAccount)
class GoogleAccountAdmin(admin.ModelAdmin):
    list_display = ('email', 'participant', 'authentication_status', 'access_token_expiration')
    list_filter = ('authentication_status',)
    search_fields = ('email', 'participant__participant_code')
    ordering = ('email',)


class VariableTypeListFilter(admin.SimpleListFilter):
    title = 'variable fisiológica'
    parameter_name = 'variable_type'

    def lookups(self, request, model_admin):
        nombres_amigables = {
            # --- Datos diarios de sueño ---
            'SLEEP': 'Sueño: Sueño',
            'SLEEP_DURATION': 'Sueño: Duración total',
            'SLEEP_LIGHT': 'Sueño: Minutos ligero',
            'SLEEP_DEEP': 'Sueño: Minutos profundo',
            'SLEEP_REM': 'Sueño: Minutos REM',
            'SLEEP_AWAKE': 'Sueño: Tiempo despierto',
            'SLEEP_START_END': 'Sueño: Hora inicio y fin',

            # --- Variables fisiológicas diarias ---
            'HEART_RATE' : 'Frecuencia cardíaca',
            'HEART_RATE_RESTING': 'FC en Reposo',
            'HRV_NOCTURNAL': 'Variabilidad Cardíaca (HRV)',
            'RESPIRATORY_RATE_NOCTURNAL': 'Frecuencia Respiratoria Nocturna',

            # --- Actividad y zonas de frecuencia cardíaca ---
            'HR_ZONE_FAT_BURN': 'Zona: Quema de grasa',
            'HR_ZONE_CARDIO': 'Zona: Cardio',
            'HR_ZONE_PEAK': 'Zona: Pico',
            'ACTIVE_ZONE_MINUTES': 'Minutos Activos (AZM)',
            'STEPS': 'Pasos',
            'DISTANCE': 'Distancia',
        }
        return [(choice[0], nombres_amigables.get(choice[0], choice[1])) for choice in VariableType.choices]

    def queryset(self, request, queryset):
        if self.value():
            return queryset.filter(variable_type=self.value())
        return queryset


@admin.register(PhysiologicalData)
class PhysiologicalDataAdmin(admin.ModelAdmin):
    list_display = ('get_participant', 'variable_type', 'metric_value', 'physical_time', 'platform')
    list_filter = ('assignment__participant', VariableTypeListFilter, 'platform')
    search_fields = ('assignment__participant__participant_code',)
    date_hierarchy = 'physical_time'
    ordering = ('-physical_time',)

    def get_participant(self, obj):
        return obj.assignment.participant.participant_code
    get_participant.short_description = 'Participante'
    get_participant.admin_order_field = 'assignment__participant__participant_code'


@admin.register(Assignment)
class AssignmentAdmin(admin.ModelAdmin):
    list_display = ('participant', 'fitbit', 'start_date', 'estimated_end_date', 'real_end_date', 'status')
    list_filter = ('start_date',)
    search_fields = ('participant__participant_code', 'fitbit__fitbit_code')
    date_hierarchy = 'start_date'
    ordering = ('-start_date',)

    def status(self, obj):
        return obj.status
    status.short_description = 'Estado'


@admin.register(Alert)
class AlertAdmin(admin.ModelAdmin):
    list_display = ('alert_type', 'priority', 'resolved', 'created_at', 'get_target', 'get_email')
    list_filter = ('resolved', 'priority', 'alert_type', 'created_at')
    search_fields = ('message', 'google_account__email', 'assignment__participant__participant_code')
    date_hierarchy = 'created_at'
    ordering = ('-created_at',)

    def get_target(self, obj):
        if obj.assignment and obj.assignment.participant:
            return obj.assignment.participant.participant_code
        if obj.google_account:
            return obj.google_account.email
        return "N/A"
    get_target.short_description = 'Afectado'

    def get_email(self, obj):
        if obj.google_account:
            return obj.google_account.email
        if obj.assignment and hasattr(obj.assignment.participant, 'google_account'):
            return obj.assignment.participant.google_account.email
        return "-"
    get_email.short_description = 'Correo electrónico'


@admin.register(SyncLog)
class SyncLogAdmin(admin.ModelAdmin):
    list_display = ('google_account', 'sync_date', 'result', 'downloaded_records')
    list_filter = ('result', 'sync_date')
    search_fields = ('google_account__email', 'result')
    date_hierarchy = 'sync_date'
    ordering = ('-sync_date',)