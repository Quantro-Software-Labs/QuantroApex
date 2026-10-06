FROM python:3.11-slim

# Build TA-Lib C library (not always available as a Debian package)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    wget \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && wget -q https://sourceforge.net/projects/ta-lib/files/ta-lib/0.4.0/ta-lib-0.4.0-src.tar.gz \
    && tar -xzf ta-lib-0.4.0-src.tar.gz \
    && cd ta-lib/ \
    && wget -q -O config.guess 'https://git.savannah.gnu.org/cgit/config.git/plain/config.guess' \
    && wget -q -O config.sub 'https://git.savannah.gnu.org/cgit/config.git/plain/config.sub' \
    && ./configure --prefix=/usr \
    && make \
    && make install \
    && cd .. \
    && rm -rf ta-lib ta-lib-0.4.0-src.tar.gz \
    && ldconfig

WORKDIR /app

COPY requirements.txt .
COPY requirements-train.txt .
RUN pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir -r requirements-train.txt

COPY . .

ENV CHECKPOINT_DIR=/app/checkpoints
ENV PYTHONUNBUFFERED=1
ENV PYTHONPATH=/app

EXPOSE 8002

# Default: streaming + query API
CMD ["python", "main.py", "all"]
