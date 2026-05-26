FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    EMBEDDER_HOST=0.0.0.0 \
    EMBEDDER_PORT=18801 \
    EMBEDDER_MODEL=BAAI/bge-small-en-v1.5 \
    EMBEDDER_CACHE_DIR=/models

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends libgomp1 \
  && rm -rf /var/lib/apt/lists/*

COPY gateway/embedder/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

RUN python -c "\
from fastembed import TextEmbedding; \
m = TextEmbedding(model_name='BAAI/bge-small-en-v1.5', cache_dir='/models'); \
out = list(m.embed(['integrity check'])); \
assert len(out) == 1 and len(out[0]) == 384, 'model output shape mismatch'; \
"

COPY gateway/embedder/embedder.py /app/embedder.py
COPY gateway/daemons/sentry_init.py /app/sentry_init.py
COPY gateway/daemons/registry_config.py /app/registry_config.py
COPY gateway/daemons/memory_pressure.py /app/memory_pressure.py

RUN useradd -r -s /usr/sbin/nologin embedder && chown -R embedder:embedder /app /models

EXPOSE 18801

USER embedder
CMD ["python", "/app/embedder.py"]
