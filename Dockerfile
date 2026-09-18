# ============================================================
# 阶段 1: 构建前端
# ============================================================
FROM node:22-alpine AS frontend-builder

WORKDIR /build/web

RUN corepack enable

# 复制整个前端目录，避免遗漏 pnpm-workspace.yaml / .npmrc 等配置
COPY web/ ./

RUN pnpm install --frozen-lockfile
RUN pnpm build


# ============================================================
# 阶段 2: 构建后端（嵌入前端产物）
# ============================================================
FROM golang:1.26-alpine AS backend-builder

RUN apk add --no-cache git bash ripgrep

WORKDIR /build

COPY go.mod go.sum ./
COPY agent/ ./agent/

RUN go mod download

COPY . .

# 将前端构建产物复制到后端嵌入目录
COPY --from=frontend-builder /build/web/dist ./web/dist

# 自动查找 main 包并编译（前端嵌入二进制）
RUN set -eux; \
    MAIN_PKG=$(go list -f '{{if eq .Name "main"}}{{.ImportPath}}{{end}}' ./... | grep -v '^$' | head -n 1); \
    echo "Building main package: $MAIN_PKG"; \
    test -n "$MAIN_PKG"; \
    CGO_ENABLED=0 go build -tags embedweb -o /build/denova "$MAIN_PKG"


# ============================================================
# 阶段 3: 运行镜像
# ============================================================
FROM alpine:3.21

RUN apk add --no-cache ca-certificates tzdata ripgrep git

RUN adduser -D -h /home/denova denova

WORKDIR /home/denova

COPY --from=backend-builder /build/denova /usr/local/bin/denova

RUN mkdir -p /home/denova/.denova /home/denova/workspace && \
    chown -R denova:denova /home/denova

USER denova

EXPOSE 8080

VOLUME ["/home/denova/workspace"]

ENTRYPOINT ["denova"]
CMD ["--workspace", "/home/denova/workspace"]
