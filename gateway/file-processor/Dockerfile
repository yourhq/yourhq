FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY gateway/file-processor/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY gateway/daemons/file_processor.py /app/file_processor.py
COPY gateway/daemons/sentry_init.py /app/sentry_init.py
COPY gateway/daemons/registry_config.py /app/registry_config.py

CMD ["python", "/app/file_processor.py"]
