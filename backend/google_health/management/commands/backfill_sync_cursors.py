from django.core.management.base import BaseCommand
from django.db.models import Max
from google_health.models import (
    GoogleAccount, PhysiologicalData, SyncCursor, VariableType,
)

# Mapeo endpoint → variables que produce
ENDPOINT_VARIABLES = {
    'sleep': [
        VariableType.SLEEP_DURATION, VariableType.SLEEP_LIGHT,
        VariableType.SLEEP_DEEP, VariableType.SLEEP_REM,
        VariableType.SLEEP_AWAKE, VariableType.SLEEP_START,
        VariableType.SLEEP_END, VariableType.SLEEP_MINUTES_TO_FALL_ASLEEP,
        VariableType.SLEEP_MINUTES_ASLEEP, VariableType.SLEEP_AFTER_WAKE_UP,
    ],
    'steps': [VariableType.STEPS],
    'distance': [VariableType.DISTANCE],
    'heart-rate': [VariableType.HEART_RATE],
    'daily-resting-heart-rate': [VariableType.HEART_RATE_RESTING],
    'daily-heart-rate-variability': [
        VariableType.HRV_AVERAGE_MS, VariableType.HRV_ENTROPY,
        VariableType.HRV_NON_REM_HR, VariableType.HRV_RMSSD,
    ],
    'respiratory-rate-sleep-summary': [
        VariableType.RESPIRATORY_RATE_NOCTURNAL,
        VariableType.RESPIRATORY_RATE_LIGHT,
        VariableType.RESPIRATORY_RATE_DEEP,
        VariableType.RESPIRATORY_RATE_REM,
    ],
    'daily-heart-rate-zones': [
        VariableType.HR_ZONE_FAT_BURN, VariableType.HR_ZONE_CARDIO,
        VariableType.HR_ZONE_PEAK,
    ],
    'active-zone-minutes': [VariableType.ACTIVE_ZONE_MINUTES],
}


class Command(BaseCommand):
    help = 'Rellena SyncCursor con el MAX(physical_time) ya en BD por endpoint'

    def add_arguments(self, parser):
        parser.add_argument('--email', type=str, default=None)

    def handle(self, *args, **options):
        accounts = GoogleAccount.objects.filter(authentication_status='ACTIVE')
        if options.get('email'):
            accounts = accounts.filter(email=options['email'])

        for account in accounts:
            self.stdout.write(f'\n=== {account.email} ===')
            assignment = account.participant.assignments.order_by('-start_date').first()
            if not assignment:
                self.stdout.write(self.style.WARNING('  Sin assignment, se omite'))
                continue

            for endpoint, var_types in ENDPOINT_VARIABLES.items():
                last = (
                    PhysiologicalData.objects
                    .filter(assignment=assignment, variable_type__in=var_types)
                    .aggregate(m=Max('physical_time'))['m']
                )

                cursor, created = SyncCursor.objects.update_or_create(
                    google_account=account,
                    endpoint=endpoint,
                    defaults={'last_synced_at': last},
                )
                estado = 'creado' if created else 'actualizado'
                self.stdout.write(
                    f'  {endpoint:35s} → {last} ({estado})'
                )