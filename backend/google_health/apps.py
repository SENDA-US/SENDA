from django.apps import AppConfig

class GoogleHealthConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'google_health'

    def ready(self):
        import google_health.models  