FROM oven/bun:latest

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN bun install

# install needed libraries for full liteparse functionalities
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    ca-certificates \
    libreoffice \
    imagemagick \
    && rm -rf /var/lib/apt/lists/*

# Copy source code
COPY . .

EXPOSE 5707

CMD ["bun", "run", "start:bun"]
