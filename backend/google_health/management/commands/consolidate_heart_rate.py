from django.core.management.base import BaseCommand
from django.db import transaction, connection
from django.db.models import Avg, Count
from django.db.models.functions import TruncMinute
from datetime import timedelta
from google_health.models import PhysiologicalData, VariableType


class Command(BaseCommand):
    help = 'Consolida HEART_RATE: agrupa por minuto y guarda la media'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Solo simula')
        parser.add_argument('--batch-size', type=int, default=500)

    def handle(self, *args, **options):
        dry_run = options['dry_run']

        self.stdout.write('Contando grupos de HEART_RATE por (assignment, minuto)...')

        aggregates = (
            PhysiologicalData.objects
            .filter(variable_type=VariableType.HEART_RATE)
            .annotate(minute=TruncMinute('physical_time'))
            .values('assignment_id', 'minute')
            .annotate(avg=Avg('metric_value'), cnt=Count('id'))
            .filter(cnt__gt=1)
        )

        total = aggregates.count()
        self.stdout.write(self.style.WARNING(f'Grupos con >1 registro: {total:,}'))

        if dry_run or total == 0:
            self.stdout.write('Dry-run: nada modificado')
            return

        self.stdout.write('Iniciando consolidación...')

        processed = 0
        errors = 0
        for agg in aggregates.iterator(chunk_size=options['batch_size']):
            assignment_id = agg['assignment_id']
            minute = agg['minute']
            avg_value = float(agg['avg'])

            try:
                with transaction.atomic():
                    qs = PhysiologicalData.objects.filter(
                        assignment_id=assignment_id,
                        variable_type=VariableType.HEART_RATE,
                        physical_time__gte=minute,
                        physical_time__lt=minute + timedelta(minutes=1),
                    ).order_by('id')

                    first = qs.first()
                    if not first:
                        continue

                    first.metric_value = round(avg_value, 1)
                    first.physical_time = minute
                    first.start_time = minute
                    first.end_time = minute
                    first.save(update_fields=['metric_value', 'physical_time', 'start_time', 'end_time'])

                    ids_to_delete = list(qs.exclude(id=first.id).values_list('id', flat=True))
                    if ids_to_delete:
                        PhysiologicalData.objects.filter(id__in=ids_to_delete).delete()

                processed += 1
                if processed % 500 == 0:
                    self.stdout.write(f'  {processed:,}/{total:,} ({100*processed//total}%)')

            except Exception as e:
                errors += 1
                if errors <= 5:
                    self.stdout.write(self.style.ERROR(f'  Error en grupo {assignment_id}/{minute}: {e}'))

        self.stdout.write(self.style.SUCCESS(
            f'Completado: {processed:,} grupos consolidados, {errors} errores'
        ))