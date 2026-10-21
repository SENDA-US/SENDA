import os
from celery import Celery

# módulo de configuración predeterminado de Django para Celery
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

app = Celery('backend')

app.config_from_object('django.conf:settings', namespace='CELERY')

# Carga automáticamente las tareas de los archivos tasks.py de las apps
app.autodiscover_tasks()