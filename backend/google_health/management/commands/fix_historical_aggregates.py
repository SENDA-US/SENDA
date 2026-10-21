from django.core.management.base import BaseCommand
from django.core.management import call_command
from django.utils import timezone
from datetime import timedelta, date
from google_health.models import Assignment


class Command(BaseCommand):
    help = 'Reprocesa STEPS/DISTANCE desde una fecha hasta ayer para todas las asignaciones'

    def add_arguments(self, parser):
        parser.add_argument('--from', dest='date_from', type=str, required=True,
                            help='Fecha inicio YYYY-MM-DD')
        parser.add_argument('--to', dest='date_to', type=str, default=None,
                            help='Fecha fin YYYY-MM-DD (por defecto: ayer)')
        parser.add_argument('--email', type=str, default=None)

    def handle(self, *args, **options):
        date_from = options['date_from']
        if options['date_to']:
            date_to = options['date_to']
        else:
            date_to = (timezone.localtime(timezone.now()).date() - timedelta(days=1)).isoformat()

        # Llamar al comando existente para todo el rango (una sola ejecución)
        self.stdout.write(f'Reprocesando desde {date_from} hasta {date_to}...')
        call_command(
            'reprocess_daily_aggregates',
            '--from', date_from,
            '--to', date_to,
            **({'email': options['email']} if options.get('email') else {})
        )
        self.stdout.write(self.style.SUCCESS('Histórico arreglado'))