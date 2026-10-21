# SENDA

**SENDA (Salud Emocional y Neurociencia para el Desarrollo de Andalucía)** es un proyecto de investigación del Departamento de Psicología Experimental y Psicología Social de la Universidad de Sevilla, financiado por la Fundación Centro de Estudios Andaluces (CENTRA), cuyo objetivo es estudiar la relación entre el bienestar emocional y diferentes variables fisiológicas de los participantes.<br>
Para ello, el proyecto utiliza dispositivos de monitorización de actividad **Fitbit Charge 6**, capaces de registrar de forma continua y no invasiva información relacionada con la actividad física y diversos parámetros fisiológicos, como la frecuencia cardíaca, el sueño, la actividad diaria o distintos indicadores asociados al estado fisiológico del participante.<br>
Estos datos se combinarán posteriormente con las medidas psicológicas y neurocientíficas obtenidas por el equipo investigador, permitiendo analizar la relación entre el estado emocional, los procesos cognitivos y diferentes indicadores objetivos de salud.


## Tecnologías utilizadas

**Backend**
- Python 3.12
- Django
- Celery + Redis

**Frontend**
- React + Vite
- TypeScript
- Tailwind CSS
- i18next

**Persistencia y despliegue**
- PostgreSQL
- Docker / Docker Compose

**APIs y seguridad**
- Google Health API
- Google Cloud (verificación en producción)
- OAuth 2.0


## Estado del proyecto

Funcionalidad completa.


## Requisitos previos

- Docker y Docker Compose instalados
- Cuenta de Google Cloud con proyecto configurado y acceso a Google Health API
- Credenciales OAuth 2.0 (Client ID / Client Secret) del proyecto de Google Cloud


## Instalación y despliegue

```bash
# Clonar el repositorio
git clone <URL_DEL_REPOSITORIO>
cd senda

# Copiar y completar las variables de entorno
cp .env.example .env

# Levantar los servicios (backend, frontend, base de datos, workers)
docker compose up -d --build
```


## Variables de entorno

Configurar en `.env` (no versionado):

| Variable | Descripción |
|---|---|
| `DJANGO_SECRET_KEY` | Clave secreta de Django |
| `DEBUG` | `True`/`False` según entorno |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | Credenciales de la base de datos |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Credenciales OAuth 2.0 de Google Cloud |
| `REDIS_URL` | URL de conexión a Redis (Celery) |


## Estructura del proyecto

La aplicación sigue una arquitectura en capas: presentación (React), lógica de negocio (Django), acceso a datos y persistencia (PostgreSQL).


